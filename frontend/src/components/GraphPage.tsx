import { useMemo, useState } from 'react';
import type { AnalysisResult, SourceFile } from '../types/api';
import { GraphCanvas } from './GraphCanvas';

interface GraphPageProps {
  result: AnalysisResult;
  onBack: () => void;
}

type FileTypeFilter = 'all' | 'js' | 'ts' | 'tsx';

function fileTypeFromPath(path: string): 'js' | 'ts' | 'tsx' | 'other' {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'js';
  return 'other';
}

export function GraphPage({ result, onBack }: GraphPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FileTypeFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    result.graph_data.nodes[0]?.id ?? null,
  );

  const selectedFile: SourceFile | null = useMemo(() => {
    if (!selectedId) return null;
    return result.files.find((f) => f.file_path === selectedId) ?? null;
  }, [result.files, selectedId]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return result.files.filter((f) => {
      if (filter !== 'all') {
        const ft = fileTypeFromPath(f.file_path);
        if (ft !== filter) return false;
      }
      if (!q) return true;
      return f.file_path.toLowerCase().includes(q);
    });
  }, [filter, query, result.files]);

  return (
    <div className="graph-layout">
      <div className="graph-topbar">
        <div className="graph-topbar__logo" title="Graph">
          G
        </div>

        <input
          className="graph-topbar__project"
          value={result.repository.name || 'Project_name'}
          readOnly
        />

        <div className="graph-topbar__right">
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
            <button
              onClick={onBack}
              style={{
                border: '2px solid var(--ink)',
                background: 'transparent',
                borderRadius: 999,
                padding: '6px 10px',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Назад
            </button>
          </div>

          <div className="graph-panel__body">
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

            <div className="file-list">
              {filteredFiles.slice(0, 120).map((f) => {
                const isSelected = f.file_path === selectedId;
                return (
                  <div
                    key={f.file_path}
                    className={`file-card ${isSelected ? 'file-card--selected' : ''}`}
                    onClick={() => setSelectedId(f.file_path)}
                    title={f.file_path}
                  >
                    <div className="file-card__path">{f.file_path}</div>
                    <div className="file-card__meta">
                      {f.file_type} · deps: {f.dependencies.length}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="graph-panel">
          <div className="graph-panel__header">
            <div className="graph-panel__title">Graph</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Узлов: {result.graph_data.nodes.length} · Связей: {result.graph_data.links.length}
            </div>
          </div>

          <GraphCanvas
            data={result.graph_data}
            selectedNodeId={selectedId}
            onSelectNode={(id) => setSelectedId(id)}
          />
        </div>

        <div className="right-code">
          <div className="right-code__header">App.js</div>
          <div className="right-code__body">
            {selectedFile
              ? [
                  `// ${selectedFile.file_path}`,
                  ``,
                  `type: ${selectedFile.file_type}`,
                  `sloc: ${selectedFile.sloc}`,
                  `deps: ${selectedFile.dependencies.length}`,
                  selectedFile.metrics
                    ? `in/out: ${selectedFile.metrics.in_degree}/${selectedFile.metrics.out_degree} | centrality: ${selectedFile.metrics.centrality.toFixed(3)}`
                    : '',
                  ``,
                  `imports:`,
                  ...selectedFile.dependencies.slice(0, 80).map((d) => `- ${d.import_path} (${d.import_type})`),
                ]
                  .filter(Boolean)
                  .join('\n')
              : `Выбери узел/файл слева или в графе.`}
          </div>
        </div>
      </div>
    </div>
  );
}

