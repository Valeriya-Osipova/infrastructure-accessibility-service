import os
from typing import Tuple, Dict, List, Any

import geopandas as gpd
from shapely.geometry import shape, Point
from scipy.spatial import KDTree
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

RESIDENTIAL_GDF = gpd.read_file(
    os.path.join(DATA_DIR, "residential_buildings_points.geojson")
).set_crs(epsg=4326, allow_override=True)

LOW_DENSITY_GDF = gpd.read_file(
    os.path.join(DATA_DIR, "final_areas.geojson")
).set_crs(epsg=4326, allow_override=True)

ROADS_GDF = gpd.read_file(
    os.path.join(DATA_DIR, "road_big_nodes.geojson")
).set_crs(epsg=4326, allow_override=True)


def find_residential_clusters(
    gdf: gpd.GeoDataFrame,
    radius_meters: float = 200,
    min_cluster_size: int = 3,
) -> List[Tuple[float, float]]:
    """Находит скопления домов и возвращает центроиды кластеров."""
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


def suggest_kindergarten(iso_walk: dict) -> Dict[str, Any]:
    polygon = shape(iso_walk["geometry"])
    cluster_centers = find_residential_clusters(RESIDENTIAL_GDF)
    recommended_sites = [pt for pt in cluster_centers if polygon.contains(Point(pt))]

    criteria_used = []
    if recommended_sites:
        criteria_used.append("clustered residential buildings within 500m walk isochrone")
    else:
        criteria_used.append("fallback: full isochrone")

    return {
        "recommended_sites": recommended_sites,
        "fallback_zone": iso_walk,
        "criteria_used": criteria_used,
    }


def suggest_school(iso_walk: dict, iso_drive: dict) -> Dict[str, Any]:
    walk_polygon = shape(iso_walk["geometry"])
    drive_polygon = shape(iso_drive["geometry"])

    recommended_sites = []
    criteria_used = []

    cluster_centers = find_residential_clusters(RESIDENTIAL_GDF)
    for pt in cluster_centers:
        if drive_polygon.contains(Point(pt)):
            recommended_sites.append(pt)
    if cluster_centers:
        criteria_used.append("clustered residential buildings within drive isochrone")

    for pt in LOW_DENSITY_GDF.centroid:
        point = Point(pt.x, pt.y)
        if walk_polygon.contains(point):
            recommended_sites.append((pt.x, pt.y))
            criteria_used.append("low density zone within walk isochrone")
        elif drive_polygon.contains(point):
            recommended_sites.append((pt.x, pt.y))
            criteria_used.append("low density zone within drive isochrone")

    roads_in_iso = ROADS_GDF[ROADS_GDF.intersects(drive_polygon)]
    for geom in roads_in_iso.geometry:
        recommended_sites.append((geom.x, geom.y))
    if not roads_in_iso.empty:
        criteria_used.append("road nodes within drive isochrone")

    if not recommended_sites:
        criteria_used.append("fallback: full drive isochrone")

    return {
        "recommended_sites": recommended_sites,
        "fallback_zone": iso_drive,
        "criteria_used": list(dict.fromkeys(criteria_used)),
    }


def suggest_hospital(iso_walk: dict, iso_drive: dict) -> Dict[str, Any]:
    drive_polygon = shape(iso_drive["geometry"])
    recommended_sites = []
    criteria_used = []

    for pt in LOW_DENSITY_GDF.centroid:
        point = Point(pt.x, pt.y)
        if drive_polygon.contains(point):
            recommended_sites.append((pt.x, pt.y))
            criteria_used.append("low density zone within 30min drive isochrone")

    roads_in_iso = ROADS_GDF[ROADS_GDF.intersects(drive_polygon)]
    if not roads_in_iso.empty:
        for geom in roads_in_iso.geometry:
            recommended_sites.append((geom.x, geom.y))
        criteria_used.append("road nodes within 30min drive isochrone")

    if not recommended_sites:
        criteria_used.append("fallback: full 30min drive isochrone")

    return {
        "recommended_sites": recommended_sites,
        "fallback_zone": iso_drive,
        "criteria_used": list(dict.fromkeys(criteria_used)),
    }


def generate_placement_suggestions(
    object_type: str,
    iso_walk: dict,
    iso_drive: dict = None,
) -> Dict[str, Any]:
    """
    Генерирует предложения по размещению нового объекта.

    Parameters
    ----------
    object_type : 'kindergarten' | 'school' | 'hospital'
    iso_walk    : GeoJSON Feature пешей изохроны
    iso_drive   : GeoJSON Feature транспортной изохроны (нужен для school/hospital)

    Returns
    -------
    dict: {recommended_sites, fallback_zone, criteria_used}
    """
    if object_type == "kindergarten":
        return suggest_kindergarten(iso_walk)
    elif object_type == "school":
        if iso_drive is None:
            raise ValueError("iso_drive is required for school suggestions")
        return suggest_school(iso_walk, iso_drive)
    elif object_type == "hospital":
        if iso_drive is None:
            raise ValueError("iso_drive is required for hospital suggestions")
        return suggest_hospital(iso_walk, iso_drive)
    else:
        raise ValueError(f"Unknown object type: {object_type}")
