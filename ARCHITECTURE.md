# Архитектура сервиса инфраструктурной доступности

## Назначение

Веб-сервис для автоматизированной оценки пространственной доступности объектов социальной инфраструктуры (детских садов, школ, больниц) от жилых домов. Работает с территориями с низкой плотностью населения. Позволяет выявить нарушения нормативов и получить предложения по размещению новых объектов.

---

## Технологический стек

### Backend
| Компонент | Технология |
|-----------|-----------|
| Фреймворк | FastAPI 0.115 |
| Язык | Python 3.12 |
| ASGI-сервер | Uvicorn |
| Геоданные | GeoPandas 1.1, Shapely 2.0, OSMnx 2.1 |
| Графы | NetworkX 3.3 |
| БД-драйвер | psycopg2-binary 2.9 |
| Конфиг | python-dotenv |

### Frontend
| Компонент | Технология |
|-----------|-----------|
| Фреймворк | React 18 + TypeScript |
| Сборка | Vite |
| Карта | OpenLayers 10 |
| HTTP-клиент | Fetch API |
| Стили | CSS-модули (BEM) |

### Инфраструктура
| Компонент | Технология |
|-----------|-----------|
| База данных | PostgreSQL 16 + PostGIS 3.4 |
| Контейнеры | Docker + Docker Compose |
| Web-сервер (прод) | nginx (фронт в Docker) |

---

## Структура проекта

```
project-map-social/
├── backend/
│   ├── main.py                     # Точка входа FastAPI
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── data/                       # Локальные GeoJSON и GraphML (fallback при отсутствии БД)
│   │   ├── residential_buildings_points.geojson
│   │   ├── social_infrastructure_points.geojson
│   │   ├── final_areas.geojson     # Зоны низкой плотности
│   │   ├── road_big_nodes.geojson  # Крупные узлы дорог
│   │   ├── walk_graph/             # walk.graphml + walk_edges.geojson
│   │   └── drive_graph/            # drive_graph.graphml + drive_edges.geojson
│   ├── api/routes/                 # FastAPI-роутеры
│   ├── algorithms/                 # Алгоритмы анализа
│   ├── services/                   # Сервисный слой
│   ├── repositories/               # Доступ к данным
│   ├── models/                     # Pydantic-модели
│   └── db/                         # Схема БД и скрипт инициализации
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Корневой компонент, управление состоянием
│   │   ├── components/
│   │   │   ├── MapView/            # OpenLayers карта
│   │   │   ├── Sidebar/            # Боковая панель
│   │   │   ├── LayerControl/       # Управление слоями
│   │   │   ├── AnalysisPanel/      # Ввод точки, кнопки, результаты
│   │   │   └── ResultModal/        # Всплывающий отчёт оптимизации
│   │   ├── services/api.ts         # HTTP-клиент к бэкенду
│   │   └── types/index.ts          # Все TypeScript-типы
│   └── Dockerfile
├── docker-compose.yml
└── .env
```

---

## База данных

### Схема таблиц и связи

```
final_areas                       social_infrastructure
──────────────────                ──────────────────────
id          SERIAL PK             id       SERIAL PK
zone_id     INTEGER UNIQUE  ◄─┐   amenity  VARCHAR(100)
geom        GEOMETRY(Polygon) │   name     VARCHAR(500)
                              │   geom     GEOMETRY(Point)
buildings                     │
──────────────────            │   road_big_nodes
id          SERIAL PK         │   ──────────────────────
zone_id     INTEGER ──────────┘   id   SERIAL PK
            FK → final_areas      geom GEOMETRY(Point)
            ON DELETE SET NULL
geom        GEOMETRY(Point)    coverage_areas
                               ──────────────────────
walk_nodes                     id        SERIAL PK
──────────────────             source    VARCHAR(50)
node_id  VARCHAR(50) PK ◄──┐   loaded_at TIMESTAMP
x        FLOAT              │   geom      GEOMETRY(Polygon)
y        FLOAT              │
geom     GEOMETRY(Point)    │
                            │
walk_edges              drive_nodes
──────────────────      ──────────────────
id     SERIAL PK        node_id VARCHAR(50) PK ◄──┐
u  ────────────────────►walk_nodes(node_id)        │
v  ────────────────────►walk_nodes(node_id)        │
   ON DELETE CASCADE                               │
weight FLOAT            drive_edges                │
geom   GEOMETRY(Line)   ──────────────────         │
                        id     SERIAL PK           │
                        u  ────────────────────────┘
                        v  ────────────────────────►drive_nodes(node_id)
                           ON DELETE CASCADE
                        weight FLOAT
                        geom   GEOMETRY(Line)
```

### Индексы

