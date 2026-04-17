"""
/coverage — проверка и загрузка покрытия OSM-данными.

GET  /coverage/check?lat=&lon=   — проверить, покрыта ли точка данными
POST /coverage/fetch              — запустить загрузку данных из OSM (синхронно)
"""

from fastapi import APIRouter, HTTPException

from models.requests import FetchCoverageRequest
from services.osm_service import is_point_covered, fetch_osm_data

router = APIRouter(prefix="/coverage", tags=["Покрытие данных"])


@router.get("/check")
def check_coverage(lat: float, lon: float):
    """
    Проверяет, есть ли загруженные данные (граф дорог) вблизи заданной точки.

    Возвращает `covered: true` если ближайший узел пешеходного графа
    находится в радиусе 1 км от точки.
    """
    covered = is_point_covered(lat, lon)
    return {"covered": covered, "lat": lat, "lon": lon}


@router.post("/fetch")
def fetch_coverage(body: FetchCoverageRequest):
    """
    Загружает данные OSM вокруг заданной точки:
    - социальная инфраструктура в радиусе 30 км
    - транспортный граф в радиусе 30 км
    - пешеходный граф в радиусе 3 км

    Синхронная операция — может занять несколько минут.
    После загрузки кэши алгоритмов сбрасываются автоматически.
    """
    try:
        result = fetch_osm_data(body.lat, body.lon)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки OSM: {e}")

    return {
        "status": "ok",
        "message": "Данные успешно загружены",
        **result,
    }
