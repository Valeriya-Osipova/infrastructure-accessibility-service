from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class CoordRequest(BaseModel):
    lat: float = Field(..., description="Широта (latitude)")
    lon: float = Field(..., description="Долгота (longitude)")


class AnalyzeRequest(CoordRequest):
    pass


class OptimizeRequest(CoordRequest):
    failed_types: Optional[List[Literal["kindergarten", "school", "hospital"]]] = Field(
        default=None,
        description="Типы объектов, для которых строить рекомендации. "
                    "Если не указано — используются результаты анализа.",
    )


class IsochroneRequest(CoordRequest):
    mode: Literal["walk", "drive"] = Field(..., description="Режим: walk или drive")
    limit: float = Field(..., gt=0, description="Лимит (метры или минуты)")
    limit_type: Literal["meters", "minutes"] = Field(
        default="minutes", description="Единица лимита"
    )


class FetchCoverageRequest(CoordRequest):
    pass
