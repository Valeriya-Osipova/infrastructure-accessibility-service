"""
OSM Auto-Fetch Service

Загружает пространственные данные из OpenStreetMap через OSMnx:
  - объекты социальной инфраструктуры в радиусе 30 км
  - граф транспортной сети в радиусе 30 км
  - граф пешеходной сети в радиусе 3 км

Сохраняет данные в PostGIS. Предотвращает повторную загрузку уже покрытых зон
(coverage_areas). После загрузки инвалидирует все кэши.
"""

import json
import logging
from typing import Tuple

import osmnx as ox
from shapely.geometry import Point, mapping
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

# Радиусы загрузки (метры)
INFRA_RADIUS_M   = 30_000
DRIVE_RADIUS_M   = 30_000
WALK_RADIUS_M    =  3_000

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


def _get_coverage_polygon(lat: float, lon: float, radius_m: float):
    """Возвращает Shapely-полигон круга покрытия вокруг точки."""
    point = Point(lon, lat)
    # Грубое приближение: 1 градус ≈ 111 000 м
    deg = radius_m / 111_000
    return point.buffer(deg)


def is_point_covered(lat: float, lon: float) -> bool:
    """
    Проверяет, покрыта ли точка загруженными данными пешеходного графа.

    Логика: ищем ближайший узел walk_nodes. Если расстояние > 1 км — данных нет.
    """
    try:
        from db.connection import db_connection, is_db_available
        if not is_db_available():
            return True  # без БД считаем, что данные есть (файловый режим)

        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT ST_Distance(
                        ST_GeogFromText('POINT(' || %s || ' ' || %s || ')'),
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
                distance_m = row[0]
                return distance_m <= 1_000

    except Exception as e:
        logger.warning("Coverage check failed: %s", e)
        return True  # при ошибке — не блокируем анализ


def _coverage_area_exists(lat: float, lon: float, radius_m: float) -> bool:
    """Проверяет, есть ли в coverage_areas зона, которая содержит данную точку+радиус."""
    try:
        from db.connection import db_connection
        polygon = _get_coverage_polygon(lat, lon, radius_m)
        wkt = polygon.wkt
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM coverage_areas "
                    "WHERE ST_Contains(geom, ST_GeomFromText(%s, 4326))",
                    (f"POINT({lon} {lat})",),
                )
                count = cur.fetchone()[0]
                return count > 0
    except Exception:
        return False


def _save_coverage_area(lat: float, lon: float, radius_m: float, source: str = "osm") -> None:
    """Сохраняет зону покрытия в coverage_areas (с дедупликацией через ST_Difference)."""
    from db.connection import db_connection
    polygon = _get_coverage_polygon(lat, lon, radius_m)
    wkt = polygon.wkt

    with db_connection() as conn:
        with conn.cursor() as cur:
            # Сохраняем только ту часть, которой ещё нет в coverage_areas
            cur.execute(
                """
                INSERT INTO coverage_areas (source, geom)
                SELECT %s, ST_Difference(
                    ST_GeomFromText(%s, 4326),
                    COALESCE((SELECT ST_Union(geom) FROM coverage_areas), ST_GeomFromText('GEOMETRYCOLLECTION EMPTY', 4326))
                )
                WHERE ST_Area(
                    ST_Difference(
                        ST_GeomFromText(%s, 4326),
                        COALESCE((SELECT ST_Union(geom) FROM coverage_areas), ST_GeomFromText('GEOMETRYCOLLECTION EMPTY', 4326))
                    )
                ) > 0.000001
                """,
                (source, wkt, wkt),
            )
        conn.commit()


def _save_infrastructure(conn, features: list) -> int:
    """Сохраняет объекты инфраструктуры, пропуская уже существующие (по геометрии)."""
    saved = 0
    with conn.cursor() as cur:
        for feat in features:
            props = feat.get("properties", {})
            amenity = props.get("amenity")
            name = props.get("name")
            geom = feat.get("geometry", {})
            if geom.get("type") != "Point":
                continue
            lon, lat = geom["coordinates"]
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
                (amenity, name, f"POINT({lon} {lat})", f"POINT({lon} {lat})", amenity),
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
        weight = float(data.get("travel_time", data.get("length", 1.0)))
        # Попытаемся получить геометрию из атрибута geometry
        geom_attr = data.get("geometry")
        if geom_attr is not None:
            coords = list(geom_attr.coords)
        else:
            # Берём прямую линию между узлами
            u_data = G.nodes[u]
            v_data = G.nodes[v]
            coords = [(float(u_data["x"]), float(u_data["y"])),
                      (float(v_data["x"]), float(v_data["y"]))]
        linestring_wkt = "LINESTRING(" + ", ".join(f"{c[0]} {c[1]}" for c in coords) + ")"
        edge_rows.append((str(u), str(v), weight, linestring_wkt))

    nodes_saved = 0
    edges_saved = 0

    with conn.cursor() as cur:
        for row in node_rows:
            cur.execute(
                f"""
                INSERT INTO {nodes_table} (node_id, x, y, geom)
                VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))
                ON CONFLICT (node_id) DO NOTHING
                """,
                row,
            )
            nodes_saved += cur.rowcount

        BATCH = 2000
        for i in range(0, len(edge_rows), BATCH):
            cur.executemany(
                f"INSERT INTO {edges_table} (u, v, weight, geom) "
                f"VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))",
                edge_rows[i:i + BATCH],
            )
        edges_saved = len(edge_rows)

    conn.commit()
    return nodes_saved, edges_saved


