from typing import Any, Dict, Literal, Tuple

from algorithms.isochrones_module import build_isochrone


def get_isochrone(
    coord: Tuple[float, float],
    mode: Literal["walk", "drive"],
    limit: float,
    limit_type: Literal["meters", "minutes"] = "minutes",
) -> Dict[str, Any]:
    """
    Тонкая обёртка над алгоритмом build_isochrone.
    Принимает coord в формате (lon, lat).
    """
    return build_isochrone(coord=coord, mode=mode, limit=limit, limit_type=limit_type)
