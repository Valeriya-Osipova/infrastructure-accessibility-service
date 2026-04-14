from fastapi import APIRouter
from fastapi.responses import JSONResponse

from repositories.geo_repository import get_buildings

router = APIRouter()


@router.get("/buildings", summary="Получить жилые здания")
def buildings() -> JSONResponse:
    """Возвращает GeoJSON FeatureCollection точек жилых домов."""
    return JSONResponse(content=get_buildings())
