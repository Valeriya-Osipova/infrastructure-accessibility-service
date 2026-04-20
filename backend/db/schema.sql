-- Схема базы данных для сервиса инфраструктурной доступности
-- Требует PostgreSQL с расширением PostGIS

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- Зоны низкой плотности населения
-- (импортируется первой — на неё ссылается buildings)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS final_areas (
    id      SERIAL PRIMARY KEY,
    zone_id INTEGER UNIQUE,                  -- уникальный идентификатор зоны из исходных данных
    geom    GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_areas_geom ON final_areas USING GIST(geom);

-- ─────────────────────────────────────────────────────────────────────────────
-- Жилые здания
-- zone_id → final_areas.zone_id: каждое здание принадлежит зоне низкой плотности
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buildings (
    id      SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES final_areas(zone_id) ON DELETE SET NULL,
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buildings_geom    ON buildings USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_buildings_zone_id ON buildings(zone_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Объекты социальной инфраструктуры (детсады, школы, больницы и т.д.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_infrastructure (
    id      SERIAL PRIMARY KEY,
    amenity VARCHAR(100),
    name    VARCHAR(500),
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_infra_geom    ON social_infrastructure USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_infra_amenity ON social_infrastructure(amenity);

-- ─────────────────────────────────────────────────────────────────────────────
-- Пешеходный граф
-- walk_edges.u/v → walk_nodes.node_id: каждое ребро ссылается на свои узлы
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS walk_nodes (
    node_id VARCHAR(50) PRIMARY KEY,
    x       DOUBLE PRECISION NOT NULL,       -- longitude
    y       DOUBLE PRECISION NOT NULL,       -- latitude
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_walk_nodes_geom ON walk_nodes USING GIST(geom);

CREATE TABLE IF NOT EXISTS walk_edges (
    id     SERIAL PRIMARY KEY,
    u      VARCHAR(50)       NOT NULL REFERENCES walk_nodes(node_id) ON DELETE CASCADE,
    v      VARCHAR(50)       NOT NULL REFERENCES walk_nodes(node_id) ON DELETE CASCADE,
    weight DOUBLE PRECISION  NOT NULL,       -- время в секундах (travel_time) или длина в метрах
    geom   GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_walk_edges_geom ON walk_edges USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_walk_edges_u    ON walk_edges(u);
CREATE INDEX IF NOT EXISTS idx_walk_edges_v    ON walk_edges(v);

-- ─────────────────────────────────────────────────────────────────────────────
-- Транспортный (автомобильный) граф
-- drive_edges.u/v → drive_nodes.node_id: аналогично пешеходному
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drive_nodes (
    node_id VARCHAR(50) PRIMARY KEY,
    x       DOUBLE PRECISION NOT NULL,
    y       DOUBLE PRECISION NOT NULL,
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drive_nodes_geom ON drive_nodes USING GIST(geom);

CREATE TABLE IF NOT EXISTS drive_edges (
    id     SERIAL PRIMARY KEY,
    u      VARCHAR(50)       NOT NULL REFERENCES drive_nodes(node_id) ON DELETE CASCADE,
    v      VARCHAR(50)       NOT NULL REFERENCES drive_nodes(node_id) ON DELETE CASCADE,
    weight DOUBLE PRECISION  NOT NULL,
    geom   GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drive_edges_geom ON drive_edges USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_drive_edges_u    ON drive_edges(u);
CREATE INDEX IF NOT EXISTS idx_drive_edges_v    ON drive_edges(v);

-- ─────────────────────────────────────────────────────────────────────────────
-- Крупные узлы дорожной сети (для алгоритма предложений размещения)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS road_big_nodes (
    id   SERIAL PRIMARY KEY,
    geom GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_road_nodes_geom ON road_big_nodes USING GIST(geom);

-- ─────────────────────────────────────────────────────────────────────────────
-- Зоны покрытия загруженными OSM-данными
-- source: 'osm' — данные получены через OSMnx
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coverage_areas (
    id        SERIAL PRIMARY KEY,
    source    VARCHAR(50)  NOT NULL DEFAULT 'osm',
    loaded_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    geom      GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coverage_geom ON coverage_areas USING GIST(geom);
