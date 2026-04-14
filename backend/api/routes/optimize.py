from fastapi import APIRouter, HTTPException

from models.requests import OptimizeRequest
from services.placement_service import run_placement_suggestions

router = APIRouter()


@router.post("/optimize", summary="Предложить места для строительства новых объектов")
def optimize(body: OptimizeRequest):
    """
    Для нарушающих норматив типов объектов генерирует рекомендации
    по оптимальному размещению новых объектов инфраструктуры.

    Если `failed_types` не задан, анализ выполняется автоматически
    и рекомендации строятся для всех нарушений.
    """
    coord = (body.lon, body.lat)
    try:
        result = run_placement_suggestions(coord, failed_types=body.failed_types)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка оптимизации: {e}")

    return result
