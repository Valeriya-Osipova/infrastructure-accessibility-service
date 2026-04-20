"""
/coverage — проверка и загрузка покрытия OSM-данными.

GET  /coverage/check?lat=&lon=       — проверить, покрыта ли точка данными
POST /coverage/fetch                  — запустить фоновую загрузку из OSM, вернуть job_id
GET  /coverage/status/{job_id}        — узнать статус / результат загрузки
"""

import threading
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from models.requests import FetchCoverageRequest
from services.osm_service import is_point_covered, fetch_osm_data

router = APIRouter(prefix="/coverage", tags=["Покрытие данных"])

# Простое in-memory хранилище джобов (достаточно для одного сервера)
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


def _run_fetch_job(job_id: str, lat: float, lon: float) -> None:
    try:
        result = fetch_osm_data(lat, lon)
        with _jobs_lock:
            _jobs[job_id].update({"status": "done", "result": result, "finished_at": time.time()})
    except Exception as e:
        with _jobs_lock:
            _jobs[job_id].update({"status": "error", "error": str(e), "finished_at": time.time()})


@router.get("/check")
def check_coverage(lat: float, lon: float):
    """Проверяет наличие данных (граф дорог) вблизи точки."""
    covered = is_point_covered(lat, lon)
    return {"covered": covered, "lat": lat, "lon": lon}


@router.post("/fetch")
def fetch_coverage(body: FetchCoverageRequest):
    """
    Запускает загрузку OSM-данных в фоновом потоке и сразу возвращает job_id.
    Прогресс можно отслеживать через GET /coverage/status/{job_id}.
    """
    from db.connection import is_db_available
    if not is_db_available():
        raise HTTPException(status_code=503, detail="База данных недоступна. Загрузка OSM-данных невозможна.")

    job_id = uuid.uuid4().hex[:10]
    with _jobs_lock:
        _jobs[job_id] = {"status": "running", "started_at": time.time(), "lat": body.lat, "lon": body.lon}

    thread = threading.Thread(target=_run_fetch_job, args=(job_id, body.lat, body.lon), daemon=True)
    thread.start()

    return {"job_id": job_id, "status": "running"}


@router.get("/status/{job_id}")
def get_fetch_status(job_id: str):
    """Возвращает статус фоновой загрузки: running | done | error."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
