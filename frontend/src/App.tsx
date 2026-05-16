import { useState, useEffect } from 'react';
import { GraphPage } from './components/GraphPage';
import { LandingPage } from './components/LandingPage';
import { apiClient } from './api/client';

const SESSION_KEY = 'grapha_session';

interface SavedSession {
  sessionId: string;
  repoUrl: string;
  repoName: string;
  savedAt: number;
}

function deriveRepoName(url: string): string {
  try {
    const trimmed = url.trim().replace(/\/+$/, '');
    const last = trimmed.split('/').pop() ?? 'project';
    return last.toLowerCase().endsWith('.git') ? last.slice(0, -4) : last;
  } catch {
    return 'project';
  }
}

function App() {
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'landing' | 'graph'>('landing');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialUrl, setInitialUrl] = useState<string>('');

  // При старте — восстанавливаем сессию из localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: SavedSession = JSON.parse(raw);

      // Сессия живёт 24 часа
      const age = Date.now() - saved.savedAt;
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }

      if (saved.sessionId) {
        setSessionId(saved.sessionId);
        setView('graph');
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000);
  };

  const handleNewAnalysis = async (repoUrl?: string) => {
    setError(null);

    if (!repoUrl?.trim()) {
      setSessionId(null);
      setInitialUrl('');
      setView('landing');
      return;
    }

    const trimmed = repoUrl.trim();
    try {
      const res = await apiClient.analyzeRepository(trimmed);
      handleStart(res.session_id, trimmed, deriveRepoName(trimmed));
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Ошибка при запуске анализа');
    }
  };

  const handleStart = (sid: string, repoUrl: string, repoName: string) => {
    setSessionId(sid);
    setError(null);
    setView('graph');

    // Сохраняем сессию
    try {
      const session: SavedSession = {
        sessionId: sid,
        repoUrl,
        repoName,
        savedAt: Date.now(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // localStorage недоступен — продолжаем без сохранения
    }
  };

  const errorToast = error ? (
    <div className="toast-error">
      <strong>Ошибка:</strong> {error}
    </div>
  ) : null;

  if (sessionId && view === 'graph') {
    return (
      <>
        {errorToast}
        <GraphPage
          sessionId={sessionId}
          onBack={handleNewAnalysis}
        />
      </>
    );
  }

  return (
    <div>
      {errorToast}
      {view === 'landing' && (
        <LandingPage
          initialUrl={initialUrl}
          onStart={handleStart}
          onError={handleError}
        />
      )}
    </div>
  );
}

export default App;