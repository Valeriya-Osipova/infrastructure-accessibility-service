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
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  LayerVisibility,
  OptimizeResponse,
  SelectedBuilding,
} from './types';
import './App.css';

export default function App() {
  const mapRef = useRef<MapViewHandle>(null);

  const [buildings, setBuildings] = useState<GeoJSONFeatureCollection | null>(null);
  const [infrastructure, setInfrastructure] = useState<GeoJSONFeatureCollection | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<SelectedBuilding | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResponse | null>(null);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    buildings: true,
    infrastructure: true,
    isochrones: true,
    suggestions: true,
  });

  // Load data on mount
  useEffect(() => {
    setStatus('loading_layers');
    Promise.all([api.getBuildings(), api.getInfrastructure()])
      .then(([b, i]) => {
        setBuildings(b);
        setInfrastructure(i);
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
    mapRef.current.setLayerVisible('buildings', layerVisibility.buildings);
    mapRef.current.setLayerVisible('infrastructure', layerVisibility.infrastructure);
    mapRef.current.setLayerVisible('isochrones', layerVisibility.isochrones);
    mapRef.current.setLayerVisible('suggestions', layerVisibility.suggestions);
  }, [layerVisibility]);

  const handleLayerChange = useCallback(
    (layer: keyof LayerVisibility, value: boolean) => {
      setLayerVisibility((prev) => ({ ...prev, [layer]: value }));
    },
    [],
  );

  const handleBuildingSelect = useCallback((building: SelectedBuilding) => {
    setSelectedBuilding(building);
    setAnalyzeResult(null);
    setOptimizeResult(null);
    setShowModal(false);
    mapRef.current?.clearOverlays();
    setStatus('building_selected');
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!selectedBuilding) return;
    setStatus('analyzing');
    setError(null);
    setAnalyzeResult(null);
    setOptimizeResult(null);
    mapRef.current?.clearOverlays();

    try {
      const result = await api.analyze(selectedBuilding.lat, selectedBuilding.lon);
      setAnalyzeResult(result);
      setStatus('analyzed');

      // Collect all isochrones to display
      const isoFeatures: GeoJSONFeature[] = [];
      if (result.kindergarten.isochrone) isoFeatures.push(result.kindergarten.isochrone);
      if (result.school.iso_walk) isoFeatures.push(result.school.iso_walk);
      if (result.school.iso_drive) isoFeatures.push(result.school.iso_drive);
      if (result.hospital.iso_walk) isoFeatures.push(result.hospital.iso_walk);
      if (result.hospital.iso_drive) isoFeatures.push(result.hospital.iso_drive);

      mapRef.current?.showIsochrones(isoFeatures);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Ошибка анализа: ${msg}`);
      setStatus('error');
    }
  }, [selectedBuilding]);

  const handleOptimize = useCallback(async () => {
    if (!selectedBuilding || !analyzeResult) return;
    setStatus('optimizing');
    setError(null);

    const failedTypes = (['kindergarten', 'school', 'hospital'] as const).filter(
      (t) => !analyzeResult[t].ok,
    );

    try {
      const result = await api.optimize(selectedBuilding.lat, selectedBuilding.lon, failedTypes);
      setOptimizeResult(result);
      setStatus('optimized');
      setShowModal(true);

      // Show suggestions on map (take first available type)
      for (const [, rec] of Object.entries(result.recommendations)) {
        if (rec) {
          mapRef.current?.showSuggestions(rec.recommended_sites, rec.fallback_zone);
          break;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Ошибка оптимизации: ${msg}`);
      setStatus('error');
    }
  }, [selectedBuilding, analyzeResult]);

  return (
    <div className="app">
      <Sidebar>
        <LayerControl visibility={layerVisibility} onChange={handleLayerChange} />
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
          infrastructure={infrastructure}
          onBuildingSelect={handleBuildingSelect}
        />
      </main>

      {showModal && optimizeResult && (
        <ResultModal data={optimizeResult} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
