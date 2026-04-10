import { useState } from 'react';
import { AnalyzeForm } from './components/AnalyzeForm';
import { SessionStatusComponent } from './components/SessionStatus';
import { AnalysisResultComponent } from './components/AnalysisResult';
import { GraphPage } from './components/GraphPage';
import type { AnalyzeResponse, AnalysisResult } from './types/api';

function App() {
  const [currentSession, setCurrentSession] = useState<AnalyzeResponse | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'analyze' | 'graph'>('analyze');

  const handleAnalysisStart = (response: AnalyzeResponse) => {
    setCurrentSession(response);
    setAnalysisResult(null);
    setError(null);
  };

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysisResult(result);
    setCurrentSession(null);
    setView('analyze');
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000);
  };

  const handleNewAnalysis = () => {
    setCurrentSession(null);
    setAnalysisResult(null);
    setError(null);
    setView('analyze');
  };

  if (analysisResult && view === 'graph') {
    return <GraphPage result={analysisResult} onBack={() => setView('analyze')} />;
  }

  return (
    <div style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
    }}>
      <header style={{ marginBottom: '30px', borderBottom: '2px solid #007bff', paddingBottom: '20px' }}>
        <h1 style={{ margin: 0, color: '#007bff' }}>Code Dependency Analyzer</h1>
        <p style={{ margin: '10px 0 0 0', color: '#666' }}>
          Анализ зависимостей в JavaScript/TypeScript проектах
        </p>
      </header>

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #f5c6cb',
        }}>
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {!currentSession && !analysisResult && (
        <div>
          <h2>Начать анализ</h2>
          <p>Введите URL репозитория GitHub для анализа зависимостей:</p>
          <AnalyzeForm onAnalysisStart={handleAnalysisStart} onError={handleError} />
        </div>
      )}

      {currentSession && (
        <div>
          <button
            onClick={handleNewAnalysis}
            style={{
              marginBottom: '20px',
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Новый анализ
          </button>
          <SessionStatusComponent
            sessionId={currentSession.session_id}
            onComplete={handleAnalysisComplete}
            onError={handleError}
          />
        </div>
      )}

      {analysisResult && (
        <div>
          <button
            onClick={handleNewAnalysis}
            style={{
              marginBottom: '20px',
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Новый анализ
          </button>
          <button
            onClick={() => setView('graph')}
            style={{
              marginBottom: '20px',
              marginLeft: '10px',
              padding: '8px 16px',
              backgroundColor: '#8074A4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Открыть граф
          </button>
          <AnalysisResultComponent result={analysisResult} />
        </div>
      )}
    </div>
  );
}

export default App;




