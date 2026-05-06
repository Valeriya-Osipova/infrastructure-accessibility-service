from functools import lru_cache
from typing import Tuple, Dict, List, Any, Optional

import geopandas as gpd
from shapely.geometry import shape, Point
from scipy.spatial import KDTree
import numpy as np


@lru_cache(maxsize=None)
def _get_residential_gdf() -> gpd.GeoDataFrame:
    from repositories.geo_repository import get_buildings
    return gpd.GeoDataFrame.from_features(
        get_buildings()["features"], crs="EPSG:4326"
    )


@lru_cache(maxsize=None)
def _get_road_nodes_gdf() -> gpd.GeoDataFrame:
    from repositories.geo_repository import get_road_big_nodes
    return gpd.GeoDataFrame.from_features(
        get_road_big_nodes()["features"], crs="EPSG:4326"
    )


@lru_cache(maxsize=None)
def _get_settlement_centers_gdf() -> gpd.GeoDataFrame:
    from repositories.geo_repository import get_settlement_centers
    data = get_settlement_centers()
    if not data["features"]:
        return gpd.GeoDataFrame(geometry=gpd.GeoSeries([], crs="EPSG:4326"))
    return gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")


def find_residential_clusters(
    gdf: gpd.GeoDataFrame,
    radius_meters: float = 200,
    min_cluster_size: int = 3,
) -> List[Tuple[float, float]]:
    """Находит скопления домов и возвращает центроиды кластеров."""
    if gdf.empty:
        return []
    centroid = gdf.unary_union.centroid
    utm_zone = int((centroid.x + 180) / 6) + 1
    utm_epsg = 32600 + utm_zone
    gdf_utm = gdf.to_crs(epsg=utm_epsg)

    coords = np.array([[geom.x, geom.y] for geom in gdf_utm.geometry])
    tree = KDTree(coords)

    visited: set = set()
    cluster_centroids = []

    for idx, point in enumerate(coords):
        if idx in visited:
            continue
        indices = tree.query_ball_point(point, r=radius_meters)
        if len(indices) >= min_cluster_size:
            cluster_points = coords[indices]
            centroid_cluster = cluster_points.mean(axis=0)
            cluster_centroids.append(centroid_cluster)
            visited.update(indices)

    if not cluster_centroids:
        return []

    cluster_geom = gpd.GeoSeries(
        [Point(x, y) for x, y in cluster_centroids], crs=utm_epsg
    ).to_crs(epsg=4326)

    return [(pt.x, pt.y) for pt in cluster_geom]


def _points_in_polygon(
    points_lonlat: List[Tuple[float, float]], polygon
) -> List[Tuple[float, float]]:
    return [pt for pt in points_lonlat if polygon.covers(Point(pt))]


def _settlement_centers_in_polygon(polygon) -> List[Tuple[float, float]]:
    gdf = _get_settlement_centers_gdf()
    if gdf.empty:
        return []
    return [(g.x, g.y) for g in gdf.geometry if polygon.covers(g)]


def _road_nodes_in_polygon(polygon) -> List[Tuple[float, float]]:
    gdf = _get_road_nodes_gdf()
    if gdf.empty:
        return []
    return [(g.x, g.y) for g in gdf.geometry if polygon.covers(g)]


def _nearest_road_node(
    origin_lon: float, origin_lat: float
) -> Optional[Tuple[float, float]]:
    gdf = _get_road_nodes_gdf()
    if gdf.empty:
        return None
    coords = np.array([[g.x, g.y] for g in gdf.geometry])
    tree = KDTree(coords)
    k = min(2, len(coords))
    dists, idxs = tree.query([origin_lon, origin_lat], k=k)
    if k == 1:
        dists, idxs = [dists], [idxs]
    for dist, idx in zip(dists, idxs):
        if dist > 1e-5:
            pt = coords[idx]
            return (float(pt[0]), float(pt[1]))
    return None


def suggest_kindergarten(
    iso_walk: dict,
    origin: Tuple[float, float],
) -> Dict[str, Any]:
    polygon = shape(iso_walk["geometry"])

    cluster_pts = _points_in_polygon(
        find_residential_clusters(_get_residential_gdf()), polygon
    )
    if cluster_pts:
        return {
            "recommended_sites": cluster_pts,
            "fallback_zone": iso_walk,
            "criteria_used": ["Жилые кластеры в зоне пешей доступности 500 м"],
        }

    settlement_pts = _settlement_centers_in_polygon(polygon)
    if settlement_pts:
        return {
            "recommended_sites": settlement_pts,
            "fallback_zone": iso_walk,
            "criteria_used": ["Центры населённых пунктов в зоне пешей доступности 500 м"],
        }

    nearest = _nearest_road_node(origin[0], origin[1])
    if nearest:
        return {
            "recommended_sites": [nearest],
            "fallback_zone": iso_walk,
            "criteria_used": ["Ближайший крупный дорожный узел (жилых кластеров в зоне нет)"],
        }

    return {
        "recommended_sites": [],
        "fallback_zone": iso_walk,
        "criteria_used": ["Резервный вариант: зона пешей изохроны 500 м"],
    }


