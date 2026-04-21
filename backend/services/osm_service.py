"""
OSM Auto-Fetch Service

Загружает пространственные данные из OpenStreetMap через OSMnx:
  - объекты социальной инфраструктуры в радиусе 30 км
  - граф транспортной сети в радиусе 30 км
  - граф пешеходной сети в радиусе 3 км

Сохраняет данные в PostGIS. После загрузки инвалидирует все кэши.
"""

import json
import logging
import math
import os
from functools import lru_cache
from typing import Tuple

import osmnx as ox
from shapely.geometry import Point

# overpass_url в 2.x — базовый путь без /interpreter
ox.settings.requests_timeout  = 120   # таймаут одного запроса; быстрее упасть и попробовать fallback
ox.settings.use_cache         = True  # повторные запросы к тому же bbox из кэша
ox.settings.overpass_rate_limit = False  # не делать pre-запрос к Overpass за «слотом» (сам по себе может timeout'ить)

_OVERPASS_PRIMARY  = "https://overpass-api.de/api"
_OVERPASS_FALLBACK = "https://lz4.overpass-api.de/api"

logger = logging.getLogger(__name__)

# Радиусы загрузки (метры)
INFRA_RADIUS_M  = 15_000
DRIVE_RADIUS_M  =  5_000   # только ближайшие дороги для коротких изохрон
WALK_RADIUS_M   =  2_000

# Фильтр транспортного графа — уровень 1: только магистральные дороги (быстро).
# Если граф окажется пустым (сельская местность), автоматически применяется уровень 2.
DRIVE_FILTER_L1 = (
    '["highway"~"motorway|motorway_link|trunk|trunk_link'
    '|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link"]'
)
# Уровень 2: все проезжие дороги включая residential/unclassified (полный drive-граф).
DRIVE_FILTER_L2 = None  # None → network_type='drive' (стандартный фильтр OSMnx)

# Порог покрытия файловых данных: если ближайшее здание дальше — точка не покрыта
_FILE_COVERAGE_THRESHOLD_M = 5_000

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@lru_cache(maxsize=1)
def _get_file_building_coords() -> list:
    """Возвращает список (lat, lon) жилых зданий из локального GeoJSON (кэшируется)."""
    path = os.path.join(_BASE_DIR, "data", "residential_buildings_points.geojson")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return [
        (feat["geometry"]["coordinates"][1], feat["geometry"]["coordinates"][0])
        for feat in data["features"]
        if feat.get("geometry") and feat["geometry"].get("coordinates")
    ]


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def _graph_from_point(lat: float, lon: float, dist: int, **kwargs):
    """
    Обёртка вокруг ox.graph_from_point:
    - при таймауте основного сервера переключается на резервный;
    - если граф оказался пустым (нет рёбер) — пробрасывает InsufficientResponseError
      чтобы вызывающий код мог применить более широкий фильтр.
    """
    for server in (_OVERPASS_PRIMARY, _OVERPASS_FALLBACK):
        ox.settings.overpass_url = server
        try:
            G = ox.graph_from_point((lat, lon), dist=dist, **kwargs)
            if G.number_of_edges() == 0:
                raise ValueError("Graph contains no edges.")
            return G
        except Exception as exc:
            msg = str(exc)
            if "timed out" in msg.lower() or "timeout" in msg.lower():
                logger.warning("Overpass %s timeout, пробуем %s…", server, _OVERPASS_FALLBACK)
                continue
            raise
    raise TimeoutError(f"Оба Overpass-сервера не ответили вовремя ({_OVERPASS_PRIMARY}, {_OVERPASS_FALLBACK})")


def _is_covered_by_files(lat: float, lon: float) -> bool:
    """Проверяет покрытие по файловым данным: ближайшее здание в радиусе 5 км."""
    try:
        for blat, blon in _get_file_building_coords():
            if _haversine_m(lat, lon, blat, blon) <= _FILE_COVERAGE_THRESHOLD_M:
                return True
        return False
    except Exception as e:
        logger.warning("File coverage check failed: %s", e)
        return False

# Типы OSM-объектов социальной инфраструктуры
SOCIAL_AMENITY_TAGS = {
    "amenity": [
        "kindergarten",
        "school",
        "hospital",
        "clinic",
        "doctors",
        "pharmacy",
        "college",
    ]
}