def fetch_osm_data(lat: float, lon: float) -> dict:
    """
    Загружает данные OSM вокруг заданной точки и сохраняет в БД.

    Это синхронная операция — может занять несколько минут.

    Returns
    -------
    dict с информацией о количестве загруженных объектов
    """
    from db.connection import db_connection, is_db_available

    if not is_db_available():
        raise RuntimeError("База данных недоступна. Загрузка OSM-данных невозможна.")

    result = {
        "lat": lat,
        "lon": lon,
        "infrastructure_saved": 0,
        "walk_nodes_saved": 0,
        "walk_edges_saved": 0,
        "drive_nodes_saved": 0,
        "drive_edges_saved": 0,
    }

    # 1. Социальная инфраструктура (30 км)
    logger.info("Загрузка объектов инфраструктуры (30 км)...")
    try:
        infra_gdf = ox.features_from_point(
            (lat, lon), tags=SOCIAL_AMENITY_TAGS, dist=INFRA_RADIUS_M
        )
        # Оставляем только точки (или центроиды полигонов)
        features = []
        for _, row in infra_gdf.iterrows():
            geom = row.geometry
            if geom is None:
                continue
            if geom.geom_type != "Point":
                geom = geom.centroid
            amenity = row.get("amenity", "")
            name = row.get("name", None)
            features.append({
                "geometry": {"type": "Point", "coordinates": [geom.x, geom.y]},
                "properties": {"amenity": amenity, "name": name},
            })

        with db_connection() as conn:
            result["infrastructure_saved"] = _save_infrastructure(conn, features)
        logger.info("  Инфраструктура: %d новых объектов", result["infrastructure_saved"])
    except Exception as e:
        logger.warning("Ошибка загрузки инфраструктуры: %s", e)

    # 2. Пешеходный граф (3 км)
    logger.info("Загрузка пешеходного графа (3 км)...")
    try:
        G_walk = ox.graph_from_point(
            (lat, lon),
            dist=WALK_RADIUS_M,
            network_type="walk",
            retain_all=False,
        )
        G_walk = ox.add_edge_speeds(G_walk)
        G_walk = ox.add_edge_travel_times(G_walk)

        with db_connection() as conn:
            n, e = _save_graph_nodes_edges(conn, G_walk, "walk")
        result["walk_nodes_saved"] = n
        result["walk_edges_saved"] = e
        logger.info("  Пешеходный граф: %d узлов, %d рёбер", n, e)
    except Exception as e:
        logger.warning("Ошибка загрузки пешеходного графа: %s", e)

    # 3. Транспортный граф (30 км)
    logger.info("Загрузка транспортного графа (30 км)...")
    try:
        G_drive = ox.graph_from_point(
            (lat, lon),
            dist=DRIVE_RADIUS_M,
            network_type="drive",
            retain_all=False,
        )
        G_drive = ox.add_edge_speeds(G_drive)
        G_drive = ox.add_edge_travel_times(G_drive)

        with db_connection() as conn:
            n, e = _save_graph_nodes_edges(conn, G_drive, "drive")
        result["drive_nodes_saved"] = n
        result["drive_edges_saved"] = e
        logger.info("  Транспортный граф: %d узлов, %d рёбер", n, e)
    except Exception as e:
        logger.warning("Ошибка загрузки транспортного графа: %s", e)

    # 4. Сохраняем зону покрытия
    _save_coverage_area(lat, lon, max(INFRA_RADIUS_M, DRIVE_RADIUS_M))

    # 5. Инвалидируем все кэши
    _invalidate_all_caches()

    return result


def _invalidate_all_caches() -> None:
    """Сбрасывает кэши репозитория, алгоритмов и графов."""
    try:
        from repositories.geo_repository import invalidate_cache
        invalidate_cache()
    except Exception:
        pass
    try:
        from algorithms.isochrones_module import invalidate_graph_cache
        invalidate_graph_cache()
    except Exception:
        pass
    try:
        from algorithms.accessibility_module import invalidate_cache as inv_acc
        inv_acc()
    except Exception:
        pass
    try:
        from algorithms.placement_module import invalidate_cache as inv_place
        inv_place()
    except Exception:
        pass
