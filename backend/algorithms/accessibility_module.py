import os
from typing import Tuple, Dict, Any

import geopandas as gpd
from shapely.geometry import Point, shape

from algorithms.isochrones_module import build_isochrone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

SOCIAL_GDF = gpd.read_file(
    os.path.join(DATA_DIR, "social_infrastructure_points.geojson")
).set_crs(epsg=4326, allow_override=True)


def _check_in_isochrone(iso_feature: dict, point: Point) -> bool:
    polygon = shape(iso_feature["geometry"])
    return polygon.contains(point)


def _check_kindergarten(coord: Tuple[float, float]) -> Dict[str, Any]:
    iso = build_isochrone(coord, mode="walk", limit=500, limit_type="meters")
    kids = SOCIAL_GDF[SOCIAL_GDF["amenity"] == "kindergarten"]
    kids_points = [Point(x, y) for x, y in zip(kids.geometry.x, kids.geometry.y)]
    ok = any(_check_in_isochrone(iso, pt) for pt in kids_points)
    return {"ok": ok, "norm": "500m walk", "isochrone": iso}


def _check_school(coord: Tuple[float, float]) -> Dict[str, Any]:
    iso_walk = build_isochrone(coord, mode="walk", limit=500, limit_type="meters")
    schools = SOCIAL_GDF[SOCIAL_GDF["amenity"] == "school"]
    school_points = [Point(x, y) for x, y in zip(schools.geometry.x, schools.geometry.y)]

    walk_ok = any(_check_in_isochrone(iso_walk, pt) for pt in school_points)
    if walk_ok:
        return {
            "ok": True,
            "norm": "500m walk or 15min drive",
            "norm_met": "walk_500m",
            "iso_walk": iso_walk,
            "iso_drive": None,
        }

    iso_drive = build_isochrone(coord, mode="drive", limit=15, limit_type="minutes")
    drive_ok = any(_check_in_isochrone(iso_drive, pt) for pt in school_points)
    return {
        "ok": drive_ok,
        "norm": "500m walk or 15min drive",
        "norm_met": "drive_15min" if drive_ok else None,
        "iso_walk": iso_walk,
        "iso_drive": iso_drive,
    }


def _check_hospital(coord: Tuple[float, float]) -> Dict[str, Any]:
    hospitals = SOCIAL_GDF[SOCIAL_GDF["amenity"].isin(["hospital", "clinic"])]
    hospital_points = [
        Point(x, y) for x, y in zip(hospitals.geometry.x, hospitals.geometry.y)
    ]

    iso_walk = build_isochrone(coord, mode="walk", limit=2000, limit_type="meters")
    walk_ok = any(_check_in_isochrone(iso_walk, pt) for pt in hospital_points)
    if walk_ok:
        return {
            "ok": True,
            "norm": "2km walk or 30min drive",
            "norm_met": "walk_2km",
            "iso_walk": iso_walk,
            "iso_drive": None,
        }

    iso_drive = build_isochrone(coord, mode="drive", limit=30, limit_type="minutes")
    drive_ok = any(_check_in_isochrone(iso_drive, pt) for pt in hospital_points)
    return {
        "ok": drive_ok,
        "norm": "2km walk or 30min drive",
        "norm_met": "drive_30min" if drive_ok else None,
        "iso_walk": iso_walk,
        "iso_drive": iso_drive,
    }


def analyze_accessibility(coord: Tuple[float, float]) -> Dict[str, Any]:
    """
    Проверка нормативов доступности для заданных координат.

    Parameters
    ----------
    coord : (lon, lat)

    Returns
    -------
    dict с результатами по трём типам объектов
    """
    return {
        "kindergarten": _check_kindergarten(coord),
        "school": _check_school(coord),
        "hospital": _check_hospital(coord),
    }
