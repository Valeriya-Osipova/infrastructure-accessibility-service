import { useEffect, useRef, useState } from 'react';
import type { LayerVisibility } from '../../types';
import './LayerControl.css';

interface LayerControlProps {
  visibility: LayerVisibility;
  onChange: (layer: keyof LayerVisibility, value: boolean) => void;
  hasIsochrones: boolean;
  hasSuggestions: boolean;
}

const INFRA_ITEMS: { key: keyof LayerVisibility; label: string; color: string }[] = [
  { key: 'kindergarten', label: 'Детский сад', color: '#f59e0b' },
  { key: 'school',       label: 'Школа',       color: '#3b82f6' },
  { key: 'hospital',     label: 'Больница',     color: '#ef4444' },
];

export default function LayerControl({
  visibility,
  onChange,
  hasIsochrones,
  hasSuggestions,
}: LayerControlProps) {
  const [infraExpanded, setInfraExpanded] = useState(true);

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

  return (
    <div className="layer-control">
      <h3 className="layer-control__title">Слои</h3>
      <ul className="layer-control__list">

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

        {/* Зоны доступности — неактивны до анализа */}
        <li className={`layer-control__item${!hasIsochrones ? ' layer-control__item--disabled' : ''}`}>
          <label className="layer-control__label">
            <input
              type="checkbox"
              checked={visibility.isochrones}
              onChange={(e) => onChange('isochrones', e.target.checked)}
              className="layer-control__checkbox"
              disabled={!hasIsochrones}
            />
            <span className="layer-control__dot layer-control__dot--zone" />
            Зоны доступности
            {!hasIsochrones && <span className="layer-control__hint">нет данных</span>}
          </label>
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

      </ul>
    </div>
  );
}
