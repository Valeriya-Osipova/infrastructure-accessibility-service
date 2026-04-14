import type { OptimizeResponse } from '../../types';
import './ResultModal.css';

interface ResultModalProps {
  data: OptimizeResponse;
  onClose: () => void;
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

export default function ResultModal({ data, onClose }: ResultModalProps) {
  const entries = Object.entries(data.recommendations);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">Предложения по размещению</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal__body">
          {entries.length === 0 ? (
            <p className="modal__empty">Нарушений не обнаружено.</p>
          ) : (
            entries.map(([type, result]) => (
              <div key={type} className="modal__section">
                <div className="modal__section-header">
                  <span className="modal__section-icon">{ICONS[type]}</span>
                  <h3 className="modal__section-title">{LABELS[type] ?? type}</h3>
                </div>

                <div className="modal__criteria">
                  <p className="modal__criteria-label">Критерии выбора:</p>
                  <ul className="modal__criteria-list">
                    {result.criteria_used.map((c, i) => (
                      <li key={i} className="modal__criteria-item">{c}</li>
                    ))}
                  </ul>
                </div>

                <div className="modal__sites">
                  <p className="modal__sites-label">
                    Рекомендуемых точек:{' '}
                    <strong>{result.recommended_sites.length}</strong>
                  </p>
                  {result.recommended_sites.length > 0 && (
                    <ul className="modal__sites-list">
                      {result.recommended_sites.slice(0, 5).map(([lon, lat], i) => (
                        <li key={i} className="modal__site-item">
                          {i + 1}. {lat.toFixed(5)}, {lon.toFixed(5)}
                        </li>
                      ))}
                      {result.recommended_sites.length > 5 && (
                        <li className="modal__site-more">
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

        <div className="modal__footer">
          <button className="modal__btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
