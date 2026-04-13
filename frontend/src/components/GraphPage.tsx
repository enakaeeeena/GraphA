import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResult, SourceFile } from '../types/api';
import { GraphCanvas } from './GraphCanvas';
import { apiClient } from '../api/client';
import { GraphTree } from './GraphTree.tsx';
import { MetricsTab } from './MetricsTab';
import { GraphCanvasHierarchical } from './GraphCanvasHierarchical';

interface GraphPageProps {
  sessionId: string;
  onBack: (repoUrl?: string) => void;
}

type RightTab = 'file' | 'metrics' | 'settings' | 'about';
type GraphDepth = 'all' | '1' | '2' | '3';
type NodeSize = 'S' | 'M' | 'L';

function isBuildFile(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes('node_modules\\') || p.includes('node_modules/') ||
    p.includes('\\dist\\') || p.includes('/dist/') ||
    p.includes('\\build\\') || p.includes('/build/') ||
    p.includes('\\.next\\') || p.includes('/.next/') ||
    p.includes('\\coverage\\') || p.includes('/coverage/') ||
    p.includes('\\.cache\\') || p.includes('/.cache/')
  );
}

function buildAdjacency(links: Array<{ source: string; target: string }>): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const set = adj.get(a) ?? new Set<string>(); set.add(b); adj.set(a, set);
  };
  for (const l of links) { add(l.source, l.target); add(l.target, l.source); }
  return adj;
}

function bfsWithinDepth(adj: Map<string, Set<string>>, start: string, depth: number): Set<string> {
  const seen = new Set<string>([start]);
  let frontier = new Set<string>([start]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const v of frontier)
      for (const u of adj.get(v) ?? [])
        if (!seen.has(u)) { seen.add(u); next.add(u); }
    frontier = next;
    if (!frontier.size) break;
  }
  return seen;
}

function approxGraphDepth(adj: Map<string, Set<string>>): number {
  const nodes = Array.from(adj.keys());
  if (!nodes.length) return 0;
  const bfs = (start: string) => {
    const dist = new Map<string, number>(); dist.set(start, 0);
    const q: string[] = [start]; let far = start;
    while (q.length) {
      const v = q.shift()!; const dv = dist.get(v)!;
      if (dv > (dist.get(far) ?? 0)) far = v;
      for (const u of adj.get(v) ?? [])
        if (!dist.has(u)) { dist.set(u, dv + 1); q.push(u); }
    }
    return { far, max: dist.get(far) ?? 0 };
  };
  return bfs(bfs(nodes[0]!).far).max;
}

function findCycleEdgeKeysDirected(links: Array<{ source: string; target: string }>): Set<string> {
  const g = new Map<string, string[]>(); const rg = new Map<string, string[]>();
  const addE = (m: Map<string, string[]>, a: string, b: string) => { const arr = m.get(a) ?? []; arr.push(b); m.set(a, arr); };
  const nodes = new Set<string>();
  for (const l of links) { nodes.add(l.source); nodes.add(l.target); addE(g, l.source, l.target); addE(rg, l.target, l.source); }
  const visited = new Set<string>(); const order: string[] = [];
  const dfs1 = (v: string) => { visited.add(v); for (const u of g.get(v) ?? []) if (!visited.has(u)) dfs1(u); order.push(v); };
  for (const v of nodes) if (!visited.has(v)) dfs1(v);
  const comp = new Map<string, number>(); let cid = 0;
  const dfs2 = (v: string) => { comp.set(v, cid); for (const u of rg.get(v) ?? []) if (!comp.has(u)) dfs2(u); };
  for (let i = order.length - 1; i >= 0; i--) { const v = order[i]!; if (!comp.has(v)) { dfs2(v); cid++; } }
  const compSize = new Map<number, number>();
  for (const c of comp.values()) compSize.set(c, (compSize.get(c) ?? 0) + 1);
  const cycleKeys = new Set<string>();
  for (const l of links) {
    const cs = comp.get(l.source), ct = comp.get(l.target);
    if (cs == null || ct == null) continue;
    if (cs === ct && (compSize.get(cs) ?? 0) > 1) cycleKeys.add(`${l.source}→${l.target}`);
  }
  return cycleKeys;
}
// Ограничиваем граф до topN самых связанных узлов
function limitGraph(
  nodes: Array<{ id: string }>,
  links: Array<{ source: string; target: string }>,
  topN: number,
): { nodes: Array<{ id: string }>; links: Array<{ source: string; target: string }> } {
  if (nodes.length <= topN) return { nodes, links };

  // Считаем degree каждого узла
  const degree = new Map<string, number>();
  for (const n of nodes) degree.set(n.id, 0);
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }

  // Берём топ N по degree
  const topIds = new Set(
    [...degree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id]) => id)
  );

  const filteredNodes = nodes.filter((n) => topIds.has(n.id));
  const filteredLinks = links.filter((l) => topIds.has(l.source) && topIds.has(l.target));
  return { nodes: filteredNodes, links: filteredLinks };
}

