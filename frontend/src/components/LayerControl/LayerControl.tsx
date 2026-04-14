import type { LayerVisibility } from '../../types';
import './LayerControl.css';

interface LayerControlProps {
  visibility: LayerVisibility;
  onChange: (layer: keyof LayerVisibility, value: boolean) => void;
}

const LAYERS: { key: keyof LayerVisibility; label: string; color: string }[] = [
  { key: 'buildings', label: 'Жилые дома', color: '#64748b' },
  { key: 'infrastructure', label: 'Инфраструктура', color: '#f59e0b' },
  { key: 'isochrones', label: 'Зоны доступности', color: '#3b82f6' },
  { key: 'suggestions', label: 'Предложения', color: '#a855f7' },
];

export default function LayerControl({ visibility, onChange }: LayerControlProps) {
  return (
    <div className="layer-control">
      <h3 className="layer-control__title">Слои</h3>
      <ul className="layer-control__list">
        {LAYERS.map(({ key, label, color }) => (
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
                style={{ background: color }}
              />
              {label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
