import os
import geopandas as gpd
import osmnx as ox
from shapely.geometry import Point
import numpy as np
from sklearn.cluster import KMeans
from scipy.spatial import cKDTree

# ------------------------------------------------------------
# Параметры
# ------------------------------------------------------------
BUFFER_DRIVE_KM = 20
MAX_NODES_PER_BUFFER = 5
OUTPUT_ROADS_DRIVE = "road_big_nodes.geojson"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------------
# Зоны с низкой плотностью населения
# ------------------------------------------------------------
zones_path = os.path.join(BASE_DIR, "./final_areas.geojson")
zones = gpd.read_file(zones_path).to_crs(epsg=4326)

# ------------------------------------------------------------
# Буферы вокруг центроидов
# ------------------------------------------------------------
zones_m = zones.to_crs(epsg=3857)
centroids_m = zones_m.geometry.centroid
buffers_drive = centroids_m.buffer(BUFFER_DRIVE_KM * 1000)
buffers_drive = gpd.GeoDataFrame(geometry=buffers_drive, crs=3857).to_crs(epsg=4326)

# ------------------------------------------------------------
# Собираем первый узел крупной дороги для каждого буфера
# ------------------------------------------------------------
all_road_nodes = []

total_buffers = len(buffers_drive)
for i, geom in enumerate(buffers_drive.geometry, start=1):
    print(f"[Drive] Обрабатываем буфер {i}/{total_buffers} ({i/total_buffers*100:.1f}%)...")
    try:
        # Загружаем граф для авто
        G_drive = ox.graph_from_polygon(geom, network_type="drive", simplify=True)

        # Рёбра
        edges = ox.graph_to_gdfs(G_drive, nodes=False)

        # Фильтруем только крупные дороги
        edges_big = edges[edges["highway"].isin(["primary", "secondary"])]
        print(f"  Найдено крупных дорог: {len(edges_big)}")

        road_nodes = []
        for geom_edge in edges_big.geometry:
            coords = list(geom_edge.coords)
            road_nodes.append(coords[0])   # start
            road_nodes.append(coords[-1])  # end

        if road_nodes:
            coords_array = np.array(road_nodes)

            if len(coords_array) > MAX_NODES_PER_BUFFER:
                # Кластеризация
                kmeans = KMeans(n_clusters=MAX_NODES_PER_BUFFER, random_state=0).fit(coords_array)
                cluster_centers = kmeans.cluster_centers_

                # Привязка центров кластеров к ближайшему существующему узлу дороги
                tree = cKDTree(coords_array)
                for c in cluster_centers:
                    _, idx = tree.query(c)
                    nearest_node = coords_array[idx]
                    all_road_nodes.append(tuple(nearest_node))
            else:
                all_road_nodes.extend(road_nodes)

        print(f"  Всего узлов после кластеризации и привязки: {len(all_road_nodes)}")

    except Exception as e:
        print(f"Ошибка на буфере {i}: {e}")

# ------------------------------------------------------------
# Преобразуем в GeoDataFrame и сохраняем
# ------------------------------------------------------------
if all_road_nodes:
    road_nodes_gdf = gpd.GeoDataFrame(
        geometry=gpd.points_from_xy([x for x, y in all_road_nodes], [y for x, y in all_road_nodes]),
        crs="EPSG:4326"
    )
    road_nodes_gdf.to_file(os.path.join(BASE_DIR, OUTPUT_ROADS_DRIVE), driver="GeoJSON")
    print(f"Сохранено: {OUTPUT_ROADS_DRIVE} ({len(all_road_nodes)} узлов)")
else:
    print("Нет узлов для сохранения.")
