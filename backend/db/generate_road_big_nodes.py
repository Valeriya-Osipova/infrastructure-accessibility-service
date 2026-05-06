"""
generate_road_big_nodes.py
--------------------------
Генерирует крупные узлы дорожной сети из таблиц БД (drive_edges / drive_nodes)
и сохраняет результат в:
  - backend/data/road_big_nodes.geojson
  - таблицу road_big_nodes в БД (перезаписывает полностью)

Логика:
  1. Считаем степень каждого узла (сколько рёбер к нему ведут).
  2. Оставляем узлы со степенью >= MIN_DEGREE.
  3. Кластеризуем KMeans → TARGET_CLUSTERS представительных точек.
  4. Каждый центр кластера привязываем к ближайшему реальному узлу.

Запуск:
    cd backend
    python db/generate_road_big_nodes.py
"""

import json
import os
import sys

import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR   = os.path.dirname(SCRIPT_DIR)          # backend/
DATA_DIR   = os.path.join(BASE_DIR, "data")
OUTPUT     = os.path.join(DATA_DIR, "road_big_nodes.geojson")

MIN_DEGREE      = 3    # минимальная степень узла (перекрёсток ≥ 3 дорог)
TARGET_CLUSTERS = 400  # итоговое количество узлов после кластеризации

sys.path.insert(0, BASE_DIR)


def main() -> None:
    from db.connection import db_connection

    print("[big_nodes] Читаем степени узлов из drive_edges…")
    with db_connection() as conn:
        with conn.cursor() as cur:

            # Степень узла = количество рёбер (в обоих направлениях)
            cur.execute("""
                SELECT node_id, COUNT(*) AS degree
                FROM (
                    SELECT u AS node_id FROM drive_edges
                    UNION ALL
                    SELECT v AS node_id FROM drive_edges
                ) t
                GROUP BY node_id
                HAVING COUNT(*) >= %s
            """, (MIN_DEGREE,))
            high_degree_ids = {row[0] for row in cur.fetchall()}

        print(f"[big_nodes] Узлов со степенью >= {MIN_DEGREE}: {len(high_degree_ids)}")

        if not high_degree_ids:
            print("[big_nodes] Нет данных. Убедитесь что drive_edges заполнены.", file=sys.stderr)
            sys.exit(1)

        # Получаем координаты этих узлов
        with conn.cursor() as cur:
            cur.execute("SELECT node_id, x, y FROM drive_nodes")
            all_nodes = {row[0]: (float(row[1]), float(row[2])) for row in cur.fetchall()}

    coords = np.array([all_nodes[nid] for nid in high_degree_ids if nid in all_nodes])
    print(f"[big_nodes] Координат для кластеризации: {len(coords)}")

    # Кластеризация
    n_clusters = min(TARGET_CLUSTERS, len(coords))
    print(f"[big_nodes] KMeans → {n_clusters} кластеров…")

    try:
        from sklearn.cluster import KMeans
        from scipy.spatial import cKDTree
    except ImportError:
        print("[big_nodes] Установите scikit-learn и scipy: pip install scikit-learn scipy",
              file=sys.stderr)
        sys.exit(1)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    kmeans.fit(coords)

    # Привязываем центры кластеров к ближайшим реальным узлам
    tree = cKDTree(coords)
    final_coords = []
    seen = set()
    for center in kmeans.cluster_centers_:
        _, idx = tree.query(center)
        pt = tuple(coords[idx])
        if pt not in seen:
            seen.add(pt)
            final_coords.append(pt)

    print(f"[big_nodes] Итого уникальных узлов: {len(final_coords)}")

    # Сохраняем GeoJSON
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {},
        }
        for lon, lat in final_coords
    ]
    geojson = {"type": "FeatureCollection", "features": features}
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    print(f"[big_nodes] Сохранено: {OUTPUT}")

    # Обновляем таблицу road_big_nodes в БД
    print("[big_nodes] Обновляем таблицу road_big_nodes в БД…")
    with db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE road_big_nodes RESTART IDENTITY")
            cur.executemany(
                "INSERT INTO road_big_nodes (geom) VALUES (ST_SetSRID(ST_MakePoint(%s, %s), 4326))",
                final_coords,
            )
        conn.commit()
    print(f"[big_nodes] Таблица обновлена: {len(final_coords)} записей.")
    print("[big_nodes] Готово.")


if __name__ == "__main__":
    main()