// Стиль кнопок зума
const zoomBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid rgba(61,50,95,0.25)',
  background: 'rgba(255,250,235,0.92)',
  color: '#3D325F', cursor: 'pointer',
  fontSize: 20, fontWeight: 700,
  display: 'grid', placeItems: 'center',
  boxShadow: '0 2px 8px rgba(61,50,95,0.08)',
  transition: 'background 0.15s',
};

export function GraphPage({ sessionId, onBack }: GraphPageProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [statusText, setStatusText] = useState<string>('Запускаем анализ…');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<RightTab>('file');

  // MCL параметры
  const [mclInflation, setMclInflation] = useState(2);
  const [mclIterations, setMclIterations] = useState(12);

  // Шапка
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [newRepoUrl, setNewRepoUrl] = useState('');

  // Левая панель
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Фокус на файле
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  // Экспорт
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const graphWrapperRef = useRef<HTMLDivElement>(null);

  // Функция зума из GraphCanvas
  const zoomFnRef = useRef<((delta: number) => void) | null>(null);

  // Settings
  const [showLabels, setShowLabels] = useState(true);
  const [showIndirect, setShowIndirect] = useState(true);
  const [showIsolated, setShowIsolated] = useState(true);
  const [highlightCycles, setHighlightCycles] = useState(true);
  const [hideBuild, setHideBuild] = useState(true);
  const [depth, setDepth] = useState<GraphDepth>('all');
  const [nodeSize, setNodeSize] = useState<NodeSize>('M');
  const [graphMode, setGraphMode] = useState<'force' | 'hierarchy'>('force');

  useEffect(() => {
    let cancelled = false; let intervalId: number | undefined; let stopped = false;
    const stopPolling = () => { if (stopped) return; stopped = true; if (intervalId) window.clearInterval(intervalId); };
    const tick = async () => {
      try {
        if (stopped) return;
        const status = await apiClient.getSessionStatus(sessionId);
        if (cancelled) return;
        if (status.status === 'processing') { setStatusText('Клонируем и анализируем репозиторий…'); return; }
        if (status.status === 'failed') { setError(status.error || 'Анализ завершился с ошибкой'); stopPolling(); return; }
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
    return () => { cancelled = true; stopPolling(); };
  }, [sessionId]);

  // Прокручиваем дерево файлов к выбранному файлу при клике в графе
  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-path="${CSS.escape(selectedId)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedId]);

  const handleFocusToggle = (path: string) => {
    if (focusedPath === path) {
      setFocusedPath(null); setDepth('all');
    } else {
      setFocusedPath(path); setSelectedId(path);
      if (depth === 'all') setDepth('1');
      
    }
  };

  const handleExport = (scale: number) => {
    const svgEl = graphWrapperRef.current?.querySelector('svg');
    if (!svgEl) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fffaeb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `${result?.repository.name ?? 'graph'}_${canvas.width}x${canvas.height}.png`;
      link.href = canvas.toDataURL('image/png'); link.click();
    };
    img.src = url;
    setExportMenuOpen(false);
  };

  const selectedFile: SourceFile | null = useMemo(
    () => (selectedId ? result?.files.find((f) => f.file_path === selectedId) ?? null : null),
    [result, selectedId],
  );

  const fileTree = useMemo(() => (result ? GraphTree.fromFiles(result.files) : null), [result]);
  const effectiveSelectedId = focusedPath ?? selectedId;

  const derived = useMemo(() => {
    if (!result) return null;
    const rawLinks = result.graph_data.links.map((l) => ({ source: String(l.source), target: String(l.target) }));
    const degree = new Map<string, number>();
    for (const n of result.graph_data.nodes) degree.set(n.id, 0);
    for (const l of rawLinks) {
      degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
      degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
    }
    const baseNodes = result.graph_data.nodes.map((n) => n.id)
      .filter((id) => showIsolated || (degree.get(id) ?? 0) > 0)
      .filter((id) => !hideBuild || !isBuildFile(id));
    const baseSet = new Set(baseNodes);
    const baseLinks = rawLinks.filter((l) => baseSet.has(l.source) && baseSet.has(l.target));
    const adj = buildAdjacency(baseLinks);
    const graphDepth = approxGraphDepth(adj);
    const isolatedCount = Array.from(baseSet).filter((id) => (degree.get(id) ?? 0) === 0).length;
    let visibleSet = baseSet;
    const dN = depth === 'all' ? null : Number(depth);
    if (dN != null && effectiveSelectedId && baseSet.has(effectiveSelectedId))
      visibleSet = bfsWithinDepth(adj, effectiveSelectedId, dN);
    const visibleLinks = baseLinks.filter((l) => visibleSet.has(l.source) && visibleSet.has(l.target));
    const finalLinks = showIndirect
      ? visibleLinks
      : visibleLinks.filter((l) => l.source === effectiveSelectedId || l.target === effectiveSelectedId);
    const allFinalNodes = result.graph_data.nodes.filter((n) => visibleSet.has(n.id));

    // Ограничиваем до 500 узлов для стабильности браузера
    const limited = limitGraph(allFinalNodes, finalLinks, 500);
    const cycleKeys = highlightCycles ? findCycleEdgeKeysDirected(limited.links) : new Set<string>();

    return {
      graphData: { nodes: limited.nodes, links: limited.links } as AnalysisResult['graph_data'],
      graphDepth,
      isolatedCount,
      cycleKeys,
      isLimited: allFinalNodes.length > 500,
      totalNodes: allFinalNodes.length,
    };
  }, [depth, hideBuild, highlightCycles, result, effectiveSelectedId, showIndirect, showIsolated]);
  const nodeRadius = nodeSize === 'S' ? 7 : nodeSize === 'L' ? 12 : 9;
  const selectedFileName = selectedFile?.file_path.split(/[\\/]/).pop() ?? null;
  const selectedFileDir = selectedFile ? selectedFile.file_path.split(/[\\/]/).slice(0, -1).join('/') : null;
 
  return (
    <div className="graph-layout">

      {/* ── ШАПКА ─────────────────────────────────────────────────────────── */}
      <div className="graph-topbar">
        <div className="topbar-left">
          <div className="topbar-logo" title="GraphA">G</div>
          <button className="topbar-circle-btn" onClick={() => onBack()} title="Назад" type="button">←</button>
          <button className="topbar-circle-btn" title="Сравнить версии (скоро)" type="button" disabled>⇄</button>
        </div>

        <div className="topbar-center">
          <button className="topbar-project-btn" onClick={() => setProjectMenuOpen((v) => !v)} type="button">
            {result?.repository.name || 'Project_name'}
            <span className="topbar-chevron">{projectMenuOpen ? '▲' : '▼'}</span>
          </button>
          {projectMenuOpen && (
            <div className="topbar-dropdown">
              <div className="topbar-dropdown__label">Текущий проект</div>
              <div className="topbar-dropdown__current">{result?.repository.url || '—'}</div>
              <div className="topbar-dropdown__divider" />
              <div className="topbar-dropdown__label">Открыть другой репозиторий</div>
              <div className="topbar-dropdown__row">
                <input className="topbar-dropdown__input" placeholder="https://github.com/user/repo.git" value={newRepoUrl} onChange={(e) => setNewRepoUrl(e.target.value)} />
                <button className="topbar-dropdown__go" type="button" disabled={!newRepoUrl.trim()}
                  onClick={() => { if (newRepoUrl.trim()) { setProjectMenuOpen(false); onBack(newRepoUrl.trim()); } }}>→</button>
              </div>
            </div>
          )}
        </div>

        <div className="topbar-right">
          <button className={`topbar-circle-btn ${tab === 'file' ? 'topbar-circle-btn--active' : ''}`} onClick={() => setTab('file')} title="О файле" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="12" y2="17"/>
            </svg>
          </button>
          <button className={`topbar-circle-btn ${tab === 'metrics' ? 'topbar-circle-btn--active' : ''}`} onClick={() => setTab('metrics')} title="Метрики" type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </button>
          <button className={`topbar-circle-btn ${tab === 'settings' ? 'topbar-circle-btn--active' : ''}`} onClick={() => setTab('settings')} title="Настройки" type="button">⚙</button>
          <button className={`topbar-circle-btn ${tab === 'about' ? 'topbar-circle-btn--active' : ''}`} onClick={() => setTab('about')} title="О программе" type="button">?</button>
          <div className="topbar-export-wrap">
            <button className="topbar-export-btn" type="button" onClick={() => setExportMenuOpen((v) => !v)}>Экспорт →</button>
            {exportMenuOpen && (
              <div className="topbar-export-menu">
                <div className="topbar-dropdown__label" style={{ marginBottom: 8 }}>Сохранить граф как PNG</div>
                {[{ label: '1x — экранное', scale: 1 }, { label: '2x — HD', scale: 2 }, { label: '4x — Print', scale: 4 }].map(({ label, scale }) => (
                  <button key={scale} className="topbar-export-option" type="button" onClick={() => handleExport(scale)}>{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ОСНОВНОЙ КОНТЕНТ ──────────────────────────────────────────────── */}
      <div className={`graph-main ${leftCollapsed ? 'graph-main--collapsed' : ''}`}>

        {/* Левая панель */}
        {fileTree ? (
          <GraphTree.Panel
            tree={fileTree}
            selectedPath={selectedId}
            focusedPath={focusedPath}
            onSelectPath={setSelectedId}
            onFocusToggle={handleFocusToggle}
            collapsed={leftCollapsed}
            onCollapse={() => setLeftCollapsed((v) => !v)}
          />
        ) : (
          <div className={`graph-panel ${leftCollapsed ? 'graph-panel--collapsed' : ''}`}>
            <div className="graph-panel__header">
              {!leftCollapsed && <div className="graph-panel__title">Файлы</div>}
              <button className="panel-collapse-btn" type="button" onClick={() => setLeftCollapsed((v) => !v)}>
                {leftCollapsed ? '›' : '‹'}
              </button>
            </div>
          </div>
        )}

        {/* Граф */}
        <div className="graph-canvas-wrap" ref={graphWrapperRef}>
          {focusedPath && (
            <div className="focus-indicator">
              <span>Фокус: {focusedPath.split(/[\\/]/).pop()}</span>
              <button type="button" onClick={() => { setFocusedPath(null); setDepth('all'); setShowIndirect(true); }}>
                ✕ Сбросить
              </button>
            </div>
          )}
          {derived?.isLimited && (
  <div style={{
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(255,250,235,0.92)', border: '1.5px solid rgba(201,164,101,0.5)',
    borderRadius: 999, padding: '5px 14px', fontSize: 11, fontWeight: 700,
    color: '#8A6520', zIndex: 10, whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(61,50,95,0.08)',
  }}>
    Показаны 500 из {derived.totalNodes} файлов (топ по связям)
  </div>
)}

          {/* Кнопки зума — только для силового графа */}
          {graphMode === 'force' && (
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
              <button type="button" style={zoomBtnStyle} onClick={() => zoomFnRef.current?.(1.3)}>+</button>
              <button type="button" style={zoomBtnStyle} onClick={() => zoomFnRef.current?.(0.77)}>−</button>
            </div>
          )}

          {result && derived && graphMode === 'force' && (
            <GraphCanvas
              data={derived.graphData}
              selectedNodeId={effectiveSelectedId}
              onSelectNode={setSelectedId}
              showLabels={showLabels}
              nodeRadius={nodeRadius}
              cycleEdgeKeys={derived.cycleKeys}
              mclInflation={mclInflation}
              mclIterations={mclIterations}
              onZoomReady={(fn) => { zoomFnRef.current = fn; }}
              focusNodeId={focusedPath}
            />
          )}
          {result && derived && graphMode === 'hierarchy' && (
            <GraphCanvasHierarchical
              data={derived.graphData}
              selectedNodeId={effectiveSelectedId}
              onSelectNode={setSelectedId}
              cycleEdgeKeys={derived.cycleKeys}
              mclInflation={mclInflation}
              mclIterations={mclIterations}
            />
          )}
          {!result && (
            <div className="graph-loading">
              <div className="graph-loading__title">{error ? 'Ошибка' : 'Загрузка'}</div>
              <div className="graph-loading__text">{error || statusText}</div>
            </div>
          )}
        </div>

        {/* Правая панель */}
        <div className="right-code">

          {tab === 'file' && (
            <div className="rp-body">
              {!selectedFile ? (
                <div className="rp-empty">Выбери файл слева или кликни узел в графе.</div>
              ) : (
                <>
                  <div className="rp-file-header">
                    <div className="rp-file-name">{selectedFileName}</div>
                    <div className="rp-file-dir">{selectedFileDir}</div>
                  </div>
                  <div className="rp-section-label">Строк кода</div>
                  <div className="rp-big-number">{selectedFile.sloc}</div>
                  <div className="rp-section-label">Тип модуля</div>
                  <div className="rp-type">{selectedFile.file_type || '—'}</div>
                  <div className="rp-section-label">Импортирует</div>
                  <div className="rp-chips">
                    {selectedFile.dependencies?.length
                      ? selectedFile.dependencies.slice(0, 12).map((d) => (
                          <span
                            key={d.import_path}
                            className="rp-chip"
                            title={d.import_path}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              // Переход к файлу по клику на чип
                              const match = result?.files.find((f) =>
                                f.file_path === d.import_path ||
                                f.file_path.endsWith('/' + d.import_path.replace(/^\.\//, '')) ||
                                f.file_path.endsWith('\\' + d.import_path.replace(/^\.\//, ''))
                              );
                              if (match) setSelectedId(match.file_path);
                            }}
                          >
                            {d.import_path.split(/[\\/]/).pop()}
                          </span>
                        ))
                      : <span className="rp-empty-value">пусто</span>}
                  </div>
                  <div className="rp-section-label">Импортируют его</div>
                  <div className="rp-chips">
                    {(() => {
                      // Файлы которые импортируют текущий
                      const importers = result?.files.filter((f) =>
                        f.dependencies?.some((d) =>
                          d.import_path === selectedId ||
                          selectedId?.endsWith('/' + d.import_path.replace(/^\.\//, '')) ||
                          selectedId?.endsWith('\\' + d.import_path.replace(/^\.\//, ''))
                        )
                      ) ?? [];
                      return importers.length ? importers.slice(0, 12).map((f) => (
                        <span
                          key={f.file_path}
                          className="rp-chip"
                          title={f.file_path}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedId(f.file_path)}
                        >
                          {f.file_path.split(/[\\/]/).pop()}
                        </span>
                      )) : <span className="rp-empty-value">пусто</span>;
                    })()}
                  </div>
                  <div className="rp-section-label">Метрики узла</div>
                  <div className="rp-metric-grid">
                    <div className="rp-metric-pill"><div className="rp-metric-value">{selectedFile.metrics?.out_degree ?? 0}</div><div className="rp-metric-label">outdegree</div></div>
                    <div className="rp-metric-pill"><div className="rp-metric-value">{selectedFile.metrics?.in_degree ?? 0}</div><div className="rp-metric-label">indegree</div></div>
                    <div className="rp-metric-pill"><div className="rp-metric-value">{(selectedFile.metrics?.centrality ?? 0).toFixed(2)}</div><div className="rp-metric-label">centrality</div></div>
                    <div className="rp-metric-pill"><div className="rp-metric-value">—</div><div className="rp-metric-label">cycles</div></div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'metrics' && (
            <MetricsTab result={result} derived={derived} />
          )}

          {tab === 'settings' && (
            <div className="rp-body">
              <div className="rp-file-header">
                <div className="rp-file-name">Настройки</div>
                <div className="rp-file-dir">отображения графа</div>
              </div>

              <div className="rp-section-label">Макет графа</div>
              <select className="rp-select" value={graphMode} onChange={(e) => setGraphMode(e.target.value as 'force' | 'hierarchy')}>
                <option value="force">Силовой (force-directed)</option>
                <option value="hierarchy">Иерархический (dagre)</option>
              </select>

              <div className="rp-section-label">Глубина отображения</div>
              <select className="rp-select" value={depth} onChange={(e) => setDepth(e.target.value as GraphDepth)}>
                <option value="all">Все уровни</option>
                <option value="1">1 уровень</option>
                <option value="2">2 уровня</option>
                <option value="3">3 уровня</option>
              </select>

              <div className="rp-section-label">Видимость</div>
              <div className="rp-toggles">
                {[
                  { label: 'Показывать метки', sub: 'имена файлов на узлах', val: showLabels, set: setShowLabels },
                  { label: 'Косвенные связи', sub: 'пунктирные рёбра', val: showIndirect, set: setShowIndirect },
                  { label: 'Изолированные файлы', sub: 'без связей', val: showIsolated, set: setShowIsolated },
                  { label: 'Выделять циклы', sub: 'цветом', val: highlightCycles, set: setHighlightCycles },
                  { label: 'Скрыть файлы сборки', sub: 'dist, build, .next…', val: hideBuild, set: setHideBuild },
                ].map(({ label, sub, val, set }) => (
                  <label key={label} className="rp-toggle-row">
                    <div className="rp-toggle-text">
                      <span className="rp-toggle-title">{label}</span>
                      <span className="rp-toggle-sub">{sub}</span>
                    </div>
                    <div className="rp-toggle-ui-wrap">
                      <input type="checkbox" className="rp-toggle-input" checked={val} onChange={(e) => set(e.target.checked)} />
                      <span className="rp-toggle-ui" />
                    </div>
                  </label>
                ))}
              </div>

              <div className="rp-section-label">Размер узлов</div>
              <div className="rp-size-row">
                {(['S', 'M', 'L'] as NodeSize[]).map((s) => (
                  <button key={s} type="button" className={`rp-size-btn ${nodeSize === s ? 'rp-size-btn--active' : ''}`} onClick={() => setNodeSize(s)}>{s}</button>
                ))}
              </div>

              <div className="rp-section-label">Кластеризация Маркова</div>
              <div className="rp-toggles">
                <div className="rp-toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid rgba(61,50,95,0.1)', paddingBottom: 12 }}>
                  <div className="rp-toggle-text">
                    <span className="rp-toggle-title">Сила кластеризации</span>
                    <span className="rp-toggle-sub">выше = мельче кластеры · сейчас: {mclInflation.toFixed(1)}</span>
                  </div>
                  <input type="range" min="1.2" max="5" step="0.1" value={mclInflation}
                    onChange={(e) => setMclInflation(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 10, opacity: 0.45, fontWeight: 700 }}>
                    <span>крупные кластеры</span><span>мелкие кластеры</span>
                  </div>
                </div>
                <div className="rp-toggle-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, borderBottom: 'none' }}>
                  <div className="rp-toggle-text">
                    <span className="rp-toggle-title">Итерации</span>
                    <span className="rp-toggle-sub">больше = точнее · сейчас: {mclIterations}</span>
                  </div>
                  <input type="range" min="5" max="30" step="1" value={mclIterations}
                    onChange={(e) => setMclIterations(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 10, opacity: 0.45, fontWeight: 700 }}>
                    <span>быстро</span><span>точно</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div className="rp-body">
              <div className="rp-file-header">
                <div className="rp-file-name">GraphA</div>
                <div className="rp-file-dir">анализ зависимостей JS/TS</div>
              </div>
              <div className="rp-section-label">В чём суть</div>
              <div className="rp-about-text">GraphA строит граф зависимостей между файлами вашего GitHub-репозитория и показывает архитектуру проекта в интерактивном виде.</div>
              <div className="rp-section-label">Как использовать</div>
              <div className="rp-steps">
                {['Вставьте ссылку на репозиторий', 'Дождитесь построения графа', 'Кликайте на узлы', 'Изучайте метрики и проблемы'].map((text, i) => (
                  <div key={i} className="rp-step">
                    <span className="rp-step-n">{i + 1}</span>
                    <span className="rp-step-t">{text}</span>
                  </div>
                ))}
              </div>
              {result && (
                <>
                  <div className="rp-section-label">Текущий репозиторий</div>
                  <div className="rp-stats-table">
                    <div className="rp-stats-row"><span>Репозиторий</span><span>{result.repository.name}</span></div>
                    <div className="rp-stats-row"><span>Файлов</span><span>{result.statistics.total_files}</span></div>
                    <div className="rp-stats-row rp-stats-row--last"><span>Связей</span><span>{result.statistics.total_dependencies}</span></div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}