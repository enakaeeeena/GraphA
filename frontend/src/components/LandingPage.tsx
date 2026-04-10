import { useState } from 'react';
import { apiClient } from '../api/client';

interface LandingPageProps {
  onStart: (sessionId: string) => void;
  onError: (message: string) => void;
}

const EXAMPLES = [
  'vercel/next.js',
  'vercel/next.js',
  'vercel/next.js',
  'vercel/next.js',
];

export function LandingPage({ onStart, onError }: LandingPageProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      onError('Введите ссылку на репозиторий GitHub');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.analyzeRepository(repoUrl.trim());
      onStart(res.session_id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Ошибка при запуске анализа');
    } finally {
      setIsLoading(false);
    }
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
        <button className="landing-cta" onClick={() => repoUrl.trim() && void 0} type="button">
          Попробовать →
        </button>
      </header>

      <main className="landing-main">
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
            →
          </button>
        </form>

        <div className="landing-hint">
          Вставьте ссылку и нажмите кнопку → — анализ займёт несколько секунд
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
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>
            GitHub
          </a>
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>
            Документация
          </a>
          <a className="landing-link" href="#" onClick={(e) => e.preventDefault()}>
            Обратная связь
          </a>
        </div>
      </footer>
    </div>
  );
}

