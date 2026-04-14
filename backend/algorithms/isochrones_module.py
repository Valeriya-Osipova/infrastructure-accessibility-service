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


def _load_graph(mode: Literal["walk", "drive"]) -> Dict[str, Any]:
    """
    Загружает граф, рёбра и пространственные индексы.
    Данные кэшируются и повторно не читаются с диска.
    """
    if mode in _GRAPH_CACHE:
        return _GRAPH_CACHE[mode]

    if mode == "walk":
        graph_path = os.path.join(DATA_DIR, "walk_graph", "walk.graphml")
        edges_path = os.path.join(DATA_DIR, "walk_graph", "walk_edges.geojson")
        speed_mps = 1.3
        buffer_size = 50
    elif mode == "drive":
        graph_path = os.path.join(DATA_DIR, "drive_graph", "drive_graph.graphml")
        edges_path = os.path.join(DATA_DIR, "drive_graph", "drive_edges.geojson")
        speed_mps = None
        buffer_size = 70
    else:
        raise ValueError("mode must be 'walk' or 'drive'")

    G = nx.read_graphml(graph_path)

    for _, _, data in G.edges(data=True):
        data["weight"] = float(data["weight"])

    edges_gdf = gpd.read_file(edges_path).set_crs(epsg=4326, allow_override=True)

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
        "graph": G,
        "edges": edges_gdf,
        "edges_utm": edges_gdf_utm,
        "kdtree": kdtree,
        "node_ids": node_ids,
        "speed_mps": speed_mps,
        "buffer_size": buffer_size,
        "utm_epsg": utm_epsg,
    }

    return _GRAPH_CACHE[mode]


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
    G = data["graph"]
    edges_gdf_utm = data["edges_utm"]
    kdtree = data["kdtree"]
    node_ids = data["node_ids"]
    speed_mps = data["speed_mps"]
    buffer_size = data["buffer_size"]
    utm_epsg = data["utm_epsg"]

    if limit_type == "meters":
        if mode == "drive":
            raise ValueError("Для drive используйте минуты")
        time_limit = (limit / speed_mps) * 1.2  # запас 20%
    elif limit_type == "minutes":
        time_limit = limit * 60 * 2
    else:
        raise ValueError("limit_type must be 'meters' or 'minutes'")

    _, idx = kdtree.query(coord)
    source_node = node_ids[idx]

    reachable = nx.single_source_dijkstra_path_length(
        G,
        source=source_node,
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
            "mode": mode,
            "limit": limit,
            "limit_type": limit_type,
            "time_limit_sec": round(time_limit, 2),
            "source_node": source_node,
            "reachable_nodes": len(reachable_nodes),
        },
    }
