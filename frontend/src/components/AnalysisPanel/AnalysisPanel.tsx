import { useState } from 'react';
import type { AnalyzeResponse, ObjectType, SelectedBuilding, AppStatus } from '../../types';
import './AnalysisPanel.css';

interface AnalysisPanelProps {
  selectedBuilding: SelectedBuilding | null;
  status: AppStatus;
  analyzeResult: AnalyzeResponse | null;
  analysisDuration: number | null;
  dataWarning: string | null;
  inputMode: 'click' | 'coords';
  mapPickMode: boolean;
  mapPickedCoord: { lat: number; lon: number } | null;
  onInputModeChange: (mode: 'click' | 'coords') => void;
  onManualCoordSelect: (lat: number, lon: number) => void;
  onStartMapPick: () => void;
  onAnalyze: () => void;
  onOptimize: (type: ObjectType) => void;
}

const ICONS: Record<string, string> = {
  kindergarten: '🏫',
  school: '📚',
  hospital: '🏥',
};

const LABELS: Record<string, string> = {
  kindergarten: 'Детский сад',
  school: 'Школа',
  hospital: 'Больница',
};

export default function AnalysisPanel({
  selectedBuilding,
  status,
  analyzeResult,
  analysisDuration,
  dataWarning,
  inputMode,
  mapPickMode,
  mapPickedCoord,
  onInputModeChange,
  onManualCoordSelect,
  onStartMapPick,
  onAnalyze,
  onOptimize,
}: AnalysisPanelProps) {
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);

  // Заполняем поля когда пользователь выбрал точку кликом по карте
  // (React-Compiler-совместимый derived state — в render, не в effect)
  const [prevPickedCoord, setPrevPickedCoord] = useState(mapPickedCoord);
  if (prevPickedCoord !== mapPickedCoord && mapPickedCoord) {
    setPrevPickedCoord(mapPickedCoord);
    setLatInput(String(mapPickedCoord.lat));
    setLonInput(String(mapPickedCoord.lon));
    setCoordError(null);
  }

  const isAnalyzing = status === 'analyzing' || status === 'fetching_coverage';
  const isOptimizing = status === 'optimizing';

  function handleCoordSubmit() {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);

    console.log(latInput, lonInput);
    
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setCoordError('Широта должна быть числом от -90 до 90');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setCoordError('Долгота должна быть числом от -180 до 180');
      return;
    }
    setCoordError(null);
    onManualCoordSelect(lat, lon);
  }

  return (
    <div className="analysis-panel">
      <h3 className="analysis-panel__title">Анализ доступности</h3>

      {/* Переключатель режима */}
      <div className="analysis-panel__mode-tabs">
        <button
          className={`analysis-panel__mode-tab${inputMode === 'click' ? ' active' : ''}`}
          onClick={() => onInputModeChange('click')}
        >
          На карте
        </button>
        <button
          className={`analysis-panel__mode-tab${inputMode === 'coords' ? ' active' : ''}`}
          onClick={() => onInputModeChange('coords')}
        >
          По координатам
        </button>
      </div>

      {/* Ручной ввод координат */}
      {inputMode === 'coords' && (
        <div className="analysis-panel__coords-form">
          <div className="analysis-panel__coord-row">
            <label className="analysis-panel__coord-label">Широта</label>
            <input
              className={`analysis-panel__coord-input${coordError ? ' error' : ''}`}
              type="number"
              step="any"
              value={latInput}
              onChange={(e) => { setLatInput(e.target.value); setCoordError(null); }}
            />
          </div>
          <div className="analysis-panel__coord-row">
            <label className="analysis-panel__coord-label">Долгота</label>
            <input
              className={`analysis-panel__coord-input${coordError ? ' error' : ''}`}
              type="number"
              step="any"
              value={lonInput}
              onChange={(e) => { setLonInput(e.target.value); setCoordError(null); }}
            />
          </div>
          {coordError && <p className="analysis-panel__coord-error">{coordError}</p>}
          <div className="analysis-panel__coords-actions">
            <button
              className="analysis-panel__btn analysis-panel__btn--secondary"
              onClick={handleCoordSubmit}
            >
              Выбрать точку
            </button>
            <button
              className={`analysis-panel__btn analysis-panel__btn--pick${mapPickMode ? ' active' : ''}`}
              onClick={onStartMapPick}
              title="Кликните на карте чтобы выбрать точку"
            >
              {mapPickMode ? '✕ Отмена' : '📍 С карты'}
            </button>
          </div>
          {mapPickMode && (
            <p className="analysis-panel__hint analysis-panel__hint--pick">
              Нажмите на любое место карты
            </p>
          )}
        </div>
      )}

      {/* Подсказка при отсутствии выбранной точки */}
      {!selectedBuilding && inputMode === 'click' && (
        <p className="analysis-panel__hint">
          Нажмите на жилой дом на карте, чтобы выбрать его.
        </p>
      )}

      {/* Выбранная точка */}
      {selectedBuilding && (
        <>
          <div className="analysis-panel__building">
            <span className="analysis-panel__building-icon">
              {selectedBuilding.snapped ? '🏠' : '📍'}
            </span>
            <div className="analysis-panel__building-info">
              <span className="analysis-panel__building-coords">
                {selectedBuilding.lat.toFixed(5)}, {selectedBuilding.lon.toFixed(5)}
              </span>
              <span className="analysis-panel__building-tag">
                {selectedBuilding.snapped
                  ? 'привязка к ближайшему зданию'
                  : 'точные координаты'}
              </span>
            </div>
          </div>

          {/* Предупреждение о зоне без данных */}
          {dataWarning && (
            <div className="analysis-panel__data-warning">
              {dataWarning}
            </div>
          )}

          <button
            className="analysis-panel__btn analysis-panel__btn--primary"
            onClick={onAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing && <span className="analysis-panel__spinner" />}
            {status === 'fetching_coverage'
              ? 'Загрузка данных OSM...'
              : isAnalyzing
              ? 'Выполняется анализ...'
              : 'Выполнить анализ'}
          </button>

          {analysisDuration !== null && !isAnalyzing && (
            <p className="analysis-panel__timing">
              Выполнено за {analysisDuration.toFixed(1)} с
            </p>
          )}

          {analyzeResult && (
            <div className="analysis-panel__results">
              {(['kindergarten', 'school', 'hospital'] as const).map((type) => {
                const result = analyzeResult[type];
                return (
                  <div
                    key={type}
                    className={`analysis-panel__result-item ${result.ok ? 'ok' : 'fail'}`}
                  >
                    <div className="analysis-panel__result-row">
                      <span className="analysis-panel__result-icon">{ICONS[type]}</span>
                      <div className="analysis-panel__result-info">
                        <span className="analysis-panel__result-name">{LABELS[type]}</span>
                        <span className="analysis-panel__result-norm">{result.norm}</span>
                      </div>
                      <span className={`analysis-panel__badge ${result.ok ? 'ok' : 'fail'}`}>
                        {result.ok ? 'OK' : 'Нарушение'}
                      </span>
                    </div>

                    {!result.ok && (
                      <div className="analysis-panel__result-actions">
                        <button
                          className="analysis-panel__suggest-btn"
                          onClick={() => onOptimize(type)}
                          disabled={isOptimizing}
                        >
                          {isOptimizing ? '...' : '↗ Предложить размещение'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
