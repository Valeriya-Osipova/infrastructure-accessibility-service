"""
Скрипт инициализации базы данных.

Создаёт таблицы (если не существуют) и импортирует данные из локальных GeoJSON-файлов
и GraphML-графов в PostgreSQL/PostGIS.

Запуск:
    cd backend
    python -m db.init_db             # первичная инициализация (пропускает уже заполненные таблицы)
    python -m db.init_db --reset     # сброс и полная перезагрузка всех данных
"""

import json
import os
import sys

import psycopg2
import networkx as nx
from shapely.geometry import shape

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)
DATA_DIR    = os.path.join(BACKEND_DIR, "data")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/infrastructure",
)

SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def _connect() -> psycopg2.extensions.connection:
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return conn
    except Exception as e:
        print(f"[ERROR] Не удалось подключиться к БД: {e}")
        print(f"        DATABASE_URL = {DATABASE_URL}")
        sys.exit(1)


def _load_geojson(filename: str) -> dict:
    path = os.path.join(DATA_DIR, filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def drop_all(conn: psycopg2.extensions.connection) -> None:
    """Удаляет все таблицы проекта в правильном порядке (с учётом FK)."""
    print("[0/7] Сброс схемы (--reset)...")
    tables = [
        "walk_edges", "walk_nodes",
        "drive_edges", "drive_nodes",
        "buildings", "final_areas",
        "social_infrastructure",
        "road_big_nodes",
        "coverage_areas",
    ]
    with conn.cursor() as cur:
        for tbl in tables:
            cur.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE")
    conn.commit()
    print("      OK")


def create_schema(conn: psycopg2.extensions.connection) -> None:
    print("[1/7] Создание схемы...")
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print("      OK")


def import_final_areas(conn: psycopg2.extensions.connection) -> None:
    """[2/7] Зоны низкой плотности — импортируются до зданий (FK buildings→final_areas)."""
    print("[2/7] Импорт зон низкой плотности...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM final_areas")
        if cur.fetchone()[0] > 0:
            print(f"      Пропуск: таблица уже заполнена")
            return

    data = _load_geojson("final_areas.geojson")
    rows = []
    for feat in data["features"]:
        props = feat.get("properties", {})
        geom  = shape(feat["geometry"])
        rows.append((props.get("zone_id"), geom.wkt))

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO final_areas (zone_id, geom) VALUES (%s, ST_GeomFromText(%s, 4326))",
            rows,
        )
    conn.commit()
    print(f"      Загружено: {len(rows)} зон")


def import_buildings(conn: psycopg2.extensions.connection) -> None:
    """[3/7] Жилые здания — импортируются после final_areas (FK на zone_id)."""
    print("[3/7] Импорт жилых зданий...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM buildings")
        if cur.fetchone()[0] > 0:
            print(f"      Пропуск: таблица уже заполнена")
            return

    data = _load_geojson("residential_buildings_points.geojson")
    rows = []
    for feat in data["features"]:
        geom    = shape(feat["geometry"])
        zone_id = feat.get("properties", {}).get("zone_id")
        rows.append((zone_id, geom.wkt))

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO buildings (zone_id, geom) VALUES (%s, ST_GeomFromText(%s, 4326))",
            rows,
        )
    conn.commit()
    print(f"      Загружено: {len(rows)} зданий")


def import_infrastructure(conn: psycopg2.extensions.connection) -> None:
    print("[4/7] Импорт объектов инфраструктуры...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM social_infrastructure")
        if cur.fetchone()[0] > 0:
            print(f"      Пропуск: таблица уже заполнена")
            return

    data = _load_geojson("social_infrastructure_points.geojson")
    rows = []
    for feat in data["features"]:
        props = feat.get("properties", {})
        geom  = shape(feat["geometry"])
        rows.append((props.get("amenity"), props.get("name"), geom.wkt))

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO social_infrastructure (amenity, name, geom) "
            "VALUES (%s, %s, ST_GeomFromText(%s, 4326))",
            rows,
        )
    conn.commit()
    print(f"      Загружено: {len(rows)} объектов")


