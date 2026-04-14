import geopandas as gpd
from shapely.geometry import Point

# Путь к исходному файлу
input_file = "./residential_buildings.geojson"
# Путь к выходному файлу
output_file = "./residential_buildings_points.geojson"

# Загружаем данные
gdf = gpd.read_file(input_file)

# Проверяем CRS и ставим EPSG:4326 если не задан
if gdf.crs is None:
    gdf = gdf.set_crs(epsg=4326, allow_override=True)

# Функция для замены всех геометрий на точки
def ensure_point(geom):
    if geom is None:
        return None
    if geom.geom_type == "Point":
        return geom
    # Для всех остальных типов берем центроид
    return geom.centroid

# Применяем к столбцу geometry
gdf["geometry"] = gdf.geometry.apply(ensure_point)

# Сохраняем в новый файл
gdf.to_file(output_file, driver="GeoJSON")

print(f"Файл '{output_file}' создан. Все геометрии преобразованы в точки.")
