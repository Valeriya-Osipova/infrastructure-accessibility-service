import json
import os
from typing import Tuple, Literal, Dict, Any

import networkx as nx
import geopandas as gpd
import numpy as np

from shapely.ops import unary_union
from scipy.spatial import KDTree

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

_GRAPH_CACHE: Dict[str, Dict[str, Any]] = {}

# Скорость ходьбы: 1.3 м/с = 4.68 км/ч (стандарт для пешеходных изохрон)
# Используется вместо speed_kph из OSMnx, который даёт автомобильные скорости
# даже для пешеходного графа, что делает изохроны в ~10 раз больше нужного.
WALK_SPEED_MPS = 1.3

# Эффективная скорость автомобиля в городских условиях: 20 км/ч.
# OSMnx travel_time вычисляется по разрешённой скорости (60 км/ч для вторичных дорог),
# но реальная скорость в городе — 20 км/ч из-за светофоров и перекрёстков.
# В сёлах разрешённая скорость ≈ реальной, поэтому OSMnx там точен.
# Признак городского отрезка: длина < 200 м (плотная уличная сеть).
DRIVE_CITY_SPEED_MPS = 20.0 / 3.6   # 5.56 м/с
URBAN_SEGMENT_THRESHOLD_M = 200.0


def _drive_edge_weight(length_m: float, travel_time_s: float) -> float:
    """
    Возвращает скорректированное время проезда ребра.
    Короткие рёбра (<200 м) типичны для городской сети с плотными перекрёстками:
    для них время вычисляется по эффективной скорости 20 км/ч вместо свободного потока.
    Длинные рёбра (загородные дороги) берутся как есть из OSMnx.
    """
    if 0 < length_m < URBAN_SEGMENT_THRESHOLD_M:
        return max(travel_time_s, length_m / DRIVE_CITY_SPEED_MPS)
    return travel_time_s


# ---------------------------------------------------------------------------
# Загрузка графа из PostGIS
# ---------------------------------------------------------------------------

def _load_graph_from_db(mode: Literal["walk", "drive"]) -> Dict[str, Any]:
    """Строит NetworkX-граф из таблиц узлов и рёбер в PostGIS."""
    from db.connection import db_connection

    nodes_table = "walk_nodes" if mode == "walk" else "drive_nodes"
    edges_table = "walk_edges" if mode == "walk" else "drive_edges"

    G = nx.DiGraph()

    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT node_id, x, y FROM {nodes_table}")
            for node_id, x, y in cur.fetchall():
                G.add_node(node_id, x=str(x), y=str(y))

            if mode == "walk":
                # Вычисляем вес через реальную длину / скорость ходьбы.
                # OSMnx travel_time использует автомобильные скорости (~50 км/ч),
                # что делает пешеходные изохроны в ~10 раз больше реальных.
                cur.execute(
                    f"SELECT u, v, ST_Length(geom::geography), ST_AsGeoJSON(geom) FROM {edges_table}"
                )
                edge_features = []
                for u, v, length_m, geom_json in cur.fetchall():
                    G.add_edge(u, v, weight=float(length_m) / WALK_SPEED_MPS)
                    edge_features.append({
                        "type": "Feature",
                        "geometry": json.loads(geom_json),
                        "properties": {"u": u, "v": v},
                    })
            else:
                # Получаем длину ребра через PostGIS для коррекции городских скоростей.
                cur.execute(
                    f"SELECT u, v, weight, ST_Length(geom::geography), ST_AsGeoJSON(geom) FROM {edges_table}"
                )
                edge_features = []
                for u, v, weight, length_m, geom_json in cur.fetchall():
                    G.add_edge(u, v, weight=_drive_edge_weight(float(length_m), float(weight)))
                    edge_features.append({
                        "type": "Feature",
                        "geometry": json.loads(geom_json),
                        "properties": {"u": u, "v": v},
                    })

    return G, edge_features


# ---------------------------------------------------------------------------
# Загрузка графа из файлов (fallback)
# ---------------------------------------------------------------------------

def _load_graph_from_files(mode: Literal["walk", "drive"]) -> Tuple[nx.DiGraph, list]:
    """Читает граф из локальных graphml + geojson файлов."""
    if mode == "walk":
        graph_path = os.path.join(DATA_DIR, "walk_graph", "walk.graphml")
        edges_path = os.path.join(DATA_DIR, "walk_graph", "walk_edges.geojson")
    else:
        graph_path = os.path.join(DATA_DIR, "drive_graph", "drive_graph.graphml")
        edges_path = os.path.join(DATA_DIR, "drive_graph", "drive_edges.geojson")

    G = nx.read_graphml(graph_path)
    for _, _, data in G.edges(data=True):
        if mode == "walk":
            # Пересчитываем вес через реальную длину / скорость ходьбы.
            # travel_time в GraphML от OSMnx вычислен по автомобильным скоростям.
            length = float(data.get("length", 0))
            data["weight"] = length / WALK_SPEED_MPS if length > 0 else float(data.get("travel_time", 10.0))
        else:
            length = float(data.get("length", 0))
            travel_time = float(data.get("travel_time", data.get("length", 1.0)))
            data["weight"] = _drive_edge_weight(length, travel_time)

    with open(edges_path, encoding="utf-8") as f:
        raw = json.load(f)

    edge_features = [
        {
            "type": "Feature",
            "geometry": feat["geometry"],
            "properties": {
                "u": str(feat["properties"]["u"]),
                "v": str(feat["properties"]["v"]),
            },
        }
        for feat in raw["features"]
    ]
    return G, edge_features


