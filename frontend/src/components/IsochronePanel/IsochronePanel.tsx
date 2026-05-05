import { useState } from 'react';
import type { IsochroneMode, IsochroneLimitType } from '../../types';
import './IsochronePanel.css';

interface IsochronePanelProps {
  isBuilding: boolean;
  pickMode: boolean;
  pickedCoord: { lat: number; lon: number } | null;
  hasIsochrone: boolean;
  onBuild: (lat: number, lon: number, mode: IsochroneMode, limit: number, limitType: IsochroneLimitType) => void;
  onClear: () => void;
  onStartPick: () => void;
}

const DEFAULTS: Record<IsochroneMode, { limitType: IsochroneLimitType; limit: number }> = {
  walk:  { limitType: 'meters',  limit: 500 },
  drive: { limitType: 'minutes', limit: 15  },
};

export default function IsochronePanel({
  isBuilding,
  pickMode,
  pickedCoord,
  hasIsochrone,
  onBuild,
  onClear,
  onStartPick,
}: IsochronePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<IsochroneMode>('walk');
  const [limitType, setLimitType] = useState<IsochroneLimitType>('meters');
  const [limit, setLimit] = useState(500);
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);

  // Заполняем поля когда пользователь выбрал точку кликом
  const [prevPickedCoord, setPrevPickedCoord] = useState(pickedCoord);
  if (prevPickedCoord !== pickedCoord && pickedCoord) {
    setPrevPickedCoord(pickedCoord);
    setLatInput(String(pickedCoord.lat));
    setLonInput(String(pickedCoord.lon));
    setCoordError(null);
  }

  function handleModeChange(m: IsochroneMode) {
    setMode(m);
    setLimitType(DEFAULTS[m].limitType);
    setLimit(DEFAULTS[m].limit);
  }

  function handleSubmit() {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setCoordError('Широта: число от −90 до 90');
      return;
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      setCoordError('Долгота: число от −180 до 180');
      return;
    }
    if (limit <= 0) {
      setCoordError('Значение должно быть больше 0');
      return;
    }
    setCoordError(null);
    onBuild(lat, lon, mode, limit, limitType);
  }

  const unitLabel = limitType === 'meters' ? 'м' : 'мин';

  return (
    <div className="iso-panel">
      <button className="iso-panel__header" onClick={() => setCollapsed((v) => !v)}>
        <span className="iso-panel__header-title">Изохроны</span>
        <span className="iso-panel__header-chevron">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="iso-panel__body">
          {/* Режим */}
          <div className="iso-panel__row">
            <span className="iso-panel__label">Режим</span>
            <div className="iso-panel__toggle">
              <button
                className={`iso-panel__toggle-btn${mode === 'walk' ? ' active' : ''}`}
                onClick={() => handleModeChange('walk')}
              >
                Пешком
              </button>
              <button
                className={`iso-panel__toggle-btn${mode === 'drive' ? ' active' : ''}`}
                onClick={() => handleModeChange('drive')}
              >
                Транспорт
              </button>
            </div>
          </div>

          {/* Тип ограничения */}
          <div className="iso-panel__row">
            <span className="iso-panel__label">Тип</span>
            <div className="iso-panel__toggle">
              <button
                className={`iso-panel__toggle-btn${limitType === 'meters' ? ' active' : ''}`}
                onClick={() => setLimitType('meters')}
              >
                Метры
              </button>
              <button
                className={`iso-panel__toggle-btn${limitType === 'minutes' ? ' active' : ''}`}
                onClick={() => setLimitType('minutes')}
              >
                Минуты
              </button>
            </div>
          </div>

          {/* Значение */}
          <div className="iso-panel__row">
            <span className="iso-panel__label">Значение</span>
            <div className="iso-panel__value-row">
              <input
                className="iso-panel__value-input"
                type="number"
                min={1}
                step={limitType === 'meters' ? 100 : 1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
              <span className="iso-panel__unit">{unitLabel}</span>
            </div>
          </div>

          {/* Координаты */}
          <div className="iso-panel__coords">
            <div className="iso-panel__coord-row">
              <label className="iso-panel__coord-label">Широта</label>
              <input
                className={`iso-panel__coord-input${coordError ? ' error' : ''}`}
                type="number"
                step="any"
                placeholder="55.75"
                value={latInput}
                onChange={(e) => { setLatInput(e.target.value); setCoordError(null); }}
              />
            </div>
            <div className="iso-panel__coord-row">
              <label className="iso-panel__coord-label">Долгота</label>
              <input
                className={`iso-panel__coord-input${coordError ? ' error' : ''}`}
                type="number"
                step="any"
                placeholder="37.6"
                value={lonInput}
                onChange={(e) => { setLonInput(e.target.value); setCoordError(null); }}
              />
            </div>
            {coordError && <p className="iso-panel__error">{coordError}</p>}

            <button
              className={`iso-panel__pick-btn${pickMode ? ' active' : ''}`}
              onClick={onStartPick}
            >
              {pickMode ? '✕ Отмена' : '📍 Указать на карте'}
            </button>
            {pickMode && (
              <p className="iso-panel__pick-hint">Нажмите на любое место карты</p>
            )}
          </div>

          {/* Кнопки действий */}
          <div className="iso-panel__actions">
            <button
              className="iso-panel__build-btn"
              onClick={handleSubmit}
              disabled={isBuilding}
            >
              {isBuilding && <span className="iso-panel__spinner" />}
              {isBuilding ? 'Строим...' : 'Построить'}
            </button>
            {hasIsochrone && (
              <button className="iso-panel__clear-btn" onClick={onClear} disabled={isBuilding}>
                Очистить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
