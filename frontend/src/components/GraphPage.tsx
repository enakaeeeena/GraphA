import { useEffect, useMemo, useState } from 'react';
import type { AnalysisResult, SourceFile } from '../types/api';
import { GraphCanvas } from './GraphCanvas';
import { apiClient } from '../api/client';
import { GraphTree } from './GraphTree.tsx';


interface GraphPageProps {
  sessionId: string;
  onBack: () => void;
}

type FileTypeFilter = 'all' | 'js' | 'ts' | 'tsx';
type RightTab = 'file' | 'metrics' | 'settings' | 'about';
type GraphDepth = 'all' | '1' | '2' | '3';
type NodeSize = 'S' | 'M' | 'L';

function isBuildFile(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes('node_modules\\') ||
    p.includes('node_modules/') ||
    p.includes('\\dist\\') ||
    p.includes('/dist/') ||
    p.includes('\\build\\') ||
    p.includes('/build/') ||
    p.includes('\\.next\\') ||
    p.includes('/.next/') ||
    p.includes('\\coverage\\') ||
    p.includes('/coverage/') ||
    p.includes('\\.cache\\') ||
    p.includes('/.cache/')
  );
}

function buildAdjacency(links: Array<{ source: string; target: string }>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const set = adj.get(a) ?? new Set<string>();
    set.add(b);
    adj.set(a, set);
  };
  for (const l of links) {
    add(l.source, l.target);
    add(l.target, l.source);
  }
  return adj;
}