# ---------------------------------------------------------------------------
# Основной загрузчик с кэшем
# ---------------------------------------------------------------------------

def _load_graph(mode: Literal["walk", "drive"]) -> Dict[str, Any]:
    """
    Загружает граф, рёбра и пространственные индексы.
    Данные кэшируются и повторно не читаются с диска/БД.
    """
    if mode in _GRAPH_CACHE:
        return _GRAPH_CACHE[mode]

    buffer_size = 100 if mode == "walk" else 200

    # Попытка загрузки из PostGIS, иначе — из файлов
    try:
        from db.connection import is_db_available
        if is_db_available():
            G, edge_features = _load_graph_from_db(mode)
        else:
            G, edge_features = _load_graph_from_files(mode)
    except Exception:
        G, edge_features = _load_graph_from_files(mode)

    edges_gdf = gpd.GeoDataFrame.from_features(edge_features, crs="EPSG:4326")
    edges_gdf["u"] = edges_gdf["u"].astype(str)
    edges_gdf["v"] = edges_gdf["v"].astype(str)

    node_ids = []
    coords = []
    for node, data in G.nodes(data=True):
        node_ids.append(node)
        coords.append((float(data["x"]), float(data["y"])))
    coords = np.array(coords)
    kdtree = KDTree(coords)

    centroid = edges_gdf.unary_union.centroid
    utm_zone = int((centroid.x + 180) / 6) + 1
    utm_epsg = 32600 + utm_zone
    edges_gdf_utm = edges_gdf.to_crs(epsg=utm_epsg)

    _GRAPH_CACHE[mode] = {
        "graph":      G,
        "edges":      edges_gdf,
        "edges_utm":  edges_gdf_utm,
        "kdtree":     kdtree,
        "node_ids":   node_ids,
        "buffer_size": buffer_size,
        "utm_epsg":   utm_epsg,
    }
    return _GRAPH_CACHE[mode]


def invalidate_graph_cache() -> None:
    """Сбрасывает кэш графов (вызывается после загрузки новых OSM-данных)."""
    _GRAPH_CACHE.clear()


# ---------------------------------------------------------------------------
# Построение изохроны
# ---------------------------------------------------------------------------

def build_isochrone(
    coord: Tuple[float, float],
    mode: Literal["walk", "drive"],
    limit: float,
    limit_type: Literal["meters", "minutes"] = "minutes",
    simplify_tolerance: float = 10.0,
) -> Dict[str, Any]:
    """
    Построение изохронной зоны доступности от заданной точки.

    Parameters
    ----------
    coord : (lon, lat)
    mode : 'walk' | 'drive'
    limit : числовой лимит (метры или минуты)
    limit_type : 'meters' | 'minutes'
    simplify_tolerance : допуск упрощения полигона (метры в UTM)

    Returns
    -------
    GeoJSON Feature (тип Polygon)
    """
    data = _load_graph(mode)
    G             = data["graph"]
    edges_gdf_utm = data["edges_utm"]
    kdtree        = data["kdtree"]
    node_ids      = data["node_ids"]
    buffer_size   = data["buffer_size"]
    utm_epsg      = data["utm_epsg"]

    # Граф уже загружен с правильными весами:
    #   walk: weight = length / WALK_SPEED_MPS  (секунды при 1.3 м/с)
    #   drive: weight = travel_time из OSMnx    (секунды при скорости дороги)
    if limit_type == "meters":
        if mode == "drive":
            raise ValueError("Для drive используйте минуты")
        time_limit = limit / WALK_SPEED_MPS  # метры → секунды при 1.3 м/с
    elif limit_type == "minutes":
        time_limit = limit * 60
    else:
        raise ValueError("limit_type must be 'meters' or 'minutes'")

    # Берём K ближайших узлов вместо одного — защита от тупиков сети
    K_SOURCES = 3
    k = min(K_SOURCES, len(node_ids))
    _, idxs = kdtree.query(coord, k=k)
    if k == 1:
        source_nodes = [node_ids[int(idxs)]]
    else:
        source_nodes = [node_ids[int(i)] for i in idxs]

    reachable = nx.multi_source_dijkstra_path_length(
        G,
        sources=source_nodes,
        cutoff=time_limit,
        weight="weight",
    )
    reachable_nodes = set(reachable.keys())
    if not reachable_nodes:
        raise RuntimeError("Не найдено достижимых узлов")

    iso_edges = edges_gdf_utm[
        edges_gdf_utm["u"].isin(reachable_nodes)
        & edges_gdf_utm["v"].isin(reachable_nodes)
    ]
    if iso_edges.empty:
        raise RuntimeError("Не найдено достижимых рёбер")

    merged_lines = unary_union(iso_edges.geometry)
    polygon_utm = merged_lines.buffer(buffer_size)
    if simplify_tolerance > 0:
        polygon_utm = polygon_utm.simplify(simplify_tolerance, preserve_topology=True)

    polygon = (
        gpd.GeoSeries([polygon_utm], crs=utm_epsg).to_crs(epsg=4326).iloc[0]
    )

    return {
        "type": "Feature",
        "geometry": polygon.__geo_interface__,
        "properties": {
            "mode":             mode,
            "limit":            limit,
            "limit_type":       limit_type,
            "time_limit_sec":   round(time_limit, 2),
            "source_node":      source_nodes[0],
            "reachable_nodes":  len(reachable_nodes),
        },
    }
