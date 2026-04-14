from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import buildings, infrastructure, analyze, optimize, isochrone

app = FastAPI(
    title="Инфраструктурная доступность",
    description="API для анализа пространственной доступности социальной инфраструктуры",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(buildings.router, tags=["Данные"])
app.include_router(infrastructure.router, tags=["Данные"])
app.include_router(analyze.router, tags=["Анализ"])
app.include_router(optimize.router, tags=["Оптимизация"])
app.include_router(isochrone.router, tags=["Изохроны"])


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "infrastructure-accessibility"}
