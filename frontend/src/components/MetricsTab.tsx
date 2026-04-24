import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { AnalysisResult } from '../types/api';

interface Props {
  result: AnalysisResult | null;
  derived: {
    graphDepth: number;
    isolatedCount: number;
    cycleKeys: Set<string>;
  } | null;
  onSelectFile?: (path: string) => void;
}

// Возвращает "папка/файл.js" для наглядности
function shortDisplayName(path: string): string {
  const parts = path.split(/[\\/]/);
  if (parts.length <= 1) return path;
  return parts.slice(-2).join('/');
}

function computeMetrics(result: AnalysisResult) {
  const allLinks = result.graph_data.links.map((l) => ({
    source: String(l.source),
    target: String(l.target),
  }));

  const degreeMap = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const n of result.graph_data.nodes) {
    degreeMap.set(n.id, 0);
    inDegree.set(n.id, 0);
  }
  for (const l of allLinks) {
    degreeMap.set(l.source, (degreeMap.get(l.source) ?? 0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target) ?? 0) + 1);
    inDegree.set(l.target, (inDegree.get(l.target) ?? 0) + 1);
  }

  const topByDegree = [...degreeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, deg]) => ({ name: shortDisplayName(path), fullPath: path, links: deg }));

  const topByInDegree = [...inDegree.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, deg]) => ({ name: shortDisplayName(path), fullPath: path, links: deg }));

  // Топ по betweenness centrality
  const topByCentrality = [...result.files]
    .filter((f) => (f.metrics?.centrality ?? 0) > 0)
    .sort((a, b) => (b.metrics?.centrality ?? 0) - (a.metrics?.centrality ?? 0))
    .slice(0, 8)
    .map((f) => ({
      name: shortDisplayName(f.file_path),
      fullPath: f.file_path,
      centrality: f.metrics?.centrality ?? 0,
      degree: (f.metrics?.in_degree ?? 0) + (f.metrics?.out_degree ?? 0),
    }));

  const maxDeg = Math.max(...degreeMap.values(), 0);
  const buckets: number[] = Array(maxDeg + 1).fill(0);
  for (const deg of degreeMap.values()) buckets[deg]++;
  const histData = buckets
    .map((count, deg) => ({ deg: String(deg), count }))
    .filter((b) => b.count > 0)
    .slice(0, 12);

  // Connected components
  const adj = new Map<string, Set<string>>();
  for (const n of result.graph_data.nodes) adj.set(n.id, new Set());
  for (const l of allLinks) {
    adj.get(l.source)?.add(l.target);
    adj.get(l.target)?.add(l.source);
  }
  let components = 0;
  const visited = new Set<string>();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    components++;
    const q = [start];
    while (q.length) {
      const v = q.shift()!;
      if (visited.has(v)) continue;
      visited.add(v);
      for (const u of adj.get(v) ?? []) q.push(u);
    }
  }

  const totalNodes = result.statistics.total_files;
  const totalLinks = result.statistics.total_dependencies;
  const ratio = totalNodes ? (totalLinks / totalNodes).toFixed(2) : '0';

  return { topByDegree, topByInDegree, topByCentrality, histData, components, totalNodes, totalLinks, ratio };
}

// ── Tooltip для графика ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const count = payload[0]?.value ?? 0;
  return (
    <div style={{
      background: 'var(--panel-solid)',
      border: '2px solid rgba(61,50,95,0.2)',
      borderRadius: 10,
      padding: '6px 10px',
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--ink)',
    }}>
      <div style={{ opacity: 0.5, marginBottom: 2 }}>{label} связей</div>
      <div>{count} {count === 1 ? 'файл' : count < 5 ? 'файла' : 'файлов'}</div>
    </div>
  );
}

// ── Аккордеон-секция ────────────────────────────────────────────────────────

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="metrics-accordion">
      <button
        type="button"
        className="metrics-accordion__header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="metrics-accordion__title">{title}</span>
        <span className="metrics-accordion__arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="metrics-accordion__body">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Список топ-файлов ───────────────────────────────────────────────────────

function TopList({ items, onSelect }: {
  items: Array<{ name: string; fullPath: string; links: number }>;
  onSelect?: (path: string) => void;
}) {
  if (!items.length) return <div className="rp-empty-value">нет данных</div>;
  return (
    <div className="rp-top-list">
      {items.map(({ name, fullPath, links }, i) => (
        <div
          key={fullPath}
          className="rp-top-row"
          style={{ cursor: onSelect ? 'pointer' : 'default' }}
          onClick={() => onSelect?.(fullPath)}
          title={fullPath}
        >
          <span className="rp-top-rank">{i + 1}</span>
          <span className="rp-top-name">{name}</span>
          <span className="rp-top-value">
            {links} {links === 1 ? 'связь' : links < 5 ? 'связи' : 'связей'}
          </span>
        </div>
      ))}
    </div>
  );
}