Все геометрические поля индексированы через `GIST` для быстрых пространственных запросов. Дополнительно: `social_infrastructure(amenity)`, `buildings(zone_id)`, `walk_edges(u)`, `walk_edges(v)`, `drive_edges(u)`, `drive_edges(v)`.

### Источники данных

| Таблица | Источник | Назначение |
|---------|----------|-----------|
| `buildings` | GeoJSON-файл / PostGIS | Жилые дома — точки анализа |
| `social_infrastructure` | GeoJSON-файл / OSM | Детсады, школы, больницы |
| `walk_nodes/edges` | GraphML-файл / OSM | Пешеходный граф для изохрон |
| `drive_nodes/edges` | GraphML-файл / OSM | Транспортный граф для изохрон |
| `final_areas` | GeoJSON-файл | Зоны низкой плотности |
| `road_big_nodes` | GeoJSON-файл | Узлы дорог для алгоритма размещения |
| `coverage_areas` | OSM-загрузчик | Зафиксированные зоны загруженных данных |

---

## API эндпоинты

### `GET /buildings`
Возвращает GeoJSON FeatureCollection всех жилых домов.

**Ответ:** `GeoJSONFeatureCollection` с точками (Point, EPSG:4326).

---

### `GET /infrastructure`
### `GET /infrastructure/kindergarten`
### `GET /infrastructure/school`
### `GET /infrastructure/hospital`

Возвращают объекты социальной инфраструктуры. Фильтрация по `amenity`: `kindergarten`, `school`, `hospital|clinic`.

---

### `POST /analyze`

Анализирует доступность инфраструктуры от заданной точки.

**Запрос:**
```json
{ "lat": 61.78, "lon": 34.36 }
```

**Ответ:**
```json
{
  "kindergarten": {
    "ok": false,
    "norm": "500 м пешком",
    "isochrone": { "type": "Feature", "geometry": {...} }
  },
  "school": {
    "ok": true,
    "norm": "500 м пешком или 15 мин транспортом",
    "norm_met": "walk",
    "iso_walk": { "type": "Feature", "geometry": {...} },
    "iso_drive": null
  },
  "hospital": {
    "ok": false,
    "norm": "2 км пешком или 30 мин транспортом",
    "norm_met": null,
    "iso_walk": { "type": "Feature", "geometry": {...} },
    "iso_drive": { "type": "Feature", "geometry": {...} }
  }
}
```

**Логика проверки нормативов:**

| Объект | Норматив 1 | Норматив 2 |
|--------|-----------|-----------|
| Детский сад | 500 м пешком | — |
| Школа | 500 м пешком | ИЛИ 15 мин транспортом |
| Больница | 2000 м пешком | ИЛИ 30 мин транспортом |

Для школы и больницы сначала строится пешая изохрона. Если объект не найден внутри — строится транспортная изохрона. Норматив выполнен если хотя бы одна изохрона пересекается с объектом нужного типа.

---

### `POST /optimize`

Предлагает места для размещения новых объектов.

**Запрос:**
```json
{ "lat": 61.78, "lon": 34.36, "failed_types": ["kindergarten", "hospital"] }
```
Если `failed_types` не передан — определяются автоматически из анализа.

**Ответ:**
```json
{
  "recommendations": {
    "kindergarten": {
      "recommended_sites": [[34.361, 61.782], [34.358, 61.779]],
      "fallback_zone": { "type": "Feature", "geometry": {...} },
      "criteria_used": "residential_clusters"
    }
  }
}
```

---

### `POST /isochrone`

Строит изохрону произвольного типа.

**Запрос:**
```json
{ "lat": 61.78, "lon": 34.36, "mode": "walk", "limit": 500, "limit_type": "distance" }
```

| Параметр | Значения |
|----------|---------|
| `mode` | `walk` / `drive` |
| `limit_type` | `distance` (метры) / `time` (секунды) |

---

### `GET /coverage/check?lat=&lon=`

Проверяет, есть ли загруженные данные (граф ходьбы) вблизи точки.

**Ответ:** `{ "covered": true, "lat": ..., "lon": ... }`

Логика: ищет ближайший узел в `walk_nodes` (БД) или ближайшее здание в файловых данных (≤ 5 км). Если данных нет — `covered: false`.

---

### `POST /coverage/fetch`

Запускает **асинхронную** загрузку OSM-данных вокруг точки в фоновом потоке.

**Запрос:** `{ "lat": 61.78, "lon": 34.36 }`

**Ответ:** `{ "job_id": "cff43fe52f", "status": "running" }`

Загружает: инфраструктуру (15 км), пешеходный граф (1 км), транспортный граф только главных дорог (15 км). После загрузки инвалидирует все кэши.

