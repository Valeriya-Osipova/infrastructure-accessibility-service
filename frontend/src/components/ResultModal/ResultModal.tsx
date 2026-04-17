import { useCallback, useEffect, useRef, useState } from 'react';
import type { ObjectType, OptimizeResponse } from '../../types';
import './ResultModal.css';

interface ResultModalProps {
  id: string;
  data: OptimizeResponse;
  type: ObjectType;
  modalIndex: number;
  onClose: (id: string) => void;
}

const LABELS: Record<string, string> = {
  kindergarten: 'Детский сад',
  school: 'Школа',
  hospital: 'Больница',
};

const ICONS: Record<string, string> = {
  kindergarten: '🏫',
  school: '📚',
  hospital: '🏥',
};

const TYPE_COLOR: Record<string, string> = {
  kindergarten: '#f59e0b',
  school: '#3b82f6',
  hospital: '#ef4444',
};

export default function ResultModal({ id, data, type, modalIndex, onClose }: ResultModalProps) {
  const entries = Object.entries(data.recommendations);

  // Начальная позиция: центр экрана со смещением для каждой последующей модалки
  const [pos, setPos] = useState(() => {
    const w = Math.min(460, window.innerWidth - 32);
    const h = 420; // приблизительная высота
    return {
      x: Math.max(0, (window.innerWidth - w) / 2 + modalIndex * 32),
      y: Math.max(0, (window.innerHeight - h) / 2 + modalIndex * 32),
    };
  });

  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    const rect = modalRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const w = modalRef.current?.offsetWidth ?? 460;
      const h = modalRef.current?.offsetHeight ?? 300;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - w, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - h, e.clientY - dragOffset.current.y)),
      });
    };
    const onMouseUp = () => { isDragging.current = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div
      ref={modalRef}
      className="result-panel"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Заголовок — ручка для перетаскивания */}
      <div
        className="result-panel__header"
        onMouseDown={handleHeaderMouseDown}
        style={{ borderTopColor: TYPE_COLOR[type] }}
      >
        <div className="result-panel__header-left">
          <span className="result-panel__icon">{ICONS[type]}</span>
          <h2 className="result-panel__title">
            Предложения: {LABELS[type] ?? type}
          </h2>
        </div>
        <button className="result-panel__close" onClick={() => onClose(id)}>✕</button>
      </div>

      <div className="result-panel__body">
        {entries.length === 0 ? (
          <p className="result-panel__empty">Нарушений не обнаружено.</p>
        ) : (
          entries.map(([t, result]) => (
            <div key={t} className="result-panel__section">
              <div className="result-panel__section-header">
                <span>{ICONS[t]}</span>
                <h3 className="result-panel__section-title">{LABELS[t] ?? t}</h3>
              </div>

              <div className="result-panel__criteria">
                <p className="result-panel__sub-label">Критерии выбора:</p>
                <ul className="result-panel__list">
                  {result.criteria_used.map((c, i) => (
                    <li key={i} className="result-panel__list-item">{c}</li>
                  ))}
                </ul>
              </div>

              <div className="result-panel__sites">
                <p className="result-panel__sub-label">
                  Рекомендуемых точек: <strong>{result.recommended_sites.length}</strong>
                </p>
                {result.recommended_sites.length > 0 && (
                  <ul className="result-panel__list">
                    {result.recommended_sites.slice(0, 5).map(([lon, lat], i) => (
                      <li key={i} className="result-panel__coord">
                        {i + 1}. {lat.toFixed(5)}, {lon.toFixed(5)}
                      </li>
                    ))}
                    {result.recommended_sites.length > 5 && (
                      <li className="result-panel__more">
                        + ещё {result.recommended_sites.length - 5} точек на карте
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="result-panel__footer">
        <button className="result-panel__close-btn" onClick={() => onClose(id)}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
