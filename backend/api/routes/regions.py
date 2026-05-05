from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/regions", summary="Границы субъектов РФ (GeoJSON)")
def get_regions():
    """Возвращает полигоны субъектов РФ из таблицы rf_subjects."""
    try:
        from db.connection import db_connection, is_db_available
        if not is_db_available():
            return JSONResponse({"type": "FeatureCollection", "features": []})

        features = []
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, osm_id, ST_AsGeoJSON(geom) FROM rf_subjects"
                )
                for row_id, name, osm_id, geom_json in cur.fetchall():
                    import json
                    features.append({
                        "type": "Feature",
                        "geometry": json.loads(geom_json),
                        "properties": {"id": row_id, "name": name, "osm_id": osm_id},
                    })

        return {"type": "FeatureCollection", "features": features}

    except Exception:
        return JSONResponse({"type": "FeatureCollection", "features": []})