function CentralityList({ items, onSelect }: {
  items: Array<{ name: string; fullPath: string; centrality: number; degree: number }>;
  onSelect?: (path: string) => void;
}) {
  if (!items.length) return <div className="rp-empty-value">нет данных</div>;
  const maxC = items[0]?.centrality ?? 1;
  return (
    <div className="rp-top-list">
      {items.map(({ name, fullPath, centrality, degree }, i) => (
        <div
          key={fullPath}
          className="rp-top-row"
          style={{ cursor: onSelect ? 'pointer' : 'default', flexDirection: 'column', alignItems: 'flex-start', gap: 5, paddingBottom: 8 }}
          onClick={() => onSelect?.(fullPath)}
          title={fullPath}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <span className="rp-top-rank">{i + 1}</span>
            <span className="rp-top-name" style={{ flex: 1 }}>{name}</span>
            <span className="rp-top-value">{centrality.toFixed(4)}</span>
          </div>
          <div style={{ marginLeft: 28, width: 'calc(100% - 28px)', height: 3, borderRadius: 2, background: 'rgba(128,116,164,0.15)' }}>
            <div style={{ width: `${(centrality / maxC) * 100}%`, height: '100%', borderRadius: 2, background: '#8074A4' }} />
          </div>
          <div style={{ marginLeft: 28, fontSize: 10, opacity: 0.45, fontWeight: 600 }}>
            {degree} связей
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Основной компонент ──────────────────────────────────────────────────────

export function MetricsTab({ result, derived, onSelectFile }: Props) {
  if (!result || !derived) {
    return (
      <div className="rp-body">
        <div className="rp-empty">Метрики появятся после завершения анализа.</div>
      </div>
    );
  }

  const {
    topByDegree, topByInDegree, topByCentrality, histData,
    components, totalNodes, totalLinks, ratio,
  } = computeMetrics(result);

  const ACCENT = '#8074A4';
  const histMax = Math.max(...histData.map((d) => d.count), 1);

  return (
    <div className="rp-body">

      {/* Заголовок — без разделителя */}
      <div style={{ marginBottom: 16 }}>
        <div className="rp-file-name">Статистика</div>
        <div className="rp-file-dir">{result.repository.name} · {totalNodes} файлов</div>
      </div>

      {/* Самые связанные файлы */}
      <Accordion title="Самые связанные файлы">
        <TopList items={topByDegree} onSelect={onSelectFile} />
      </Accordion>

      {/* Чаще всего импортируют */}
      <Accordion title="Чаще всего импортируют">
        <TopList items={topByInDegree} onSelect={onSelectFile} />
      </Accordion>

      {/* Ключевые файлы по centrality — только если есть ненулевые значения */}
      {topByCentrality.length > 0 && (
        <Accordion title="Ключевые файлы по централности">
          <CentralityList items={topByCentrality} onSelect={onSelectFile} />
        </Accordion>
      )}

      {/* Общая статистика */}
      <Accordion title="Общая статистика">
        <div className="rp-stats-table">
          <div className="rp-stats-row"><span>Узлов (файлов)</span><span>{totalNodes}</span></div>
          <div className="rp-stats-row"><span>Связей (импортов)</span><span>{totalLinks}</span></div>
          <div className="rp-stats-row"><span>Связных компонент</span><span>{components}</span></div>
          <div className="rp-stats-row"><span>Изолированных</span><span>{derived.isolatedCount}</span></div>
          <div className="rp-stats-row"><span>Глубина графа</span><span>{derived.graphDepth}</span></div>
          <div className="rp-stats-row rp-stats-row--last"><span>Связей / узел</span><span>{ratio}</span></div>
        </div>
      </Accordion>

      {/* Распределение связей */}
      <div className="rp-section-label" style={{ marginTop: 8 }}>Распределение связей</div>
      <div className="rp-chart-wrap">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart
            data={histData}
            margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
            barCategoryGap="20%"
          >
            <XAxis
              dataKey="deg"
              tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--ink)', opacity: 0.5 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--ink)', opacity: 0.5 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(128,116,164,0.08)' }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {histData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={ACCENT}
                  opacity={0.4 + (entry.count / histMax) * 0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="rp-histogram__hint">число связей → количество файлов</div>
      </div>

      {/* Проблемы архитектуры */}
      <Accordion title="Проблемы архитектуры">
        <div className="rp-problems">
          <div className="rp-problem-card">
            <span className="rp-problem-dot rp-problem-dot--red" />
            <div>
              <div className="rp-problem-title">Циклическая зависимость</div>
              <div className="rp-problem-sub">
                {derived.cycleKeys.size ? `выделено рёбер: ${derived.cycleKeys.size}` : 'не найдено'}
              </div>
            </div>
          </div>
          <div className="rp-problem-card">
            <span className="rp-problem-dot rp-problem-dot--yellow" />
            <div>
              <div className="rp-problem-title">Изолированный модуль</div>
              <div className="rp-problem-sub">
                {derived.isolatedCount ? `файлов: ${derived.isolatedCount}` : 'не найдено'}
              </div>
            </div>
          </div>
          {/* <div className="rp-problem-card">
            <span className="rp-problem-dot rp-problem-dot--green" />
            <div>
              <div className="rp-problem-title">Нет проблем с типизацией</div>
              <div className="rp-problem-sub">пока не анализируем TypeScript-типы</div>
            </div>
          </div> */}
        </div>
      </Accordion>

    </div>
  );
}