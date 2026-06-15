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
  <div style={{
    position: 'fixed',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    background: '#fff',
    border: '2px solid #d64c4c',
    borderRadius: 14,
    padding: '14px 20px',
    boxShadow: '0 8px 32px rgba(214,76,76,0.18)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    maxWidth: 480,
    width: 'calc(100vw - 48px)',
  }}>
    <span style={{
      width: 20, height: 20, borderRadius: '50%',
      background: '#d64c4c', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 900, flexShrink: 0, marginTop: 1,
    }}>!</span>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#d64c4c', marginBottom: 3 }}>
        Ошибка
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#3d325f', lineHeight: 1.45 }}>
        {error === 'Failed to fetch'
          ? 'Не удалось подключиться к серверу. Проверьте что бэкенд запущен.'
          : error?.includes('404')
          ? 'Репозиторий не найден. Проверьте ссылку.'
          : error?.includes('клонир') || error?.includes('clone')
          ? 'Не удалось клонировать репозиторий. Убедитесь что он публичный.'
          : error}
      </div>
    </div>
    <button
      type="button"
      onClick={() => setError(null)}
      style={{
        background: 'transparent', border: 'none',
        cursor: 'pointer', fontSize: 16, color: '#3d325f',
        opacity: 0.4, flexShrink: 0, padding: 0,
        lineHeight: 1,
      }}
    >✕</button>
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