from typing import List

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter()

VALID_AMENITIES = {"kindergarten", "school", "hospital", "clinic"}


# ── Request models ──────────────────────────────────────────────────────────

class AddInfraRequest(BaseModel):
    lat: float
    lon: float
    amenity: str


class DeleteInfraRequest(BaseModel):
    ids: List[int]


# ── POST /infrastructure/add ────────────────────────────────────────────────

@router.post("/infrastructure/add", summary="Добавить объект инфраструктуры")
def add_infrastructure(req: AddInfraRequest):
    if req.amenity not in VALID_AMENITIES:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый тип amenity: {req.amenity!r}. "
                   f"Допустимые значения: {sorted(VALID_AMENITIES)}",
        )

    from db.connection import is_db_available, db_connection
    from fastapi import HTTPException

    if not is_db_available():
        raise HTTPException(status_code=503, detail="База данных недоступна")

    try:
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO social_infrastructure (amenity, geom)
                    VALUES (%s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                    RETURNING id
                    """,
                    (req.amenity, req.lon, req.lat),
                )
                new_id = cur.fetchone()[0]
            conn.commit()

        from repositories.geo_repository import invalidate_cache
        invalidate_cache()

        return {"id": new_id, "amenity": req.amenity, "lat": req.lat, "lon": req.lon}

    except Exception as exc:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=500, detail=str(exc)) from exc


# ── GET /infrastructure/nearby ──────────────────────────────────────────────

@router.get("/infrastructure/nearby", summary="Объекты инфраструктуры рядом с точкой")
def get_nearby_infrastructure(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: float = Query(100),
):
    from db.connection import is_db_available, db_connection

    if not is_db_available():
        return {"objects": []}

    try:
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        amenity,
                        name,
                        ST_Y(geom) AS lat,
                        ST_X(geom) AS lon
                    FROM social_infrastructure
                    WHERE ST_DWithin(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                        %s
                    )
                    ORDER BY ST_Distance(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                    )
                    """,
                    (lon, lat, radius_m, lon, lat),
                )
                rows = cur.fetchall()

        objects = [
            {
                "id": row[0],
                "amenity": row[1],
                "name": row[2] or "",
                "lat": row[3],
                "lon": row[4],
            }
            for row in rows
        ]
        return {"objects": objects}

    except Exception:
        return {"objects": []}


# ── DELETE /infrastructure/delete ───────────────────────────────────────────

@router.delete("/infrastructure/delete", summary="Удалить объекты инфраструктуры по id")
def delete_infrastructure(req: DeleteInfraRequest):
    from fastapi import HTTPException

    if not req.ids:
        raise HTTPException(status_code=400, detail="Список ids не может быть пустым")

    from db.connection import is_db_available, db_connection

    if not is_db_available():
        raise HTTPException(status_code=503, detail="База данных недоступна")

    try:
        with db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM social_infrastructure WHERE id = ANY(%s)",
                    (list(req.ids),),
                )
                rowcount = cur.rowcount
            conn.commit()

        from repositories.geo_repository import invalidate_cache
        invalidate_cache()

        return {"deleted": rowcount}

    except Exception as exc:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=500, detail=str(exc)) from exc
