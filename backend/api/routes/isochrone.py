from fastapi import APIRouter, HTTPException

from models.requests import IsochroneRequest
from services.isochrone_service import get_isochrone

router = APIRouter()


@router.post("/isochrone", summary="Построить изохронную зону доступности")
def isochrone(body: IsochroneRequest):
    """
    Строит изохронный полигон от заданной точки.

    - mode=walk, limit_type=meters — пешая доступность в метрах
    - mode=drive, limit_type=minutes — транспортная доступность в минутах
    """
    coord = (body.lon, body.lat)
    try:
        iso = get_isochrone(
            coord=coord,
            mode=body.mode,
            limit=body.limit,
            limit_type=body.limit_type,
        )
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка построения изохроны: {e}")

    return {"isochrone": iso}
