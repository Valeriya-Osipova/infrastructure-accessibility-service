import { useEffect, useState } from 'react';
import type { InfraAmenity, NearbyInfraObject } from '../../types';
import './InfraEditPanel.css';

const AMENITY_LABEL: Record<string, string> = {
  kindergarten: 'Дет.сад',
  school: 'Школа',
  hospital: 'Больница',
  clinic: 'ФАП',
};

const AMENITY_TYPES: InfraAmenity[] = ['kindergarten', 'school', 'hospital', 'clinic'];

interface InfraEditPanelProps {
  addPickMode: boolean;
  addPickedCoord: { lat: number; lon: number } | null;
  isAdding: boolean;
  deletePickMode: boolean;
  nearbyObjects: NearbyInfraObject[] | null;
  isSearchingNearby: boolean;
  isDeleting: boolean;
  onStartAddPick: () => void;
  onStartDeletePick: () => void;
  onCancelDelete: () => void;
  onAdd: (lat: number, lon: number, amenity: InfraAmenity) => void;
  onDelete: (ids: number[]) => void;
}

export default function InfraEditPanel({
  addPickMode,
  addPickedCoord,
  isAdding,
  deletePickMode,
  nearbyObjects,
  isSearchingNearby,
  isDeleting,
  onStartAddPick,
  onStartDeletePick,
  onCancelDelete,
  onAdd,
  onDelete,
}: InfraEditPanelProps) {
  const [open, setOpen] = useState(false);

  // Add form state
  const [amenity, setAmenity] = useState<InfraAmenity>('school');
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete: which objects are checked
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Fill coord inputs when map pick fires
  useEffect(() => {
    if (!addPickedCoord) return;
    setLatInput(addPickedCoord.lat.toFixed(6));
    setLonInput(addPickedCoord.lon.toFixed(6));
    setAddSuccess(false);
    setAddError(null);
  }, [addPickedCoord]);

  // Reset checkboxes when search results change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [nearbyObjects]);

  function handleAdd() {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setAddError('Введите корректные координаты');
      return;
    }
    setAddError(null);
    setAddSuccess(false);
    onAdd(lat, lon, amenity);
    setAddSuccess(true);
    setLatInput('');
    setLonInput('');
  }

  function toggleId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(objects: NearbyInfraObject[]) {
    if (selectedIds.size === objects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(objects.map((o) => o.id)));
    }
  }

  return (
    <div className="infra-panel">
      <button
        className="infra-panel__header"
        onClick={() => setOpen((v) => !v)}
      >
        Редактирование данных
        <span className="infra-panel__header-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="infra-panel__body">
          {/* ── ДОБАВИТЬ ─────────────────────────────────────── */}
          <p className="infra-panel__section-title">Добавить объект</p>

          <div className="infra-panel__type-toggle">
            {AMENITY_TYPES.map((type) => (
              <button
                key={type}
                className={`infra-panel__type-btn${amenity === type ? ' active' : ''}`}
                onClick={() => setAmenity(type)}
              >
                {AMENITY_LABEL[type]}
              </button>
            ))}
          </div>

          <div className="infra-panel__coord-row">
            <span className="infra-panel__coord-label">Широта</span>
            <input
              className={`infra-panel__coord-input${addError ? ' error' : ''}`}
              type="number"
              placeholder="53.7202"
              value={latInput}
              onChange={(e) => { setLatInput(e.target.value); setAddError(null); setAddSuccess(false); }}
            />
          </div>
          <div className="infra-panel__coord-row">
            <span className="infra-panel__coord-label">Долгота</span>
            <input
              className={`infra-panel__coord-input${addError ? ' error' : ''}`}
              type="number"
              placeholder="91.4422"
              value={lonInput}
              onChange={(e) => { setLonInput(e.target.value); setAddError(null); setAddSuccess(false); }}
            />
          </div>

          <button
            className={`infra-panel__pick-btn${addPickMode ? ' active' : ''}`}
            onClick={onStartAddPick}
          >
            {addPickMode ? '⌛ Кликните на карте…' : '📍 Указать на карте'}
          </button>

          {addError && <p className="infra-panel__error">{addError}</p>}
          {addSuccess && <p className="infra-panel__success">✓ Объект добавлен</p>}

          <button
            className="infra-panel__add-btn"
            onClick={handleAdd}
            disabled={isAdding || !latInput || !lonInput}
          >
            {isAdding ? <span className="infra-panel__spinner" /> : null}
            {isAdding ? 'Добавление…' : '+ Добавить'}
          </button>

          {/* ── УДАЛИТЬ ──────────────────────────────────────── */}
          <p className="infra-panel__section-title" style={{ marginTop: 8 }}>Удалить объект</p>

          <button
            className={`infra-panel__delete-btn${deletePickMode ? ' active' : ''}`}
            onClick={onStartDeletePick}
            disabled={isSearchingNearby || isDeleting}
          >
            {deletePickMode ? '⌛ Кликните на карте…' : '🗑 Кликнуть на карте'}
          </button>

          {deletePickMode && (
            <p className="infra-panel__hint">Нажмите на карту — найдём объекты в радиусе 100 м</p>
          )}

          {isSearchingNearby && (
            <p className="infra-panel__hint">
              <span className="infra-panel__spinner infra-panel__spinner--dark" /> Поиск объектов…
            </p>
          )}

          {nearbyObjects !== null && !isSearchingNearby && nearbyObjects.length === 0 && (
            <p className="infra-panel__hint">В радиусе 100 м объектов не найдено</p>
          )}

          {nearbyObjects !== null && !isSearchingNearby && nearbyObjects.length > 0 && (
            <div className="infra-panel__checklist">
              <label className="infra-panel__check-item infra-panel__check-item--all">
                <input
                  type="checkbox"
                  checked={selectedIds.size === nearbyObjects.length}
                  onChange={() => toggleAll(nearbyObjects)}
                />
                <span>Выбрать все ({nearbyObjects.length})</span>
              </label>
              {nearbyObjects.map((obj) => (
                <label key={obj.id} className="infra-panel__check-item">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(obj.id)}
                    onChange={() => toggleId(obj.id)}
                  />
                  <span>
                    {AMENITY_LABEL[obj.amenity] ?? obj.amenity}
                    {obj.name ? ` — ${obj.name}` : ''}
                    <span className="infra-panel__coord-hint">
                      {' '}({obj.lat.toFixed(4)}°, {obj.lon.toFixed(4)}°)
                    </span>
                  </span>
                </label>
              ))}

              <div className="infra-panel__delete-actions">
                <button
                  className="infra-panel__delete-confirm-btn"
                  disabled={selectedIds.size === 0 || isDeleting}
                  onClick={() => onDelete(Array.from(selectedIds))}
                >
                  {isDeleting ? <span className="infra-panel__spinner" /> : null}
                  {isDeleting ? 'Удаление…' : `Удалить (${selectedIds.size})`}
                </button>
                <button
                  className="infra-panel__cancel-btn"
                  onClick={onCancelDelete}
                  disabled={isDeleting}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
