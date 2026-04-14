from typing import Any, Dict, Tuple

from algorithms.accessibility_module import analyze_accessibility


def run_accessibility_analysis(coord: Tuple[float, float]) -> Dict[str, Any]:
    """
    Запускает полный анализ доступности для заданных координат.

    Parameters
    ----------
    coord : (lon, lat)

    Returns
    -------
    dict с ключами: kindergarten, school, hospital
    """
    return analyze_accessibility(coord)