def suggest_school(
    iso_walk: dict,
    iso_drive: dict,
    origin: Tuple[float, float],
) -> Dict[str, Any]:
    drive_polygon = shape(iso_drive["geometry"])

    cluster_pts = _points_in_polygon(
        find_residential_clusters(_get_residential_gdf()), drive_polygon
    )
    settlement_pts = _settlement_centers_in_polygon(drive_polygon)
    recommended_sites = cluster_pts + settlement_pts

    if recommended_sites:
        criteria = []
        if cluster_pts:
            criteria.append("Жилые кластеры в зоне транспортной доступности 15 мин")
        if settlement_pts:
            criteria.append("Центры населённых пунктов в зоне транспортной доступности 15 мин")
        return {
            "recommended_sites": recommended_sites,
            "fallback_zone": iso_drive,
            "criteria_used": criteria,
        }

    nearest = _nearest_road_node(origin[0], origin[1])
    if nearest:
        return {
            "recommended_sites": [nearest],
            "fallback_zone": iso_drive,
            "criteria_used": ["Ближайший крупный дорожный узел (кластеров в зоне нет)"],
        }

    return {
        "recommended_sites": [],
        "fallback_zone": iso_drive,
        "criteria_used": ["Резервный вариант: зона транспортной изохроны 15 мин"],
    }


def suggest_hospital(
    iso_walk: dict,
    iso_drive: dict,
    origin: Tuple[float, float],
) -> Dict[str, Any]:
    drive_polygon = shape(iso_drive["geometry"])

    settlement_pts = _settlement_centers_in_polygon(drive_polygon)
    road_node_pts = _road_nodes_in_polygon(drive_polygon)
    priority1 = settlement_pts + road_node_pts

    if priority1:
        criteria = []
        if settlement_pts:
            criteria.append("Центры населённых пунктов в зоне транспортной доступности 30 мин")
        if road_node_pts:
            criteria.append("Крупные дорожные узлы в зоне транспортной доступности 30 мин")
        return {
            "recommended_sites": priority1,
            "fallback_zone": iso_drive,
            "criteria_used": criteria,
        }

    cluster_pts = _points_in_polygon(
        find_residential_clusters(_get_residential_gdf()), drive_polygon
    )
    if cluster_pts:
        return {
            "recommended_sites": cluster_pts,
            "fallback_zone": iso_drive,
            "criteria_used": ["Жилые кластеры в зоне транспортной доступности 30 мин"],
        }

    nearest = _nearest_road_node(origin[0], origin[1])
    if nearest:
        return {
            "recommended_sites": [nearest],
            "fallback_zone": iso_drive,
            "criteria_used": ["Ближайший крупный дорожный узел (кластеров в зоне нет)"],
        }

    return {
        "recommended_sites": [],
        "fallback_zone": iso_drive,
        "criteria_used": ["Резервный вариант: зона транспортной изохроны 30 мин"],
    }


def generate_placement_suggestions(
    object_type: str,
    iso_walk: dict,
    iso_drive: dict = None,
    origin: Tuple[float, float] = None,
) -> Dict[str, Any]:
    """
    Генерирует предложения по размещению нового объекта.

    Parameters
    ----------
    object_type : 'kindergarten' | 'school' | 'hospital'
    iso_walk    : GeoJSON Feature пешей изохроны
    iso_drive   : GeoJSON Feature транспортной изохроны (для school/hospital)
    origin      : (lon, lat) — координаты выбранного жилого дома

    Returns
    -------
    dict: {recommended_sites, fallback_zone, criteria_used}
    """
    origin = origin or (0.0, 0.0)
    if object_type == "kindergarten":
        return suggest_kindergarten(iso_walk, origin)
    elif object_type == "school":
        if iso_drive is None:
            raise ValueError("iso_drive is required for school suggestions")
        return suggest_school(iso_walk, iso_drive, origin)
    elif object_type == "hospital":
        if iso_drive is None:
            raise ValueError("iso_drive is required for hospital suggestions")
        return suggest_hospital(iso_walk, iso_drive, origin)
    else:
        raise ValueError(f"Unknown object type: {object_type}")


def invalidate_cache() -> None:
    """Сбрасывает кэш GeoDataFrame (вызывается после загрузки новых OSM-данных)."""
    _get_residential_gdf.cache_clear()
    _get_road_nodes_gdf.cache_clear()
    _get_settlement_centers_gdf.cache_clear()
