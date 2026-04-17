import type { AnalyzeResponse, ObjectType, SelectedBuilding, AppStatus } from '../../types';
import './AnalysisPanel.css';

interface AnalysisPanelProps {
  selectedBuilding: SelectedBuilding | null;
  status: AppStatus;
  analyzeResult: AnalyzeResponse | null;
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
  onAnalyze,
  onOptimize,
}: AnalysisPanelProps) {
  const isOptimizing = status === 'optimizing';

  return (
    <div className="analysis-panel">
      <h3 className="analysis-panel__title">Анализ доступности</h3>

      {!selectedBuilding ? (
        <p className="analysis-panel__hint">
          Нажмите на жилой дом на карте, чтобы выбрать его.
        </p>
      ) : (
        <>
          <div className="analysis-panel__building">
            <span className="analysis-panel__building-icon">🏠</span>
            <span className="analysis-panel__building-coords">
              {selectedBuilding.lat.toFixed(5)}, {selectedBuilding.lon.toFixed(5)}
            </span>
          </div>

          <button
            className="analysis-panel__btn analysis-panel__btn--primary"
            onClick={onAnalyze}
            disabled={status === 'analyzing'}
          >
            {status === 'analyzing' ? 'Анализируется...' : 'Выполнить анализ'}
          </button>

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