---

### `GET /coverage/status/{job_id}`

Возвращает статус фоновой загрузки.

**Ответ (running):** `{ "status": "running", "started_at": 1234567890 }`

**Ответ (done):**
```json
{
  "status": "done",
  "result": {
    "infrastructure_saved": 18,
    "walk_nodes_saved": 240,
    "walk_edges_saved": 560,
    "drive_nodes_saved": 890,
    "drive_edges_saved": 2100,
    "errors": []
  }
}
```

---

## Алгоритмы

### Построение изохрон (`isochrones_module.py`)

1. **Загрузка графа** — из PostGIS (`walk_nodes`/`walk_edges` или `drive_nodes`/`drive_edges`), при недоступности БД — из GraphML/GeoJSON-файлов. Граф кэшируется в памяти (`_GRAPH_CACHE`).
2. **Поиск стартового узла** — KDTree по координатам узлов, K=3 ближайших.
3. **Поиск достижимых узлов** — алгоритм Дейкстры от стартовых узлов, обход до исчерпания лимита (метры для walk, секунды для drive).
4. **Построение зоны** — буфер 100 м (walk) или 200 м (drive) вокруг достижимых рёбер → `unary_union` → `convex_hull` → упрощение геометрии.
5. **Проекция** — работает в UTM (метры), возвращает в EPSG:4326.

### Анализ доступности (`accessibility_module.py`)

Для каждого типа объекта:
1. Построить изохрону (walk, по нормативу)
2. Найти объекты нужного типа из `social_infrastructure` (PostGIS или файл)
3. Проверить пересечение изохроны с точками объектов (`shapely.intersects`)
4. Для школы/больницы: если пешая не прошла — повторить для транспортной изохроны

### Предложения размещения (`placement_module.py`)

**Детсад:** кластеры жилых домов (KDTree, радиус 300 м) внутри пешей изохроны нарушения.

**Школа:** жилые кластеры и зоны низкой плотности внутри 15-мин транспортной изохроны + крупные дорожные узлы.

**Больница:** зоны низкой плотности и крупные дорожные узлы внутри 30-мин транспортной изохроны.

Возвращает топ-N рекомендованных точек и полигон fallback-зоны (область поиска).

---

## OSM-сервис (`osm_service.py`)

Загружает данные из OpenStreetMap через Overpass API (библиотека OSMnx 2.1) и сохраняет в PostGIS.

### Параметры загрузки

| Данные | Радиус | Фильтр |
|--------|--------|--------|
| Социальная инфраструктура | 15 км | `amenity`: kindergarten, school, hospital, clinic, ... |
| Пешеходный граф | 1 км | `network_type=walk` |
| Транспортный граф | 15 км | Только `highway`: motorway, trunk, primary, secondary, tertiary |

Транспортный граф намеренно ограничен главными дорогами — это сокращает объём данных на порядок и достаточно для построения 15–30-минутных изохрон.

### Проверка покрытия (`is_point_covered`)

- **БД доступна:** SQL-запрос `ST_Distance` к `walk_nodes`, порог 1 км.
- **БД недоступна (файловый режим):** haversine-расстояние до ближайшего здания из файла, порог 5 км.
- **При ошибке:** возвращает результат файловой проверки (не блокирует UI).

### Инвалидация кэшей

После успешной загрузки вызывает через динамический импорт:
- `geo_repository.invalidate_cache()` — сбрасывает `lru_cache` репозитория
- `isochrones_module.invalidate_graph_cache()` — очищает `_GRAPH_CACHE`
- `accessibility_module.invalidate_cache()`
- `placement_module.invalidate_cache()`

---

## Взаимодействие фронтенд — бэкенд

```
Frontend (React)              Backend (FastAPI)
─────────────────             ─────────────────────────
App.tsx                       
  │                           
  ├─ GET /buildings ──────────► buildings.py → geo_repository
  ├─ GET /infrastructure/* ───► infrastructure.py → geo_repository
  │    (при старте)            
  │                           
  ├─ GET /coverage/check ─────► coverage.py → osm_service.is_point_covered()
  │    (при выборе точки)      
  │                           
  ├─ POST /coverage/fetch ────► coverage.py → Thread(osm_service.fetch_osm_data())
  │    + polling               
  │    GET /coverage/status/{id}
  │    (если нет покрытия)     
  │                           
  ├─ POST /analyze ───────────► analyze.py → accessibility_service
  │    (кнопка «Анализ»)            → accessibility_module
  │                                 → isochrones_module (walk + drive)
  │                           
  └─ POST /optimize ──────────► optimize.py → placement_service
       (кнопка «Размещение»)        → accessibility_module (повторный анализ)
                                    → placement_module
```

