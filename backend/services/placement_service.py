from typing import Any, Dict, List, Optional, Tuple

from algorithms.accessibility_module import analyze_accessibility
from algorithms.placement_module import generate_placement_suggestions


def run_placement_suggestions(
    coord: Tuple[float, float],
    failed_types: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Запускает анализ доступности и генерирует рекомендации по размещению
    для нарушающих норматив типов объектов.

    Parameters
    ----------
    coord        : (lon, lat)
    failed_types : явный список типов для оптимизации; если None — берём из анализа

    Returns
    -------
    dict: {recommendations: {<type>: {recommended_sites, fallback_zone, criteria_used}}}
    """
    analysis = analyze_accessibility(coord)

    # Определяем типы с нарушениями
    if failed_types is not None:
        types_to_optimize = [t for t in failed_types if t in analysis]
    else:
        types_to_optimize = [
            obj_type for obj_type, info in analysis.items() if not info["ok"]
        ]

    recommendations: Dict[str, Any] = {}

    for obj_type in types_to_optimize:
        info = analysis[obj_type]

        if obj_type == "kindergarten":
            iso_walk = info["isochrone"]
            iso_drive = None
        elif obj_type == "school":
            iso_walk = info["iso_walk"]
            iso_drive = info.get("iso_drive")
            # Если drive-изохрона ещё не строилась (норматив выполнен пешком), строим её
            if iso_drive is None:
                from algorithms.isochrones_module import build_isochrone
                iso_drive = build_isochrone(coord, mode="drive", limit=15, limit_type="minutes")
        elif obj_type == "hospital":
            iso_walk = info["iso_walk"]
            iso_drive = info.get("iso_drive")
            if iso_drive is None:
                from algorithms.isochrones_module import build_isochrone
                iso_drive = build_isochrone(coord, mode="drive", limit=30, limit_type="minutes")
        else:
            continue

        recommendations[obj_type] = generate_placement_suggestions(
            object_type=obj_type,
            iso_walk=iso_walk,
            iso_drive=iso_drive,
        )

    return {"recommendations": recommendations}
