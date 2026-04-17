from fastapi import APIRouter
from fastapi.responses import JSONResponse

from repositories.geo_repository import get_infrastructure, get_infrastructure_by_type

router = APIRouter()


@router.get("/infrastructure", summary="Все объекты социальной инфраструктуры")
def infrastructure() -> JSONResponse:
    """Возвращает GeoJSON FeatureCollection всех объектов соц. инфраструктуры."""
    return JSONResponse(content=get_infrastructure())


@router.get("/infrastructure/kindergarten", summary="Детские сады")
def infrastructure_kindergarten() -> JSONResponse:
    return JSONResponse(content=get_infrastructure_by_type(("kindergarten",)))


@router.get("/infrastructure/school", summary="Школы")
def infrastructure_school() -> JSONResponse:
    return JSONResponse(content=get_infrastructure_by_type(("school",)))


@router.get("/infrastructure/hospital", summary="Больницы и клиники")
def infrastructure_hospital() -> JSONResponse:
    return JSONResponse(content=get_infrastructure_by_type(("hospital", "clinic")))
