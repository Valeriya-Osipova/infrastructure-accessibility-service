"""
GeoRepository — единственная точка загрузки GeoJSON-файлов в память.
Данные кэшируются при первом обращении (lazy loading).
Архитектурно изолирован от алгоритмов и API: замена источника (GeoJSON → PostGIS)
требует изменений только здесь.
"""

import json
import os
from functools import lru_cache
from typing import Any, Dict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")


def _load_geojson(filename: str) -> Dict[str, Any]:
    path = os.path.join(DATA_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def get_buildings() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection жилых домов (точки)."""
    return _load_geojson("residential_buildings_points.geojson")


@lru_cache(maxsize=None)
def get_infrastructure() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection объектов социальной инфраструктуры."""
    return _load_geojson("social_infrastructure_points.geojson")


@lru_cache(maxsize=None)
def get_low_density_areas() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection зон низкой плотности населения."""
    return _load_geojson("final_areas.geojson")