HTTP-клиент: `frontend/src/services/api.ts`. Базовый URL: `VITE_API_URL` из env (по умолчанию `http://localhost:8000`).

---

## Компоненты фронтенда

### `App.tsx` — центральный оркестратор

Управляет всем состоянием приложения:
- `selectedBuilding` — выбранное здание/точка
- `analyzeResult` — результат POST /analyze
- `status` — машина состояний: `loading_layers → idle → building_selected → analyzing → fetching_coverage → analyzed → optimizing → optimized → error`
- `modals` — список открытых отчётов оптимизации
- `layerVisibility` — видимость слоёв карты
- `inputMode` / `mapPickMode` — режим выбора точки (карта / координаты / пикинг с карты)

### `MapView` — карта (OpenLayers)

Использует `forwardRef` + `useImperativeHandle` для императивного управления из `App.tsx`.

**Слои:**
| Слой | Тип | Содержимое |
|------|-----|-----------|
| `buildings` | VectorLayer | Серые точки жилых домов |
| `kindergarten` | VectorLayer | Жёлтые кружки |
| `school` | VectorLayer | Синие кружки |
| `hospital` | VectorLayer | Красные кружки |
| `isochrones` | VectorLayer | Полигоны изохрон (zIndex 5) |
| `suggestions` | VectorLayer | Полигон + ромбы предложений (zIndex 10) |
| `selected` | VectorLayer | Оранжевый кружок выбранной точки (zIndex 20) |

**Публичный API (`MapViewHandle`):**
- `showIsochrones(entries)` — отрисовать изохроны
- `showSuggestions(sites, fallback)` — отрисовать предложения
- `clearOverlays()` — очистить изохроны и предложения
- `setLayerVisible(layer, visible)` — переключить слой
- `selectCoordinate(lon, lat)` — показать маркер + центрировать карту

**Режим пикинга:** при `onCoordinatePick !== null` курсор становится crosshair, любой клик передаёт координаты в `App` вместо выбора здания. Стабилизируется через `useRef` (нет проблемы stale closure).

### `AnalysisPanel` — панель анализа

- Переключатель режимов: «На карте» / «По координатам»
- В режиме координат: поля широты/долготы + кнопка «С карты» (активирует пикинг)
- Карточки результатов: ok/fail + badge + кнопка «Предложить размещение»
- Предупреждение о зоне без данных (`dataWarning`)

### `LayerControl` — переключатели слоёв

Чекбоксы видимости слоёв, включая изохроны (появляются после анализа) и предложения (после оптимизации).

### `ResultModal` — отчёт оптимизации

Всплывающая панель с рекомендациями. Можно открыть несколько одновременно (для разных типов объектов).

---

## Пользовательский сценарий

```
1. Открыть приложение
   └─ Загружаются слои зданий и инфраструктуры

2. Выбрать точку анализа
   ├─ Режим «На карте»: кликнуть по жилому дому
   ├─ Режим «По координатам»: ввести lat/lon вручную
   └─ Кнопка «С карты»: кликнуть произвольную точку (crosshair)
      └─ Если точка в 100 м от здания — снап к ближайшему зданию

3. (Автоматически) Проверка покрытия данными
   ├─ Точка покрыта → без предупреждений
   └─ Не покрыта → показать предупреждение «данные не загружены»

4. Нажать «Выполнить анализ»
   ├─ Если есть предупреждение → сначала загрузить OSM-данные
   │   ├─ POST /coverage/fetch → job_id
   │   ├─ Поллинг GET /coverage/status каждые 5 сек
   │   └─ После загрузки → обновить слои карты
   └─ POST /analyze → результаты + изохроны на карте
      ├─ OK: зелёная карточка
      └─ Нарушение: красная карточка + кнопка «Предложить размещение»

5. (Опционально) Нажать «Предложить размещение»
   └─ POST /optimize → маркеры и зона на карте + всплывающий отчёт
```

---

## Запуск

### Локально (без Docker)
```bash
# База данных
docker-compose up db -d
cd backend && python -m db.init_db

# Бэкенд
cd backend && uvicorn main:app --reload --port 8000

# Фронтенд
cd frontend && npm run dev
```

### Docker (всё вместе)
```bash
docker-compose up --build
# После первого запуска — инициализация БД:
docker-compose exec backend python -m db.init_db
```

### Инициализация БД
```bash
python -m db.init_db          # первичная загрузка (пропускает заполненные таблицы)
python -m db.init_db --reset  # полный сброс и перезагрузка
```

**Данные для подключения:**
- Host: `localhost`, Port: `5432`
- Database: `infrastructure`, User: `postgres`, Password: `postgres`
