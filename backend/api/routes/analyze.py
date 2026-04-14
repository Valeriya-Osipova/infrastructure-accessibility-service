from fastapi import APIRouter, HTTPException

from models.requests import AnalyzeRequest
from services.accessibility_service import run_accessibility_analysis

router = APIRouter()


@router.post("/analyze", summary="Анализ доступности для жилого дома")
def analyze(body: AnalyzeRequest):
    """
    Проверяет нормативы доступности для заданной точки (жилого дома).

    - **kindergarten**: 500 м пешком
    - **school**: 500 м пешком ИЛИ 15 мин транспортом
    - **hospital**: 2 км пешком ИЛИ 30 мин транспортом

    Возвращает статус выполнения норматива и изохронные зоны.
    """
    coord = (body.lon, body.lat)
    try:
        result = run_accessibility_analysis(coord)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка анализа: {e}")

    return result
