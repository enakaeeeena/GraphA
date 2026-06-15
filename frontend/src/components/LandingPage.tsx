import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { LandingGraph } from './LandingGraph';
import { GraphALogo } from './GraphALogo';

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

const DEMO_URL = 'https://github.com/vitejs/vite.git';

function deriveRepoName(url: string): string {
  try {
    const trimmed = url.trim().replace(/\/+$/, '');
    const last = trimmed.split('/').pop() ?? 'project';
    return last.toLowerCase().endsWith('.git') ? last.slice(0, -4) : last;
  } catch {
    return 'project';
  }
}

// ── Модальное окно ─────────────────────────────────────────────────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(61,50,95,0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fffaeb', borderRadius: 20,
          padding: '36px 40px', maxWidth: 560, width: '100%',
          boxShadow: '0 24px 64px rgba(61,50,95,0.18)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: '50%',
            border: '1.5px solid rgba(61,50,95,0.15)',
            background: 'transparent', cursor: 'pointer',
            fontSize: 16, color: '#3d325f', opacity: 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
        {children}
      </div>
    </div>
  );
}

// ── Страница документации ──────────────────────────────────────────────────
function DocsPage({ onClose }: { onClose: () => void }) {
  const metricsContent = (
    <div>
      <p style={{ fontSize: 16, lineHeight: 1.65, color: '#3d325f', opacity: 0.7, marginBottom: 20 }}>
        Каждый файл в графе получает четыре показателя. Ниже — что они означают и при каких значениях стоит обратить внимание.
      </p>
      {[
        {
          name: 'Fan-in',
          desc: 'Сколько других файлов импортируют этот файл. Высокий fan-in означает что файл широко используется в проекте — его изменение затронет много других мест. Файлы с fan-in выше 20 становятся узкими местами: любая правка в них несёт высокий риск поломки.',
          rows: [
            { label: 'Норма', value: '1–10', color: '#2f9e44' },
            { label: 'Внимание', value: '11–20', color: '#f0b429' },
            { label: 'Критично', value: '> 20', color: '#d64c4c' },
          ],
        },
        {
          name: 'Fan-out',
          desc: 'Сколько файлов импортирует этот файл сам. Высокий fan-out говорит о том что файл берёт на себя слишком много разных задач — его сложно тестировать изолированно и легко сломать при обновлении любой из зависимостей.',
          rows: [
            { label: 'Норма', value: '1–7', color: '#2f9e44' },
            { label: 'Внимание', value: '8–15', color: '#f0b429' },
            { label: 'Критично', value: '> 15', color: '#d64c4c' },
          ],
        },
        {
          name: 'Centrality',
          desc: 'Как часто файл стоит на кратчайшем пути между двумя другими файлами в графе. Файл с высокой центральностью — архитектурный мост: его изменение способно нарушить связность большой части проекта, даже если у него немного прямых связей.',
          rows: [
            { label: 'Норма', value: '0 – 0.01', color: '#2f9e44' },
            { label: 'Внимание', value: '0.01 – 0.05', color: '#f0b429' },
            { label: 'Критично', value: '> 0.05', color: '#d64c4c' },
          ],
        },
        {
          name: 'Циклы',
          desc: 'Файл участвует в циклической зависимости — цепочке где A импортирует B, а B импортирует A напрямую или через посредников. Любое ненулевое значение — архитектурная проблема: такие файлы невозможно изолированно протестировать, и они мешают горячей замене модулей при разработке.',
          rows: [
            { label: 'Норма', value: '0', color: '#2f9e44' },
            { label: 'Критично', value: '> 0', color: '#d64c4c' },
          ],
        },
      ].map(({ name, desc, rows }) => (
        <div key={name} style={{
          marginBottom: 20, padding: '18px 20px',
          border: '1.5px solid rgba(61,50,95,0.1)',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.5)',
        }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#3d325f', marginBottom: 8 }}>{name}</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#3d325f', opacity: 0.65, marginBottom: 14, margin: '0 0 14px' }}>{desc}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {rows.map(({ label, value, color }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 999,
                border: `1.5px solid ${color}55`,
                background: `${color}12`,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: color, flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#3d325f', opacity: 0.7 }}>{label}:</span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const sections: { title: string; text?: string; content?: React.ReactNode }[] = [
    {
      title: 'Что такое GraphA?',
      text: 'GraphA — инструмент для визуализации зависимостей между файлами в JavaScript и TypeScript проектах. Введите ссылку на GitHub-репозиторий и получите интерактивный граф импортов с метриками архитектуры.',
    },
    {
      title: 'Как начать',
      text: 'Вставьте ссылку на публичный GitHub-репозиторий в формате https://github.com/user/repo.git и нажмите →. Система клонирует репозиторий, проанализирует все JS/TS файлы и построит граф зависимостей.',
    },
    {
      title: 'Три режима графа',
      text: 'Силовой (force-directed) — физическая симуляция, связанные файлы притягиваются друг к другу. Иерархический — файлы расположены слева направо по слоям зависимостей. Радиальный — самый связанный файл в центре, остальные по кольцам.',
    },
    {
      title: 'Метрики',
      content: metricsContent,
    },
    {
      title: 'Циклические зависимости',
      text: 'Система автоматически находит циклы через алгоритм Косараджу (SCC). Рёбра образующие цикл выделяются красным цветом. Циклические зависимости усложняют рефакторинг и тестирование — файлы в цикле нельзя изменить или протестировать изолированно.',
    },
    {
      title: 'Настройки отображения',
      text: 'Количество узлов — ограничение топ-N файлов по связям для производительности. Глубина — показывать только файлы до N уровней от выбранного. Изолированные файлы — файлы без связей. Скрыть файлы сборки — убирает dist, build, .next папки.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fffaeb', fontFamily: 'inherit' }}>
      <header style={{
  position: 'sticky', top: 0, zIndex: 100,
  background: 'rgba(255,250,235,0.97)',
  borderBottom: '1px solid rgba(61,50,95,0.1)',
  backdropFilter: 'blur(10px)',
}}>
  <div style={{
    padding: '0 150px', height: 64,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <GraphALogo size={40} />
    <button type="button" onClick={onClose} style={{
      height: 36, borderRadius: 999, border: 'none',
      background: '#8074A4', color: '#fff',
      fontWeight: 700, fontSize: 14, padding: '0 18px', cursor: 'pointer',
    }}>← Назад</button>
  </div>
</header>

      <main style={{ padding: '60px 150px 80px', maxWidth: 860 }}>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: '#3d325f', letterSpacing: '-1.5px', marginBottom: 8 }}>
          Документация
        </h1>
        <p style={{ fontSize: 17, opacity: 0.55, marginBottom: 48 }}>
          Руководство по использованию GraphA
        </p>

        {sections.map(({ title, text, content }) => (
          <div key={title} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#3d325f', marginBottom: 10, letterSpacing: '-0.3px' }}>
              {title}
            </h2>
            {content ?? (
              <p style={{ fontSize: 16, lineHeight: 1.65, color: '#3d325f', opacity: 0.7, margin: 0 }}>
                {text}
              </p>
            )}
          </div>
        ))}
      </main>

      <footer style={{ background: '#8074A4' }}>
        <div style={{
          padding: '0 150px', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <GraphALogo size={36} variant="dark" />
          <div style={{ display: 'flex', gap: 28 }}>
            {['GitHub', 'Документация', 'Обратная связь'].map((l) => (
              <span key={l} style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.75)', cursor: 'default' }}>{l}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Основной компонент ─────────────────────────────────────────────────────
export function LandingPage({ initialUrl = '', onStart, onError }: LandingPageProps) {
  const [repoUrl, setRepoUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [modal, setModal] = useState<'how' | 'feedback' | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved: SavedSession = JSON.parse(raw);
      const age = Date.now() - saved.savedAt;
      if (age < 24 * 60 * 60 * 1000 && saved.sessionId) setSavedSession(saved);
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
      // Проверка формата ссылки
  const trimmed = repoUrl.trim();
  const isValidUrl = trimmed.startsWith('https://github.com/') && trimmed.includes('/');
  if (!isValidUrl) {
    onError('Введите корректную ссылку на GitHub-репозиторий, например: https://github.com/user/repo.git');
    return;
  }
    setIsLoading(true);
    try {
      const res = await apiClient.analyzeRepository(repoUrl.trim());
      const name = deriveRepoName(repoUrl.trim());
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          sessionId: res.session_id,
          repoUrl: repoUrl.trim(),
          repoName: name,
          savedAt: Date.now(),
        }));
      } catch { /* ignore */ }
      onStart(res.session_id, repoUrl.trim(), name);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Ошибка при запуске анализа');
    } finally {
      setIsLoading(false);
    }
  };

  if (showDocs) {
    return <DocsPage onClose={() => setShowDocs(false)} />;
  }

  return (
    <div className="landing">
      <header className="landing-header">
        <GraphALogo size={40} />
        <nav className="landing-nav">
          <a className="landing-link" href="#" onClick={(e) => { e.preventDefault(); setModal('how'); }}>
            Как это работает
          </a>
          <a className="landing-link" href="#" onClick={(e) => { e.preventDefault(); setShowDocs(true); }}>
            Документация
          </a>
        </nav>
        <button
          className="landing-cta"
          type="button"
          onClick={() => setRepoUrl(DEMO_URL)}
        >
          Попробовать →
        </button>
      </header>

      <main className="landing-main">
        {savedSession && (
          <div style={{
            marginBottom: 24, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 16,
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
              <button type="button" onClick={() => onStart(savedSession.sessionId, savedSession.repoUrl, savedSession.repoName)} style={{
                height: 34, borderRadius: 999, border: 'none',
                background: '#8074A4', color: '#fff', fontWeight: 800,
                fontSize: 13, padding: '0 14px', cursor: 'pointer',
              }}>Открыть →</button>
              <button type="button" onClick={() => { localStorage.removeItem(SESSION_KEY); setSavedSession(null); }} style={{
                height: 34, borderRadius: 999,
                border: '1.5px solid rgba(61,50,95,0.25)',
                background: 'transparent', color: '#3d325f',
                fontWeight: 700, fontSize: 13, padding: '0 12px',
                cursor: 'pointer', opacity: 0.6,
              }}>✕</button>
            </div>
          </div>
        )}

        <div className="landing-pill">
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#4caf72', boxShadow: '0 0 0 3px rgba(76,175,114,0.22)',
            display: 'inline-block', flexShrink: 0,
          }} />
          поддерживает JavaScript и TypeScript
        </div>

        <h1 className="landing-title">
          Визуализируем <span style={{ color: '#8074A4' }}>зависимости,</span>
          <br />чтобы рефакторинг не стал
          <br />квестом.
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
                onClick={() => setRepoUrl(`https://github.com/${ex}.git`)}
              >{ex}</button>
            ))}
          </div>
        </div>
      </main>

      <div className="landing-spacer" />

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <GraphALogo size={36} variant="dark" />
          <div className="landing-footer__links">
            <a className="landing-link" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
            <a className="landing-link" href="#" onClick={(e) => { e.preventDefault(); setShowDocs(true); }}>Документация</a>
            <a className="landing-link" href="#" onClick={(e) => { e.preventDefault(); setModal('feedback'); }}>Обратная связь</a>
          </div>
        </div>
      </footer>

      {/* МОДАЛКА: Как это работает */}
      {modal === 'how' && (
        <Modal onClose={() => setModal(null)}>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#3d325f', marginBottom: 20, letterSpacing: '-0.5px' }}>
            Как это работает
          </h2>
          {[
            { step: '1', title: 'Клонирование', text: 'Система получает ссылку на GitHub-репозиторий и клонирует его на сервер через Git.' },
            { step: '2', title: 'AST-анализ', text: 'Каждый JS/TS файл разбирается через tree-sitter. Из синтаксического дерева извлекаются все конструкции импорта: ES6 import, require(), dynamic import().' },
            { step: '3', title: 'Построение графа', text: 'Файлы становятся вершинами графа, импорты — рёбрами. Через NetworkX вычисляются метрики: degree, fan-in, fan-out, betweenness centrality.' },
            { step: '4', title: 'Визуализация', text: 'Граф отображается интерактивно через D3.js. Доступны три режима: силовой, иерархический и радиальный. Кластеризация выполняется алгоритмом Маркова (MCL).' },
          ].map(({ step, title, text }) => (
            <div key={step} style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: '#8074A4', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800,
              }}>{step}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#3d325f', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: '#3d325f', opacity: 0.65 }}>{text}</div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* МОДАЛКА: Обратная связь */}
   
      {modal === 'feedback' && (
        <Modal onClose={() => setModal(null)}>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#3d325f', marginBottom: 8, letterSpacing: '-0.5px' }}>
            Обратная связь
          </h2>
          <p style={{ fontSize: 14, opacity: 0.55, marginBottom: 28, lineHeight: 1.5 }}>
            Нашли баг, есть предложение или вопрос — пишите!
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <a
              href="https://t.me/enakaeeeena"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 14,
                border: '1.5px solid rgba(128,116,164,0.25)',
                background: 'rgba(128,116,164,0.06)',
                textDecoration: 'none', color: '#3d325f',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13" stroke="#3d325f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#3d325f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Telegram</div>
                <div style={{ fontSize: 13, opacity: 0.55 }}>@enakaeeeena</div>
              </div>
            </a>
            <a
              href="mailto:enakaena@mail.ru"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', borderRadius: 14,
                border: '1.5px solid rgba(128,116,164,0.25)',
                background: 'rgba(128,116,164,0.06)',
                textDecoration: 'none', color: '#3d325f',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="#3d325f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 7L12 13L22 7" stroke="#3d325f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Email</div>
                <div style={{ fontSize: 13, opacity: 0.55 }}>enakaena@mail.ru</div>
              </div>
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
 