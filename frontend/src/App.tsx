import { useState } from 'react';
import { GraphPage } from './components/GraphPage';
import { LandingPage } from './components/LandingPage';

function App() {
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'landing' | 'graph'>('landing');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000);
  };

  const handleNewAnalysis = () => {
    setError(null);
    setSessionId(null);
    setView('landing');
  };

  if (sessionId && view === 'graph') {
    return <GraphPage sessionId={sessionId} onBack={handleNewAnalysis} />;
  }

  return (
    <div>
      {error && (
        <div className="toast-error">
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      {view === 'landing' && (
        <LandingPage
          onStart={(sid) => {
            setSessionId(sid);
            setError(null);
            setView('graph');
          }}
          onError={handleError}
        />
      )}
    </div>
  );
}

export default App;




