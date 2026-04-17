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

export default function App() {
  const mapRef = useRef<MapViewHandle>(null);

  const [buildings, setBuildings] = useState<GeoJSONFeatureCollection | null>(null);
  const [kindergartens, setKindergartens] = useState<GeoJSONFeatureCollection | null>(null);
  const [schools, setSchools] = useState<GeoJSONFeatureCollection | null>(null);
  const [hospitals, setHospitals] = useState<GeoJSONFeatureCollection | null>(null);

  const [selectedBuilding, setSelectedBuilding] = useState<SelectedBuilding | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Независимые плавающие отчёты
  const [modals, setModals] = useState<ModalEntry[]>([]);

  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    buildings: true,
    kindergarten: true,
    school: true,
    hospital: true,
    isochrones: false,
    suggestions: false,
  });

  // Load data on mount
  useEffect(() => {
    setStatus('loading_layers');
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

  // Sync layer visibility to map
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
    mapRef.current?.clearOverlays();
    setLayerVisibility((prev) => ({ ...prev, isochrones: false, suggestions: false }));
    setStatus('building_selected');
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedBuilding) return;
    setStatus('analyzing');
    setError(null);
    setAnalyzeResult(null);
    mapRef.current?.clearOverlays();
    setLayerVisibility((prev) => ({ ...prev, isochrones: false, suggestions: false }));

    try {
      const result = await api.analyze(selectedBuilding.lat, selectedBuilding.lon);
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
  }, [selectedBuilding]);

  // Оптимизация для конкретного типа — не трогает изохроны
  const handleOptimize = useCallback(async (type: ObjectType) => {
    if (!selectedBuilding) return;
    setStatus('optimizing');
    setError(null);

    try {
      const result = await api.optimize(selectedBuilding.lat, selectedBuilding.lon, [type]);

      // Показываем предложения на карте
      const rec = result.recommendations[type];
      if (rec) {
        mapRef.current?.showSuggestions(rec.recommended_sites, rec.fallback_zone);
        setLayerVisibility((prev) => ({ ...prev, suggestions: true }));
      }

      // Добавляем новый независимый отчёт (не закрываем старые)
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
  }, [selectedBuilding]);

  const handleCloseModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((m) => m.id !== id));
  }, []);

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
          onBuildingSelect={handleBuildingSelect}
        />
      </main>

      {/* Независимые плавающие отчёты */}
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
