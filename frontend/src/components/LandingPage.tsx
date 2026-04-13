import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

interface LandingPageProps {
  initialUrl?: string;
  onStart: (sessionId: string, repoUrl: string, repoName: string) => void;
  onError: (message: string) => void;
}

const SESSION_KEY = 'grapha_session';

interface SavedSession {
  sessionId: string;
  repoUrl: string;
  repoName: string;
  savedAt: number;
}

const EXAMPLES = [
  'facebook/react',
  'vuejs/vue',
  'sveltejs/svelte',
  'vitejs/vite',
];

function deriveRepoName(url: string): string {
  try {
    const trimmed = url.trim().replace(/\/+$/, '');
    const last = trimmed.split('/').pop() ?? 'project';
    return last.toLowerCase().endsWith('.git') ? last.slice(0, -4) : last;
  } catch {
    return 'project';
  }
}

export function LandingPage({ initialUrl = '', onStart, onError }: LandingPageProps) {
  const [repoUrl, setRepoUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);

  // Читаем сохранённую сессию для показа баннера
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: SavedSession = JSON.parse(raw);
      const age = Date.now() - saved.savedAt;
      if (age < 24 * 60 * 60 * 1000 && saved.sessionId) {
        setSavedSession(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      onError('Введите ссылку на репозиторий GitHub');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.analyzeRepository(repoUrl.trim());
      const name = deriveRepoName(repoUrl.trim());
      onStart(res.session_id, repoUrl.trim(), name);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Ошибка при запуске анализа');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreSession = () => {
    if (savedSession) {
      onStart(savedSession.sessionId, savedSession.repoUrl, savedSession.repoName);
    }
  };

  const handleClearSession = () => {
    localStorage.removeItem(SESSION_KEY);
    setSavedSession(null);
  };

  const fillExample = (slug: string) => {
    setRepoUrl(`https://github.com/${slug}.git`);
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">GraphA</div>
        <nav className="landing-nav">
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>
            Документация
          </a>
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>
            Как это работает
          </a>
        </nav>
        <button className="landing-cta" type="button">
          Попробовать →
        </button>
      </header>

      <main className="landing-main">

        {/* Баннер восстановления сессии */}
        {savedSession && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, marginBottom: 24,
            background: 'rgba(128,116,164,0.1)',
            border: '1.5px solid rgba(128,116,164,0.35)',
            borderRadius: 14, padding: '12px 16px',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#3d325f' }}>
                Продолжить с <span style={{ color: '#8074A4' }}>{savedSession.repoName}</span>?
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.55, marginTop: 2 }}>
                {savedSession.repoUrl}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleRestoreSession}
                style={{
                  height: 34, borderRadius: 999, border: '2px solid #8074A4',
                  background: '#8074A4', color: '#fff', fontWeight: 800,
                  fontSize: 13, padding: '0 14px', cursor: 'pointer',
                }}
              >
                Открыть →
              </button>
              <button
                type="button"
                onClick={handleClearSession}
                style={{
                  height: 34, borderRadius: 999,
                  border: '2px solid rgba(61,50,95,0.3)',
                  background: 'transparent', color: '#3d325f',
                  fontWeight: 700, fontSize: 13, padding: '0 12px',
                  cursor: 'pointer', opacity: 0.6,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="landing-pill">поддерживает JavaScript и TypeScript</div>
        <h1 className="landing-title">
          Визуализируем зависимости,
          <br />
          чтобы рефакторинг не стал
          <br />
          квестом.
        </h1>
        <p className="landing-subtitle">
          GRAPHA строит граф импортов по вашему GitHub-репозиторию
          <br />и показывает архитектуру проекта в интерактивном виде
        </p>

        <form className="landing-form" onSubmit={handleSubmit}>
          <input
            className="landing-input"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            disabled={isLoading}
          />
          <button className="landing-go" type="submit" disabled={isLoading || !repoUrl.trim()}>
            {isLoading ? '…' : '→'}
          </button>
        </form>

        <div className="landing-hint">
          {isLoading
            ? 'Запускаем анализ, подождите…'
            : 'Вставьте ссылку и нажмите → — результат сохранится на 24 часа'}
        </div>

        <div className="landing-examples">
          <div className="landing-examples__label">Попробовать на примере</div>
          <div className="landing-examples__chips">
            {EXAMPLES.map((ex, idx) => (
              <button
                key={`${ex}-${idx}`}
                type="button"
                className="landing-example"
                onClick={() => fillExample(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </main>

      <div className="landing-spacer" />

      <footer className="landing-footer">
        <div className="landing-footer__brand">GraphA</div>
        <div className="landing-footer__links">
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>GitHub</a>
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>Документация</a>
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>Обратная связь</a>
        </div>
      </footer>
    </div>
  );
}