def import_walk_graph(conn: psycopg2.extensions.connection) -> None:
    """[5/7] Пешеходный граф: сначала узлы (walk_nodes), затем рёбра (walk_edges → FK)."""
    print("[5/7] Импорт пешеходного графа...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM walk_nodes")
        if cur.fetchone()[0] > 0:
            print(f"      Пропуск: таблица уже заполнена")
            return

    G = nx.read_graphml(os.path.join(DATA_DIR, "walk_graph", "walk.graphml"))

    node_rows = [
        (nid, float(d["x"]), float(d["y"]), f"POINT({float(d['x'])} {float(d['y'])})")
        for nid, d in G.nodes(data=True)
    ]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO walk_nodes (node_id, x, y, geom) "
            "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326)) ON CONFLICT DO NOTHING",
            node_rows,
        )

    with open(os.path.join(DATA_DIR, "walk_graph", "walk_edges.geojson"), encoding="utf-8") as f:
        raw = json.load(f)

    edge_rows = []
    node_ids  = {r[0] for r in node_rows}
    for feat in raw["features"]:
        props = feat["properties"]
        u = str(props["u"])
        v = str(props["v"])
        # Пропускаем рёбра с отсутствующими узлами (целостность FK)
        if u not in node_ids or v not in node_ids:
            continue
        weight = float(props.get("weight", props.get("time", props.get("length", 1.0))))
        edge_rows.append((u, v, weight, shape(feat["geometry"]).wkt))

    BATCH = 5_000
    with conn.cursor() as cur:
        for i in range(0, len(edge_rows), BATCH):
            cur.executemany(
                "INSERT INTO walk_edges (u, v, weight, geom) "
                "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))",
                edge_rows[i:i + BATCH],
            )
    conn.commit()
    print(f"      Загружено: {len(node_rows)} узлов, {len(edge_rows)} рёбер")


def import_drive_graph(conn: psycopg2.extensions.connection) -> None:
    """[6/7] Транспортный граф: сначала узлы (drive_nodes), затем рёбра (drive_edges → FK)."""
    print("[6/7] Импорт транспортного графа...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM drive_nodes")
        if cur.fetchone()[0] > 0:
            print(f"      Пропуск: таблица уже заполнена")
            return

    G = nx.read_graphml(os.path.join(DATA_DIR, "drive_graph", "drive_graph.graphml"))

    node_rows = [
        (nid, float(d["x"]), float(d["y"]), f"POINT({float(d['x'])} {float(d['y'])})")
        for nid, d in G.nodes(data=True)
    ]
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO drive_nodes (node_id, x, y, geom) "
            "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326)) ON CONFLICT DO NOTHING",
            node_rows,
        )

    with open(os.path.join(DATA_DIR, "drive_graph", "drive_edges.geojson"), encoding="utf-8") as f:
        raw = json.load(f)

    edge_rows = []
    node_ids  = {r[0] for r in node_rows}
    for feat in raw["features"]:
        props = feat["properties"]
        u = str(props["u"])
        v = str(props["v"])
        if u not in node_ids or v not in node_ids:
            continue
        weight = float(props.get("weight", props.get("time", props.get("length", 1.0))))
        edge_rows.append((u, v, weight, shape(feat["geometry"]).wkt))

    BATCH = 5_000
    with conn.cursor() as cur:
        for i in range(0, len(edge_rows), BATCH):
            cur.executemany(
                "INSERT INTO drive_edges (u, v, weight, geom) "
                "VALUES (%s, %s, %s, ST_GeomFromText(%s, 4326))",
                edge_rows[i:i + BATCH],
            )
    conn.commit()
    print(f"      Загружено: {len(node_rows)} узлов, {len(edge_rows)} рёбер")


def import_road_nodes(conn: psycopg2.extensions.connection) -> None:
    print("[7/7] Импорт крупных дорожных узлов...")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM road_big_nodes")
        if cur.fetchone()[0] > 0:
            print(f"      Пропуск: таблица уже заполнена")
            return

    data = _load_geojson("road_big_nodes.geojson")
    rows = [(shape(f["geometry"]).wkt,) for f in data["features"]]

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO road_big_nodes (geom) VALUES (ST_GeomFromText(%s, 4326))",
            rows,
        )
    conn.commit()
    print(f"      Загружено: {len(rows)} узлов")


def main() -> None:
    reset = "--reset" in sys.argv

    print("=== Инициализация базы данных ===")
    print(f"URL:  {DATABASE_URL}")
    print(f"Режим: {'RESET (сброс + перезагрузка)' if reset else 'обычный (пропуск заполненных таблиц)'}\n")

    conn = _connect()
    try:
        if reset:
            drop_all(conn)

        create_schema(conn)

        # Порядок важен: final_areas → buildings (FK), nodes → edges (FK)
        import_final_areas(conn)
        import_buildings(conn)
        import_infrastructure(conn)
        import_walk_graph(conn)
        import_drive_graph(conn)
        import_road_nodes(conn)
    finally:
        conn.close()

    print("\n=== Готово ===")


if __name__ == "__main__":
    main()
