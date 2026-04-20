import { useCallback, useEffect, useRef, useState } from 'react';
import MapView, { type MapViewHandle } from './components/MapView/MapView';
import Sidebar from './components/Sidebar/Sidebar';
import LayerControl from './components/LayerControl/LayerControl';
import AnalysisPanel from './components/AnalysisPanel/AnalysisPanel';
import ResultModal from './components/ResultModal/ResultModal';
import { api } from './services/api';
import type {
  AnalyzeResponse,
  AppStatus,
  GeoJSONFeatureCollection,
  IsochroneEntry,
  LayerVisibility,
  ObjectType,
  OptimizeResponse,
  SelectedBuilding,
} from './types';
import './App.css';

interface ModalEntry {
  id: string;
  data: OptimizeResponse;
  type: ObjectType;
}

/** Формула гаверсинуса — расстояние в метрах между двумя точками (lat/lon). */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export default function App() {
  const mapRef = useRef<MapViewHandle>(null);

  const [buildings, setBuildings] = useState<GeoJSONFeatureCollection | null>(null);
  const [kindergartens, setKindergartens] = useState<GeoJSONFeatureCollection | null>(null);
  const [schools, setSchools] = useState<GeoJSONFeatureCollection | null>(null);
  const [hospitals, setHospitals] = useState<GeoJSONFeatureCollection | null>(null);

  const [selectedBuilding, setSelectedBuilding] = useState<SelectedBuilding | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>('loading_layers');
  const [error, setError] = useState<string | null>(null);

  // Независимые плавающие отчёты
  const [modals, setModals] = useState<ModalEntry[]>([]);

  // Режим выбора точки
  const [inputMode, setInputMode] = useState<'click' | 'coords'>('click');

  // Режим пикинга координат с карты (активируется кнопкой "Указать на карте")
  const [mapPickMode, setMapPickMode] = useState(false);
  const [mapPickedCoord, setMapPickedCoord] = useState<{ lat: number; lon: number } | null>(null);

  // Время выполнения анализа
  const analysisStartRef = useRef<number | null>(null);
  const [analysisDuration, setAnalysisDuration] = useState<number | null>(null);

  // Предупреждение о зоне без данных (задача 4)
  const [dataWarning, setDataWarning] = useState<string | null>(null);

  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    buildings: true,
    kindergarten: true,
    school: true,
    hospital: true,
    isochrones: false,
    suggestions: false,
  });

  // Загрузка слоёв при старте
  useEffect(() => {
    Promise.all([
      api.getBuildings(),
      api.getKindergartens(),
      api.getSchools(),
      api.getHospitals(),
    ])
      .then(([b, k, s, h]) => {
        setBuildings(b);
        setKindergartens(k);
        setSchools(s);
        setHospitals(h);
        setStatus('idle');
      })
      .catch((e) => {
        setError(`Ошибка загрузки данных: ${e.message}`);
        setStatus('error');
      });
  }, []);

  // Синхронизация видимости слоёв с картой
  useEffect(() => {
    if (!mapRef.current) return;
    (Object.keys(layerVisibility) as (keyof LayerVisibility)[]).forEach((key) => {
      mapRef.current!.setLayerVisible(key, layerVisibility[key]);
    });
  }, [layerVisibility]);

  const handleLayerChange = useCallback((layer: keyof LayerVisibility, value: boolean) => {
    setLayerVisibility((prev) => ({ ...prev, [layer]: value }));
  }, []);

  const handleBuildingSelect = useCallback((building: SelectedBuilding) => {
    setSelectedBuilding(building);
    setAnalyzeResult(null);
    setAnalysisDuration(null);
    setDataWarning(null);
    mapRef.current?.clearOverlays();
    setLayerVisibility((prev) => ({ ...prev, isochrones: false, suggestions: false }));
    setStatus('building_selected');

    // Асинхронно проверяем покрытие данными
    api.checkCoverage(building.lat, building.lon)
      .then(({ covered }) => {
        if (!covered) {
          setDataWarning(
            'Данные в заданной зоне не загружены. Возможно, потребуется время для ' +
            'подтягивания данных из открытых источников. Нажмите «Выполнить анализ» ' +
            'для автоматической загрузки.'
          );
        }
      })
      .catch(() => { /* не блокируем UI при ошибке проверки */ });
  }, []);

  /**
   * Находит ближайшее здание в радиусе 100 м.
   * Если найдено — снапится к нему; иначе — использует точные координаты.
   */
  const handleManualCoordSelect = useCallback(
    (lat: number, lon: number) => {
      let snapped = false;
      let finalLat = lat;
      let finalLon = lon;

      if (buildings) {
        let minDist = Infinity;
        let nearest: { lat: number; lon: number } | null = null;
        for (const feat of buildings.features) {
          const [fLon, fLat] = feat.geometry.coordinates as [number, number];
          const d = haversineMeters(lat, lon, fLat, fLon);
          if (d < minDist) {
            minDist = d;
            nearest = { lat: fLat, lon: fLon };
          }
        }
        if (nearest && minDist <= 100) {
          finalLat = nearest.lat;
          finalLon = nearest.lon;
          snapped = true;
        }
      }

      mapRef.current?.selectCoordinate(finalLon, finalLat);

      handleBuildingSelect({
        lat: finalLat,
        lon: finalLon,
        snapped,
        feature: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [finalLon, finalLat] },
          properties: {},
        },
      });
    },
    [buildings, handleBuildingSelect],
  );

  /** Перезагружает данные всех слоёв с бэкенда (после загрузки OSM) */
  const refreshLayers = useCallback(async () => {
    try {
      const [b, k, s, h] = await Promise.all([
        api.getBuildings(),
        api.getKindergartens(),
        api.getSchools(),
        api.getHospitals(),
      ]);
      setBuildings(b);
      setKindergartens(k);
      setSchools(s);
      setHospitals(h);
    } catch {
      // не блокируем UI если обновление слоёв упало
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedBuilding) return;
    setStatus('analyzing');
    setError(null);
    setAnalyzeResult(null);
    setAnalysisDuration(null);
    mapRef.current?.clearOverlays();
    setLayerVisibility((prev) => ({ ...prev, isochrones: false, suggestions: false }));

    analysisStartRef.current = performance.now();

    try {
      // Если данные не покрыты — сначала загружаем из OSM (фоновый джоб)
      if (dataWarning) {
        setStatus('fetching_coverage');
        setError(null);
        const { job_id } = await api.startCoverageFetch(selectedBuilding.lat, selectedBuilding.lon);
        // Поллим статус каждые 5 секунд
        await new Promise<void>((resolve, reject) => {
          const poll = async () => {
            try {
              const job = await api.getCoverageStatus(job_id);
              if (job.status === 'done') { resolve(); return; }
              if (job.status === 'error') { reject(new Error(job.error ?? 'Ошибка загрузки OSM')); return; }
              setTimeout(poll, 5_000);
            } catch (e) { reject(e); }
          };
          poll();
        });
        setDataWarning(null);
        await refreshLayers();
        setStatus('analyzing');
        analysisStartRef.current = performance.now();
      }

      const result = await api.analyze(selectedBuilding.lat, selectedBuilding.lon);

      const elapsed = (performance.now() - (analysisStartRef.current ?? 0)) / 1000;
      setAnalysisDuration(elapsed);

      setAnalyzeResult(result);

      const entries: IsochroneEntry[] = [];
      if (result.kindergarten.isochrone)
        entries.push({ feature: result.kindergarten.isochrone, type: 'kindergarten', mode: 'walk' });
      if (result.school.iso_walk)
        entries.push({ feature: result.school.iso_walk, type: 'school', mode: 'walk' });
      if (result.school.iso_drive)
        entries.push({ feature: result.school.iso_drive, type: 'school', mode: 'drive' });
      if (result.hospital.iso_walk)
        entries.push({ feature: result.hospital.iso_walk, type: 'hospital', mode: 'walk' });
      if (result.hospital.iso_drive)
        entries.push({ feature: result.hospital.iso_drive, type: 'hospital', mode: 'drive' });

      mapRef.current?.showIsochrones(entries);
      setLayerVisibility((prev) => ({ ...prev, isochrones: true }));
      setStatus('analyzed');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Ошибка анализа: ${msg}`);
      setStatus('error');
    }
  }, [selectedBuilding, dataWarning, refreshLayers]);

  // Клик на карте — всегда снапится к зданию (hitTolerance в MapView)
  const handleMapBuildingSelect = useCallback(
    (building: SelectedBuilding) => {
      handleBuildingSelect({ ...building, snapped: true });
    },
    [handleBuildingSelect],
  );

  // Оптимизация для конкретного типа
  const handleOptimize = useCallback(
    async (type: ObjectType) => {
      if (!selectedBuilding) return;
      setStatus('optimizing');
      setError(null);

      try {
        const result = await api.optimize(selectedBuilding.lat, selectedBuilding.lon, [type]);

        const rec = result.recommendations[type];
        if (rec) {
          mapRef.current?.showSuggestions(rec.recommended_sites, rec.fallback_zone);
          setLayerVisibility((prev) => ({ ...prev, suggestions: true }));
        }

        setModals((prev) => [
          ...prev,
          { id: `${type}-${Date.now()}`, data: result, type },
        ]);

        setStatus('optimized');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Ошибка оптимизации: ${msg}`);
        setStatus('error');
      }
    },
    [selectedBuilding],
  );

  const handleCloseModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleInputModeChange = useCallback((mode: 'click' | 'coords') => {
    setInputMode(mode);
  }, []);

  /** Активирует режим пикинга: переключает на вкладку координат + включает crosshair на карте */
  const handleStartMapPick = useCallback(() => {
    setInputMode('coords');
    setMapPickMode(true);
  }, []);

  /** Вызывается MapView когда пользователь кликнул в режиме пикинга */
  const handleMapCoordinatePick = useCallback(
    (lat: number, lon: number) => {
      setMapPickMode(false);
      setMapPickedCoord({ lat, lon });
      handleManualCoordSelect(lat, lon);
    },
    [handleManualCoordSelect],
  );

  return (
    <div className="app">
      <Sidebar>
        <LayerControl
          visibility={layerVisibility}
          onChange={handleLayerChange}
          hasIsochrones={analyzeResult !== null}
          hasSuggestions={modals.length > 0}
        />
        <AnalysisPanel
          selectedBuilding={selectedBuilding}
          status={status}
          analyzeResult={analyzeResult}
          analysisDuration={analysisDuration}
          dataWarning={dataWarning}
          inputMode={inputMode}
          mapPickMode={mapPickMode}
          mapPickedCoord={mapPickedCoord}
          onInputModeChange={handleInputModeChange}
          onManualCoordSelect={handleManualCoordSelect}
          onStartMapPick={handleStartMapPick}
          onAnalyze={handleAnalyze}
          onOptimize={handleOptimize}
        />
        {error && <div className="app__error">{error}</div>}
        {status === 'loading_layers' && (
          <div className="app__loading">Загрузка данных...</div>
        )}
      </Sidebar>

      <main className="app__map">
        <MapView
          ref={mapRef}
          buildings={buildings}
          kindergartens={kindergartens}
          schools={schools}
          hospitals={hospitals}
          onBuildingSelect={handleMapBuildingSelect}
          onCoordinatePick={mapPickMode ? handleMapCoordinatePick : null}
        />
      </main>

      {modals.map((modal, index) => (
        <ResultModal
          key={modal.id}
          id={modal.id}
          data={modal.data}
          type={modal.type}
          modalIndex={index}
          onClose={handleCloseModal}
        />
      ))}
    </div>
  );
}
