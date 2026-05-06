import { useEffect, useRef, useState } from 'react';
import type { LayerVisibility } from '../../types';
import './LayerControl.css';

interface LayerControlProps {
  visibility: LayerVisibility;
  onChange: (layer: keyof LayerVisibility, value: boolean) => void;
  hasIsochrones: boolean;
  hasSuggestions: boolean;
  hasToolIsochrone: boolean;
}

const INFRA_ITEMS: { key: keyof LayerVisibility; label: string; color: string }[] = [
  { key: 'kindergarten', label: 'Детский сад', color: '#f59e0b' },
  { key: 'school',       label: 'Школа',       color: '#3b82f6' },
  { key: 'hospital',     label: 'Больница',     color: '#ef4444' },
];

const ISOCHRONE_ITEMS: { key: keyof LayerVisibility; label: string; color: string }[] = [
  { key: 'isochrone_kindergarten', label: 'Дет. сад', color: '#f59e0b' },
  { key: 'isochrone_school',       label: 'Школа',    color: '#3b82f6' },
  { key: 'isochrone_hospital',     label: 'ФАП',      color: '#ef4444' },
];

export default function LayerControl({
  visibility,
  onChange,
  hasIsochrones,
  hasSuggestions,
  hasToolIsochrone,
}: LayerControlProps) {
  const [infraExpanded, setInfraExpanded] = useState(true);
  const [isoExpanded, setIsoExpanded] = useState(true);

  // Состояние родительского чекбокса «Инфраструктура»
  const infraAll  = INFRA_ITEMS.every(({ key }) => visibility[key]);
  const infraNone = INFRA_ITEMS.every(({ key }) => !visibility[key]);
  const infraMixed = !infraAll && !infraNone;

  const infraCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (infraCheckRef.current) {
      infraCheckRef.current.indeterminate = infraMixed;
    }
  }, [infraMixed]);

  const handleInfraAll = (checked: boolean) => {
    INFRA_ITEMS.forEach(({ key }) => onChange(key, checked));
  };

  // Состояние родительского чекбокса «Зоны доступности»
  const isoAll  = ISOCHRONE_ITEMS.every(({ key }) => visibility[key]);
  const isoNone = ISOCHRONE_ITEMS.every(({ key }) => !visibility[key]);
  const isoMixed = !isoAll && !isoNone;

  const isoCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isoCheckRef.current) {
      isoCheckRef.current.indeterminate = isoMixed;
    }
  }, [isoMixed]);

  const handleIsoAll = (checked: boolean) => {
    ISOCHRONE_ITEMS.forEach(({ key }) => onChange(key, checked));
  };

  return (
    <div className="layer-control">
      <h3 className="layer-control__title">Слои</h3>
      <ul className="layer-control__list">

        {/* Граница региона */}
        <li className="layer-control__item">
          <label className="layer-control__label">
            <input
              type="checkbox"
              checked={visibility.region}
              onChange={(e) => onChange('region', e.target.checked)}
              className="layer-control__checkbox"
            />
            <span className="layer-control__dot" style={{ background: '#6366f1' }} />
            Граница региона
          </label>
        </li>

        {/* Жилые дома */}
        <li className="layer-control__item">
          <label className="layer-control__label">
            <input
              type="checkbox"
              checked={visibility.buildings}
              onChange={(e) => onChange('buildings', e.target.checked)}
              className="layer-control__checkbox"
            />
            <span className="layer-control__dot" style={{ background: '#64748b' }} />
            Жилые дома
          </label>
        </li>

        {/* Группа «Инфраструктура» */}
        <li className="layer-control__group">
          <div className="layer-control__group-header">
            <button
              className="layer-control__expand"
              onClick={() => setInfraExpanded((v) => !v)}
              aria-label={infraExpanded ? 'Свернуть' : 'Развернуть'}
            >
              {infraExpanded ? '▾' : '▸'}
            </button>
            <label className="layer-control__label">
              <input
                ref={infraCheckRef}
                type="checkbox"
                checked={infraAll}
                onChange={(e) => handleInfraAll(e.target.checked)}
                className="layer-control__checkbox"
              />
              Инфраструктура
            </label>
          </div>

          {infraExpanded && (
            <ul className="layer-control__sublist">
              {INFRA_ITEMS.map(({ key, label, color }) => (
                <li key={key} className="layer-control__item">
                  <label className="layer-control__label">
                    <input
                      type="checkbox"
                      checked={visibility[key]}
                      onChange={(e) => onChange(key, e.target.checked)}
                      className="layer-control__checkbox"
                    />
                    <span className="layer-control__dot" style={{ background: color }} />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </li>

        {/* Группа «Зоны доступности» — неактивна до анализа */}
        <li className={`layer-control__group${!hasIsochrones ? ' layer-control__item--disabled' : ''}`}>
          <div className="layer-control__group-header">
            <button
              className="layer-control__expand"
              onClick={() => { if (hasIsochrones) setIsoExpanded((v) => !v); }}
              aria-label={isoExpanded ? 'Свернуть' : 'Развернуть'}
              disabled={!hasIsochrones}
            >
              {isoExpanded ? '▾' : '▸'}
            </button>
            <label className="layer-control__label">
              <input
                ref={isoCheckRef}
                type="checkbox"
                checked={isoAll}
                onChange={(e) => handleIsoAll(e.target.checked)}
                className="layer-control__checkbox"
                disabled={!hasIsochrones}
              />
              Зоны доступности
              {!hasIsochrones && <span className="layer-control__hint">нет данных</span>}
            </label>
          </div>

          {isoExpanded && hasIsochrones && (
            <ul className="layer-control__sublist">
              {ISOCHRONE_ITEMS.map(({ key, label, color }) => (
                <li key={key} className="layer-control__item">
                  <label className="layer-control__label">
                    <input
                      type="checkbox"
                      checked={visibility[key]}
                      onChange={(e) => onChange(key, e.target.checked)}
                      className="layer-control__checkbox"
                    />
                    <span
                      className="layer-control__dot"
                      style={{ background: 'transparent', border: `2px dashed ${color}`, boxSizing: 'border-box' }}
                    />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </li>

        {/* Предложения — неактивны до оптимизации */}
        <li className={`layer-control__item${!hasSuggestions ? ' layer-control__item--disabled' : ''}`}>
          <label className="layer-control__label">
            <input
              type="checkbox"
              checked={visibility.suggestions}
              onChange={(e) => onChange('suggestions', e.target.checked)}
              className="layer-control__checkbox"
              disabled={!hasSuggestions}
            />
            <span className="layer-control__dot" style={{ background: '#a855f7' }} />
            Предложения
            {!hasSuggestions && <span className="layer-control__hint">нет данных</span>}
          </label>
        </li>

        {/* Изохрона инструмента — неактивна пока не построена */}
        <li className={`layer-control__item${!hasToolIsochrone ? ' layer-control__item--disabled' : ''}`}>
          <label className="layer-control__label">
            <input
              type="checkbox"
              checked={visibility.toolIsochrone}
              onChange={(e) => onChange('toolIsochrone', e.target.checked)}
              className="layer-control__checkbox"
              disabled={!hasToolIsochrone}
            />
            <span className="layer-control__dot" style={{ background: '#14b8a6' }} />
            Изохрона
            {!hasToolIsochrone && <span className="layer-control__hint">нет данных</span>}
          </label>
        </li>

      </ul>
    </div>
  );
}