function bfsWithinDepth(adj: Map<string, Set<string>>, start: string, depth: number): Set<string> {
  const seen = new Set<string>([start]);
  let frontier = new Set<string>([start]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const v of frontier) {
      const nbs = adj.get(v);
      if (!nbs) continue;
      for (const u of nbs) {
        if (!seen.has(u)) {
          seen.add(u);
          next.add(u);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return seen;
}

function approxGraphDepth(adj: Map<string, Set<string>>): number {
  const nodes = Array.from(adj.keys());
  if (!nodes.length) return 0;
  const bfs = (start: string) => {
    const dist = new Map<string, number>();
    dist.set(start, 0);
    const q: string[] = [start];
    let far = start;
    while (q.length) {
      const v = q.shift()!;
      const dv = dist.get(v)!;
      if (dv > (dist.get(far) ?? 0)) far = v;
      for (const u of adj.get(v) ?? []) {
        if (!dist.has(u)) {
          dist.set(u, dv + 1);
          q.push(u);
        }
      }
    }
    return { far, max: dist.get(far) ?? 0 };
  };
  const first = bfs(nodes[0]!);
  const second = bfs(first.far);
  return second.max;
}

function findCycleEdgeKeysDirected(links: Array<{ source: string; target: string }>): Set<string> {
  // Simple SCC (Kosaraju) to mark edges within SCCs as "cycle edges".
  const g = new Map<string, string[]>();
  const rg = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, a: string, b: string) => {
    const arr = m.get(a) ?? [];
    arr.push(b);
    m.set(a, arr);
  };
  const nodes = new Set<string>();
  for (const l of links) {
    nodes.add(l.source);
    nodes.add(l.target);
    add(g, l.source, l.target);
    add(rg, l.target, l.source);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const dfs1 = (v: string) => {
    visited.add(v);
    for (const u of g.get(v) ?? []) if (!visited.has(u)) dfs1(u);
    order.push(v);
  };
  for (const v of nodes) if (!visited.has(v)) dfs1(v);

  const comp = new Map<string, number>();
  let cid = 0;
  const dfs2 = (v: string) => {
    comp.set(v, cid);
    for (const u of rg.get(v) ?? []) if (!comp.has(u)) dfs2(u);
  };
  for (let i = order.length - 1; i >= 0; i--) {
    const v = order[i]!;
    if (!comp.has(v)) {
      dfs2(v);
      cid++;
    }
  }

  const compSize = new Map<number, number>();
  for (const c of comp.values()) compSize.set(c, (compSize.get(c) ?? 0) + 1);

  const cycleKeys = new Set<string>();
  for (const l of links) {
    const cs = comp.get(l.source);
    const ct = comp.get(l.target);
    if (cs == null || ct == null) continue;
    if (cs === ct && (compSize.get(cs) ?? 0) > 1) {
      cycleKeys.add(`${l.source}→${l.target}`);
    }
  }
  return cycleKeys;
}

export function GraphPage({ sessionId, onBack }: GraphPageProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [statusText, setStatusText] = useState<string>('Запускаем анализ…');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FileTypeFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<RightTab>('file');
  // const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  // const [newRepoUrl, setNewRepoUrl] = useState('');

  // Settings (Frame 3)
  const [showLabels, setShowLabels] = useState(true);
  const [showIndirect, setShowIndirect] = useState(true);
  const [showIsolated, setShowIsolated] = useState(true);
  const [highlightCycles, setHighlightCycles] = useState(true);
  const [hideBuild, setHideBuild] = useState(true);
  const [depth, setDepth] = useState<GraphDepth>('all');
  const [nodeSize, setNodeSize] = useState<NodeSize>('M');

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;
    let stopped = false;

    const stopPolling = () => {
      if (stopped) return;
      stopped = true;
      if (intervalId) window.clearInterval(intervalId);
      intervalId = undefined;
    };

    const tick = async () => {
      try {
        if (stopped) return;
        const status = await apiClient.getSessionStatus(sessionId);
        if (cancelled) return;
        if (status.status === 'processing') {
          setStatusText('Клонируем и анализируем репозиторий… (для больших проектов это может занять несколько минут)');
          return;
        }
        if (status.status === 'failed') {
          setError(status.error || 'Анализ завершился с ошибкой');
          stopPolling();
          return;
        }
        setStatusText('Собираем результаты…');
        const res = await apiClient.getAnalysisResult(sessionId);
        if (cancelled) return;
        setResult(res);
        setSelectedId(res.graph_data.nodes[0]?.id ?? res.files[0]?.file_path ?? null);
        stopPolling();
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Ошибка при анализе');
        stopPolling();
      }
    };

    void tick();
    intervalId = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [sessionId]);

  const selectedFile: SourceFile | null = useMemo(() => {
    if (!selectedId) return null;
    return result?.files.find((f) => f.file_path === selectedId) ?? null;
  }, [result, selectedId]);

  const fileTree = useMemo(() => {
    if (!result) return null;
    return GraphTree.fromFiles(result.files);
  }, [result]);

  const derived = useMemo(() => {
    if (!result) return null;

    const rawLinks = result.graph_data.links.map((l) => ({
      source: String(l.source),
      target: String(l.target),
    }));

    const degree = new Map<string, number>();
    for (const n of result.graph_data.nodes) degree.set(n.id, 0);
    for (const l of rawLinks) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }

    const baseNodes = result.graph_data.nodes
      .map((n) => n.id)
      .filter((id) => (showIsolated ? true : (degree.get(id) ?? 0) > 0))
      .filter((id) => (hideBuild ? !isBuildFile(id) : true));
    const baseSet = new Set(baseNodes);

    const baseLinks = rawLinks.filter((l) => baseSet.has(l.source) && baseSet.has(l.target));

    const adj = buildAdjacency(baseLinks);
    const graphDepth = approxGraphDepth(adj);
    const isolatedCount = Array.from(baseSet).filter((id) => (degree.get(id) ?? 0) === 0).length;

    let visibleSet = baseSet;
    const dN = depth === 'all' ? null : Number(depth);
    if (dN != null && selectedId && baseSet.has(selectedId)) {
      visibleSet = bfsWithinDepth(adj, selectedId, dN);
    }

    const visibleLinks = baseLinks.filter((l) => visibleSet.has(l.source) && visibleSet.has(l.target));

    // "Косвенные связи" пока трактуем как отображение всех связей между видимыми узлами.
    const finalLinks = showIndirect ? visibleLinks : visibleLinks.filter((l) => l.source === selectedId || l.target === selectedId);

    const finalNodes = result.graph_data.nodes.filter((n) => visibleSet.has(n.id));

    const cycleKeys = highlightCycles ? findCycleEdgeKeysDirected(finalLinks) : new Set<string>();

    return {
      graphData: { nodes: finalNodes, links: finalLinks } as AnalysisResult['graph_data'],
      graphDepth,
      isolatedCount,
      cycleKeys,
    };
  }, [depth, hideBuild, highlightCycles, result, selectedId, showIndirect, showIsolated]);

  const nodeRadius = nodeSize === 'S' ? 7 : nodeSize === 'L' ? 12 : 9;

  return (
    <div className="graph-layout">
      <div className="graph-topbar">
        <div className="graph-topbar__logo" title="Graph">
          G
        </div>

        <input
          className="graph-topbar__project"
          value={result?.repository.name || 'Project_name'}
          readOnly
        />

        <div className="graph-topbar__right">
          <button className="graph-topbar__btn" onClick={onBack} type="button">
            Новый анализ
          </button>
          <div className="graph-dot" />
          <div className="graph-dot" />
          <div className="graph-dot" />
          <div className="graph-dot" />
          <div className="graph-toggle" />
        </div>
      </div>

      <div className="graph-main">
        <div className="graph-panel">
          <div className="graph-panel__header">
            <div className="graph-panel__title">Файлы</div>
          </div>

          <div className="graph-panel__body">
            <div className="selected-path">
              <div className="selected-path__label">Выбрано</div>
              <div className="selected-path__value">
                {selectedFile?.file_path || '—'}
              </div>
            </div>

            <input
              className="graph-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
            />

            <div className="graph-chips">
              <div
                className={`graph-chip ${filter === 'all' ? 'graph-chip--active' : ''}`}
                onClick={() => setFilter('all')}
              >
                все
              </div>
              <div
                className={`graph-chip ${filter === 'js' ? 'graph-chip--active' : ''}`}
                onClick={() => setFilter('js')}
              >
                js
              </div>
              <div
                className={`graph-chip ${filter === 'ts' ? 'graph-chip--active' : ''}`}
                onClick={() => setFilter('ts')}
              >
                ts
              </div>
              <div
                className={`graph-chip ${filter === 'tsx' ? 'graph-chip--active' : ''}`}
                onClick={() => setFilter('tsx')}
              >
                tsx
              </div>
            </div>

            {fileTree && (
              <div className="tree-wrap">
                <GraphTree.View
                  tree={fileTree}
                  query={query}
                  filter={filter}
                  selectedPath={selectedId}
                  onSelectPath={(p: string) => setSelectedId(p)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="graph-panel">
          <div className="graph-panel__header">
            <div className="graph-panel__title">Graph</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Узлов: {result?.graph_data.nodes.length ?? 0} · Связей: {result?.graph_data.links.length ?? 0}
            </div>
          </div>

          {result && derived && (
            <GraphCanvas
              data={derived.graphData}
              selectedNodeId={selectedId}
              onSelectNode={(id) => setSelectedId(id)}
              showLabels={showLabels}
              nodeRadius={nodeRadius}
              cycleEdgeKeys={derived.cycleKeys}
            />
          )}
          {!result && (
            <div className="graph-loading">
              <div className="graph-loading__title">{error ? 'Ошибка' : 'Загрузка'}</div>
              <div className="graph-loading__text">{error || statusText}</div>
            </div>
          )}
        </div>

        <div className="right-code">
          <div className="right-tabs">
            <button
              type="button"
              className={`right-tab ${tab === 'file' ? 'right-tab--active' : ''}`}
              onClick={() => setTab('file')}
            >
              Файл
            </button>
            <button
              type="button"
              className={`right-tab ${tab === 'metrics' ? 'right-tab--active' : ''}`}
              onClick={() => setTab('metrics')}
            >
              Метрики
            </button>
            <button
              type="button"
              className={`right-tab ${tab === 'settings' ? 'right-tab--active' : ''}`}
              onClick={() => setTab('settings')}
            >
              Настройки
            </button>
            <button
              type="button"
              className={`right-tab ${tab === 'about' ? 'right-tab--active' : ''}`}
              onClick={() => setTab('about')}
            >
              О нас
            </button>
          </div>

          {tab === 'file' && (
            <>
              <div className="right-code__header">
                {selectedFile ? selectedFile.file_path.split(/[\\/]/).pop() : 'Файл'}
              </div>
              <div className="card-grid">
                {!selectedFile && (
                  <div className="info-card">
                    Выбери файл слева или кликни узел в графе.
                  </div>
                )}

                {selectedFile && (
                  <>
                    <div className="info-card">
                      <div className="info-card__title">App.js</div>
                      <div className="info-row">
                        <div className="info-k">путь</div>
                        <div style={{ fontWeight: 800, wordBreak: 'break-word' }}>
                          {selectedFile.file_path}
                        </div>
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Строк кода</div>
                      <div className="info-v">{selectedFile.sloc}</div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Тип модуля</div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
                        {selectedFile.file_type || '—'}
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Импортирует</div>
                      <div className="chip-row">
                        {(selectedFile.dependencies?.length
                          ? selectedFile.dependencies.slice(0, 8)
                          : []
                        ).map((d) => (
                          <span key={d.import_path} className="chip" title={d.import_path}>
                            {d.import_path.split('/').pop()}
                          </span>
                        ))}
                        {!selectedFile.dependencies?.length && <span style={{ fontWeight: 800, opacity: 0.75 }}>пусто</span>}
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Импортируют его</div>
                      <div style={{ fontWeight: 800, opacity: 0.75 }}>пусто</div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Метрики узла</div>
                      <div className="metric-grid">
                        <div className="metric-pill">
                          <div className="metric-pill__value">{selectedFile.metrics?.out_degree ?? 0}</div>
                          <div className="metric-pill__label">outdegree</div>
                        </div>
                        <div className="metric-pill">
                          <div className="metric-pill__value">{selectedFile.metrics?.in_degree ?? 0}</div>
                          <div className="metric-pill__label">indegree</div>
                        </div>
                        <div className="metric-pill">
                          <div className="metric-pill__value">{(selectedFile.metrics?.centrality ?? 0).toFixed(2)}</div>
                          <div className="metric-pill__label">centrality</div>
                        </div>
                        <div className="metric-pill">
                          <div className="metric-pill__value">—</div>
                          <div className="metric-pill__label">cycles</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'metrics' && (
            <>
              <div className="right-code__header">Метрики проекта</div>
              <div className="card-grid">
                {!result || !derived ? (
                  <div className="info-card">Метрики появятся после завершения анализа.</div>
                ) : (
                  <>
                    <div className="info-card">
                      <div style={{ fontWeight: 900, fontSize: 16 }}>Метрики проекта</div>
                      <div style={{ fontWeight: 800, opacity: 0.7, marginTop: 2 }}>
                        {result.repository.name} · {result.statistics.total_files} файлов
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Общая статистика</div>
                      <div className="stats-table">
                        <div className="stats-row">
                          <div className="stats-k">Всего файлов</div>
                          <div className="stats-v">{result.statistics.total_files}</div>
                        </div>
                        <div className="stats-row">
                          <div className="stats-k">Связей</div>
                          <div className="stats-v">{result.statistics.total_dependencies}</div>
                        </div>
                        <div className="stats-row">
                          <div className="stats-k">Глубина графа</div>
                          <div className="stats-v">{derived.graphDepth}</div>
                        </div>
                        <div className="stats-row">
                          <div className="stats-k">Изолированных</div>
                          <div className="stats-v">{derived.isolatedCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="info-card">
                      <div className="info-card__title">Проблемы архитектуры</div>
                      <div className="problem-list">
                        <div className="problem-item">
                          <span className="problem-dot problem-dot--red" />
                          <div>
                            <div className="problem-title">
                              Циклическая зависимость
                            </div>
                            <div className="problem-sub">
                              {derived.cycleKeys.size ? `выделено рёбер: ${derived.cycleKeys.size}` : 'не найдено'}
                            </div>
                          </div>
                        </div>
                        <div className="problem-item">
                          <span className="problem-dot problem-dot--yellow" />
                          <div>
                            <div className="problem-title">Изолированный модуль</div>
                            <div className="problem-sub">
                              {derived.isolatedCount ? `файлов: ${derived.isolatedCount}` : 'не найдено'}
                            </div>
                          </div>
                        </div>
                        <div className="problem-item">
                          <span className="problem-dot problem-dot--green" />
                          <div>
                            <div className="problem-title">Нет проблем с типизацией</div>
                            <div className="problem-sub">пока не анализируем TypeScript-типы</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'settings' && (
            <>
              <div className="right-code__header">Настройки</div>
              <div className="card-grid">
                <div className="info-card">
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Настройки</div>
                  <div style={{ fontWeight: 800, opacity: 0.7, marginTop: 2 }}>отображения графа</div>
                </div>

                <div className="info-card">
                  <div className="info-card__title">Макет графа</div>
                  <div className="select-row">
                    <select className="select" disabled value="force">
                      <option value="force">Силовой (force-directed)</option>
                    </select>
                  </div>
                </div>

                <div className="info-card">
                  <div className="info-card__title">Глубина отображения</div>
                  <div className="select-row">
                    <select className="select" value={depth} onChange={(e) => setDepth(e.target.value as GraphDepth)}>
                      <option value="all">Все уровни</option>
                      <option value="1">1 уровень</option>
                      <option value="2">2 уровня</option>
                      <option value="3">3 уровня</option>
                    </select>
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 800, opacity: 0.7, fontSize: 12 }}>
                    Работает от выбранного файла/узла.
                  </div>
                </div>

                <div className="info-card">
                  <div className="info-card__title">Видимость</div>
                  <label className="toggle">
                    <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                    <span className="toggle-ui" />
                    <span className="toggle-text">Показывать метки</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={showIndirect} onChange={(e) => setShowIndirect(e.target.checked)} />
                    <span className="toggle-ui" />
                    <span className="toggle-text">Косвенные связи</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={showIsolated} onChange={(e) => setShowIsolated(e.target.checked)} />
                    <span className="toggle-ui" />
                    <span className="toggle-text">Изолированные файлы</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={highlightCycles} onChange={(e) => setHighlightCycles(e.target.checked)} />
                    <span className="toggle-ui" />
                    <span className="toggle-text">Выделять циклы</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={hideBuild} onChange={(e) => setHideBuild(e.target.checked)} />
                    <span className="toggle-ui" />
                    <span className="toggle-text">Скрыть файлы сборки</span>
                  </label>
                </div>

                <div className="info-card">
                  <div className="info-card__title">Размер узлов</div>
                  <div className="size-row">
                    <button type="button" className={`size-btn ${nodeSize === 'S' ? 'size-btn--active' : ''}`} onClick={() => setNodeSize('S')}>
                      S
                    </button>
                    <button type="button" className={`size-btn ${nodeSize === 'M' ? 'size-btn--active' : ''}`} onClick={() => setNodeSize('M')}>
                      M
                    </button>
                    <button type="button" className={`size-btn ${nodeSize === 'L' ? 'size-btn--active' : ''}`} onClick={() => setNodeSize('L')}>
                      L
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'about' && (
            <>
              <div className="right-code__header">GraphA</div>
              <div className="card-grid">
                <div className="info-card">
                  <div style={{ fontWeight: 900, fontSize: 16 }}>анализ зависимостей JS/TS</div>
                </div>

                <div className="info-card">
                  <div className="info-card__title">В чём суть</div>
                  <div style={{ fontWeight: 800, opacity: 0.85, lineHeight: 1.35 }}>
                    GraphA строит граф зависимостей между файлами вашего GitHub-репозитория и показывает архитектуру
                    проекта в интерактивном виде.
                  </div>
                </div>

                <div className="info-card">
                  <div className="info-card__title">Как использовать</div>
                  <div className="steps">
                    <div className="step">
                      <span className="step-n">1</span>
                      <div className="step-t">Вставьте ссылку на репозиторий</div>
                    </div>
                    <div className="step">
                      <span className="step-n">2</span>
                      <div className="step-t">Дождитесь построения графа</div>
                    </div>
                    <div className="step">
                      <span className="step-n">3</span>
                      <div className="step-t">Кликайте на узлы</div>
                    </div>
                    <div className="step">
                      <span className="step-n">4</span>
                      <div className="step-t">Изучайте метрики и проблемы</div>
                    </div>
                  </div>
                </div>

                <div className="info-card">
                  <div className="info-card__title">Возможности</div>
                  <div style={{ fontWeight: 800, opacity: 0.85 }}>
                    {result ? (
                      <>
                        Репозиторий: <span style={{ fontWeight: 900 }}>{result.repository.name}</span>
                        <br />
                        Файлов: <span style={{ fontWeight: 900 }}>{result.statistics.total_files}</span>
                        <br />
                        Связей: <span style={{ fontWeight: 900 }}>{result.statistics.total_dependencies}</span>
                      </>
                    ) : (
                      'Запусти анализ на главной странице.'
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

