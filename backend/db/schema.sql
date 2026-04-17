-- Схема базы данных для сервиса инфраструктурной доступности
-- Требует PostgreSQL с расширением PostGIS

CREATE EXTENSION IF NOT EXISTS postgis;

-- Жилые здания
CREATE TABLE IF NOT EXISTS buildings (
    id      SERIAL PRIMARY KEY,
    zone_id INTEGER,
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_buildings_geom ON buildings USING GIST(geom);

-- Объекты социальной инфраструктуры
CREATE TABLE IF NOT EXISTS social_infrastructure (
    id      SERIAL PRIMARY KEY,
    amenity VARCHAR(100),
    name    VARCHAR(500),
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_infra_geom    ON social_infrastructure USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_infra_amenity ON social_infrastructure(amenity);

-- Узлы пешеходного графа
CREATE TABLE IF NOT EXISTS walk_nodes (
    node_id VARCHAR(50) PRIMARY KEY,
    x       DOUBLE PRECISION NOT NULL,
    y       DOUBLE PRECISION NOT NULL,
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_walk_nodes_geom ON walk_nodes USING GIST(geom);

-- Рёбра пешеходного графа
CREATE TABLE IF NOT EXISTS walk_edges (
    id     SERIAL PRIMARY KEY,
    u      VARCHAR(50)       NOT NULL,
    v      VARCHAR(50)       NOT NULL,
    weight DOUBLE PRECISION  NOT NULL,
    geom   GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_walk_edges_geom ON walk_edges USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_walk_edges_uv   ON walk_edges(u, v);

-- Узлы транспортного графа
CREATE TABLE IF NOT EXISTS drive_nodes (
    node_id VARCHAR(50) PRIMARY KEY,
    x       DOUBLE PRECISION NOT NULL,
    y       DOUBLE PRECISION NOT NULL,
    geom    GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drive_nodes_geom ON drive_nodes USING GIST(geom);

-- Рёбра транспортного графа
CREATE TABLE IF NOT EXISTS drive_edges (
    id     SERIAL PRIMARY KEY,
    u      VARCHAR(50)       NOT NULL,
    v      VARCHAR(50)       NOT NULL,
    weight DOUBLE PRECISION  NOT NULL,
    geom   GEOMETRY(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drive_edges_geom ON drive_edges USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_drive_edges_uv   ON drive_edges(u, v);

-- Зоны низкой плотности населения (для алгоритмов размещения)
CREATE TABLE IF NOT EXISTS final_areas (
    id      SERIAL PRIMARY KEY,
    zone_id INTEGER,
    geom    GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_areas_geom ON final_areas USING GIST(geom);

-- Крупные узлы дорожной сети (для предложений размещения)
CREATE TABLE IF NOT EXISTS road_big_nodes (
    id   SERIAL PRIMARY KEY,
    geom GEOMETRY(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_road_nodes_geom ON road_big_nodes USING GIST(geom);

-- Зоны покрытия загруженными OSM-данными
CREATE TABLE IF NOT EXISTS coverage_areas (
    id         SERIAL PRIMARY KEY,
    source     VARCHAR(50)  NOT NULL DEFAULT 'osm',
    loaded_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    geom       GEOMETRY(Polygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coverage_geom ON coverage_areas USING GIST(geom);
