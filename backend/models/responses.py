from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class KindergartenResult(BaseModel):
    ok: bool
    norm: str
    isochrone: Dict[str, Any]


class SchoolResult(BaseModel):
    ok: bool
    norm: str
    norm_met: Optional[str]
    iso_walk: Dict[str, Any]
    iso_drive: Optional[Dict[str, Any]]


class HospitalResult(BaseModel):
    ok: bool
    norm: str
    norm_met: Optional[str]
    iso_walk: Dict[str, Any]
    iso_drive: Optional[Dict[str, Any]]


class AnalyzeResponse(BaseModel):
    kindergarten: KindergartenResult
    school: SchoolResult
    hospital: HospitalResult


class PlacementResult(BaseModel):
    recommended_sites: List[List[float]]
    fallback_zone: Dict[str, Any]
    criteria_used: List[str]


class OptimizeResponse(BaseModel):
    recommendations: Dict[str, PlacementResult]


class IsochroneResponse(BaseModel):
    isochrone: Dict[str, Any]