def is_point_covered(lat: float, lon: float) -> bool:
    """
    Проверяет, покрыта ли точка загруженными данными пешеходного графа.

    Логика: ищем ближайший узел walk_nodes.
    Если расстояние > 1 км — данных нет.
    """
    try:
        from db.connection import db_connection, is_db_available
        if not is_db_available():
            return _is_covered_by_files(lat, lon)

        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT ST_Distance(
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        geom::geography
                    )
                    FROM walk_nodes
                    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    LIMIT 1
                    """,
                    (lon, lat, lon, lat),
                )
                row = cur.fetchone()
                if row is None:
                    return False  # таблица пустая — нет данных
                return float(row[0]) <= 1_000

    except Exception as e:
        logger.warning("Coverage check failed: %s", e)
        return _is_covered_by_files(lat, lon)


def _save_coverage_area(lat: float, lon: float, radius_m: float, source: str = "osm") -> None:
    """Сохраняет зону покрытия в coverage_areas."""
    from db.connection import db_connection
    # Грубый круг: 1° ≈ 111 км
    polygon = Point(lon, lat).buffer(radius_m / 111_000)
    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO coverage_areas (source, geom) VALUES (%s, ST_GeomFromText(%s, 4326))",
                (source, polygon.wkt),
            )
        conn.commit()


def _save_infrastructure(conn, features: list) -> int:
    """Сохраняет объекты инфраструктуры, пропуская геометрически близкие дубли."""
    saved = 0
    with conn.cursor() as cur:
        for feat in features:
            props = feat.get("properties", {})
            amenity = props.get("amenity") or ""
            name    = props.get("name")
            geom    = feat.get("geometry", {})
            if geom.get("type") != "Point":
                continue
            lon, lat = geom["coordinates"]
            wkt = f"POINT({lon} {lat})"
            cur.execute(
                """
                INSERT INTO social_infrastructure (amenity, name, geom)
                SELECT %s, %s, ST_GeomFromText(%s, 4326)
                WHERE NOT EXISTS (
                    SELECT 1 FROM social_infrastructure
                    WHERE ST_DWithin(geom, ST_GeomFromText(%s, 4326), 0.0001)
                      AND amenity = %s
                )
                """,
                (amenity, name, wkt, wkt, amenity),
            )
            saved += cur.rowcount
    conn.commit()
    return saved


def _save_graph_nodes_edges(conn, G, mode: str) -> Tuple[int, int]:
    """Сохраняет узлы и рёбра графа в соответствующие таблицы."""
    nodes_table = f"{mode}_nodes"
    edges_table = f"{mode}_edges"

    node_rows = []
    for node_id, data in G.nodes(data=True):
        x = float(data.get("x", 0))
        y = float(data.get("y", 0))
        node_rows.append((str(node_id), x, y, f"POINT({x} {y})"))

    edge_rows = []
    for u, v, data in G.edges(data=True):
        # travel_time добавляется через ox.add_edge_travel_times() (секунды)
        weight = float(data.get("travel_time", data.get("length", 1.0)))
        geom_attr = data.get("geometry")
        try:
            if geom_attr is not None and hasattr(geom_attr, "coords"):
                coords = list(geom_attr.coords)
            else:
                raise ValueError("no geometry attr")
        except Exception:
            # Прямая линия между узлами
            ux, uy = float(G.nodes[u].get("x", 0)), float(G.nodes[u].get("y", 0))
            vx, vy = float(G.nodes[v].get("x", 0)), float(G.nodes[v].get("y", 0))
            coords = [(ux, uy), (vx, vy)]

        if len(coords) < 2:
            continue
        wkt = "LINESTRING(" + ", ".join(f"{c[0]} {c[1]}" for c in coords) + ")"
        edge_rows.append((str(u), str(v), weight, wkt))

    with conn.cursor() as cur:
        for row in node_rows:
            cur.execute(
                f"INSERT INTO {nodes_table} (node_id, x, y, geom) "
                f"VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326)) ON CONFLICT (node_id) DO NOTHING",
                row,
            )
        nodes_saved = len(node_rows)

        BATCH = 2_000
        for i in range(0, len(edge_rows), BATCH):
            cur.executemany(
                f"INSERT INTO {edges_table} (u, v, weight, geom) "
                f"VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))",
                edge_rows[i:i + BATCH],
            )
    conn.commit()
    return nodes_saved, len(edge_rows)


def fetch_osm_data(lat: float, lon: float) -> dict:
    """
    Загружает данные OSM вокруг заданной точки и сохраняет в БД.
    Синхронная операция — может занять несколько минут.
    """
    from db.connection import db_connection, is_db_available

    if not is_db_available():
        raise RuntimeError("База данных недоступна. Загрузка OSM-данных невозможна.")

    result = {
        "lat": lat, "lon": lon,
        "infrastructure_saved": 0,
        "walk_nodes_saved": 0, "walk_edges_saved": 0,
        "drive_nodes_saved": 0, "drive_edges_saved": 0,
        "errors": [],
    }

    # 1. Социальная инфраструктура (15 км)
    logger.info("Загрузка объектов инфраструктуры (%d км)…", INFRA_RADIUS_M // 1000)
    try:
        infra_gdf = ox.features_from_point(
            (lat, lon), tags=SOCIAL_AMENITY_TAGS, dist=INFRA_RADIUS_M
        )
        features = []
        for _, row in infra_gdf.iterrows():
            geom = row.geometry
            if geom is None:
                continue
            if geom.geom_type != "Point":
                geom = geom.centroid
            amenity = row.get("amenity", "") if "amenity" in row.index else ""
            name    = row.get("name")        if "name"    in row.index else None
            if hasattr(amenity, "__float__"):
                amenity = ""
            if hasattr(name, "__float__"):
                name = None
            features.append({
                "geometry":   {"type": "Point", "coordinates": [geom.x, geom.y]},
                "properties": {"amenity": str(amenity), "name": name},
            })
        with db_connection() as conn:
            result["infrastructure_saved"] = _save_infrastructure(conn, features)
        logger.info("  Инфраструктура: %d новых объектов", result["infrastructure_saved"])
    except Exception as e:
        msg = f"infrastructure: {e}"
        logger.warning("Ошибка загрузки инфраструктуры: %s", e)
        result["errors"].append(msg)

    # 2. Пешеходный граф (1.5 км)
    logger.info("Загрузка пешеходного графа (%d м)…", WALK_RADIUS_M)
    try:
        G_walk = _graph_from_point(lat, lon, dist=WALK_RADIUS_M, network_type="walk")
        G_walk = ox.add_edge_speeds(G_walk)
        G_walk = ox.add_edge_travel_times(G_walk)
        with db_connection() as conn:
            n, e = _save_graph_nodes_edges(conn, G_walk, "walk")
        result["walk_nodes_saved"], result["walk_edges_saved"] = n, e
        logger.info("  Walk: %d узлов, %d рёбер", n, e)
    except Exception as e:
        msg = f"walk_graph: {e}"
        logger.warning("Ошибка загрузки пешеходного графа: %s", e)
        result["errors"].append(msg)

    # 3. Транспортный граф (15 км)
    logger.info("Загрузка транспортного графа (%d км)…", DRIVE_RADIUS_M // 1000)
    try:
        # Сначала пробуем только магистральные дороги (быстрее)
        try:
            G_drive = _graph_from_point(lat, lon, dist=DRIVE_RADIUS_M, custom_filter=DRIVE_FILTER_L2)
            logger.info("  Drive: использован фильтр L1 (магистральные дороги)")
        except ValueError as ve:
            if "no edges" in str(ve).lower():
                # В радиусе нет магистралей — загружаем полный drive-граф
                logger.info("  Drive L1 пустой, пробуем полный drive-граф…")
                G_drive = _graph_from_point(lat, lon, dist=DRIVE_RADIUS_M, network_type="drive")
                logger.info("  Drive: использован фильтр L2 (все проезжие дороги)")
            else:
                raise
        G_drive = ox.add_edge_speeds(G_drive)
        G_drive = ox.add_edge_travel_times(G_drive)
        with db_connection() as conn:
            n, e = _save_graph_nodes_edges(conn, G_drive, "drive")
        result["drive_nodes_saved"], result["drive_edges_saved"] = n, e
        logger.info("  Drive: %d узлов, %d рёбер", n, e)
    except Exception as e:
        msg = f"drive_graph: {e}"
        logger.warning("Ошибка загрузки транспортного графа: %s", e)
        result["errors"].append(msg)

    # 4. Зона покрытия
    _save_coverage_area(lat, lon, max(INFRA_RADIUS_M, DRIVE_RADIUS_M))

    # 5. Инвалидация кэшей
    _invalidate_all_caches()
    logger.info("Загрузка завершена: %s", result)
    return result


def _invalidate_all_caches() -> None:
    for fn_path in [
        ("repositories.geo_repository",    "invalidate_cache"),
        ("algorithms.isochrones_module",    "invalidate_graph_cache"),
        ("algorithms.accessibility_module", "invalidate_cache"),
        ("algorithms.placement_module",     "invalidate_cache"),
    ]:
        try:
            module = __import__(fn_path[0], fromlist=[fn_path[1]])
            getattr(module, fn_path[1])()
        except Exception:
            pass
