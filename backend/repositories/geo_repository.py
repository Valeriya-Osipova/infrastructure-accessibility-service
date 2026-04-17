"""
GeoRepository — единственная точка доступа к пространственным данным.

Источник данных определяется автоматически:
  1. PostgreSQL/PostGIS (если DATABASE_URL задан и БД доступна)
  2. Локальные GeoJSON-файлы (fallback для разработки без БД)

Замена источника прозрачна для вышестоящего кода.
"""

import json
import os
from functools import lru_cache
from typing import Any, Dict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "..", "data")

# ---------------------------------------------------------------------------
# GeoJSON-файловый бэкенд (fallback)
# ---------------------------------------------------------------------------

def _load_geojson(filename: str) -> Dict[str, Any]:
    path = os.path.join(DATA_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# PostGIS-бэкенд
# ---------------------------------------------------------------------------

def _from_db_buildings() -> Dict[str, Any]:
    from db.connection import db_connection
    features = []
    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT zone_id, ST_AsGeoJSON(geom) FROM buildings"
            )
            for zone_id, geom_json in cur.fetchall():
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(geom_json),
                    "properties": {"zone_id": zone_id},
                })
    return {"type": "FeatureCollection", "features": features}


def _from_db_infrastructure() -> Dict[str, Any]:
    from db.connection import db_connection
    features = []
    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT amenity, name, ST_AsGeoJSON(geom) FROM social_infrastructure"
            )
            for amenity, name, geom_json in cur.fetchall():
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(geom_json),
                    "properties": {"amenity": amenity, "name": name},
                })
    return {"type": "FeatureCollection", "features": features}


def _from_db_final_areas() -> Dict[str, Any]:
    from db.connection import db_connection
    features = []
    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT zone_id, ST_AsGeoJSON(geom) FROM final_areas")
            for zone_id, geom_json in cur.fetchall():
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(geom_json),
                    "properties": {"zone_id": zone_id},
                })
    return {"type": "FeatureCollection", "features": features}


def _from_db_road_nodes() -> Dict[str, Any]:
    from db.connection import db_connection
    features = []
    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ST_AsGeoJSON(geom) FROM road_big_nodes")
            for (geom_json,) in cur.fetchall():
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(geom_json),
                    "properties": {},
                })
    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Проверка источника (кэшируется один раз при старте)
# ---------------------------------------------------------------------------

_USE_DB: bool | None = None


def _use_db() -> bool:
    global _USE_DB
    if _USE_DB is None:
        try:
            from db.connection import is_db_available
            _USE_DB = is_db_available()
            if _USE_DB:
                print("[geo_repository] Источник данных: PostgreSQL/PostGIS")
            else:
                print("[geo_repository] PostGIS недоступен, используются GeoJSON-файлы")
        except Exception:
            _USE_DB = False
            print("[geo_repository] PostGIS недоступен, используются GeoJSON-файлы")
    return _USE_DB


# ---------------------------------------------------------------------------
# Публичный API
# ---------------------------------------------------------------------------

@lru_cache(maxsize=None)
def get_buildings() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection жилых домов."""
    if _use_db():
        return _from_db_buildings()
    return _load_geojson("residential_buildings_points.geojson")


@lru_cache(maxsize=None)
def get_infrastructure() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection всех объектов инфраструктуры."""
    if _use_db():
        return _from_db_infrastructure()
    return _load_geojson("social_infrastructure_points.geojson")


@lru_cache(maxsize=None)
def get_infrastructure_by_type(amenity_types: tuple) -> Dict[str, Any]:
    """Возвращает отфильтрованный GeoJSON по типу amenity."""
    all_data = get_infrastructure()
    features = [
        f for f in all_data["features"]
        if f.get("properties", {}).get("amenity") in amenity_types
    ]
    return {"type": "FeatureCollection", "features": features}


@lru_cache(maxsize=None)
def get_low_density_areas() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection зон низкой плотности населения."""
    if _use_db():
        return _from_db_final_areas()
    return _load_geojson("final_areas.geojson")


@lru_cache(maxsize=None)
def get_road_big_nodes() -> Dict[str, Any]:
    """Возвращает GeoJSON FeatureCollection крупных дорожных узлов."""
    if _use_db():
        return _from_db_road_nodes()
    return _load_geojson("road_big_nodes.geojson")


def invalidate_cache() -> None:
    """Сбрасывает кэш репозитория (вызывается после загрузки новых OSM-данных)."""
    get_buildings.cache_clear()
    get_infrastructure.cache_clear()
    get_infrastructure_by_type.cache_clear()
    get_low_density_areas.cache_clear()
    get_road_big_nodes.cache_clear()
    global _USE_DB
    _USE_DB = None
