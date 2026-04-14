from fastapi import APIRouter
from fastapi.responses import JSONResponse

from repositories.geo_repository import get_infrastructure

router = APIRouter()


@router.get("/infrastructure", summary="Получить объекты социальной инфраструктуры")
def infrastructure() -> JSONResponse:
    """Возвращает GeoJSON FeatureCollection точек соц. инфраструктуры."""
    return JSONResponse(content=get_infrastructure())
