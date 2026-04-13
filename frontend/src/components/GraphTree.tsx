import { useMemo, useState } from 'react';
import type { SourceFile } from '../types/api';

type FileTypeFilter = 'all' | 'js' | 'ts' | 'tsx';

type TreeNode =
  | { kind: 'dir'; name: string; path: string; children: TreeNode[]; fileCount: number }
  | { kind: 'file'; name: string; path: string; fileType: string; ext: string };

function splitPath(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean);
}

function getExt(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.jsx')) return 'jsx';
  if (lower.endsWith('.js')) return 'js';
  return '';
}

function fileTypeFromExt(ext: string): 'js' | 'ts' | 'tsx' | 'other' {
  if (ext === 'tsx' || ext === 'jsx') return 'tsx';
  if (ext === 'ts') return 'ts';
  if (ext === 'js') return 'js';
  return 'other';
}

function sortNodes(a: TreeNode, b: TreeNode) {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function countFiles(node: TreeNode): number {
  if (node.kind === 'file') return 1;
  return node.children.reduce((acc, c) => acc + countFiles(c), 0);
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 7C3 5.9 3.9 5 5 5h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
        fill="#C9A465" stroke="#B8924F" strokeWidth="1" />
    </svg>
  );
}

function IconFile({ ext }: { ext: string }) {
  const fill = ext === 'tsx' || ext === 'jsx' ? '#8074A4' : ext === 'ts' ? '#6B7FD4' : '#9B8EC4';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" fill={fill} />
      <polyline points="13 2 13 9 20 9" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
    </svg>
  );
}

function IconEye({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--accent)' : 'rgba(61,50,95,0.22)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'stroke 0.15s' }}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3"
        fill={active ? 'var(--accent)' : 'none'}
        stroke={active ? 'var(--accent)' : 'rgba(61,50,95,0.22)'} />
    </svg>
  );
}

const EXT_COLORS: Record<string, { bg: string; color: string }> = {
  tsx: { bg: 'rgba(128,116,164,0.18)', color: '#534AB7' },
  jsx: { bg: 'rgba(128,116,164,0.18)', color: '#534AB7' },
  ts:  { bg: 'rgba(107,127,212,0.18)', color: '#3C52A8' },
  js:  { bg: 'rgba(201,164,101,0.2)',  color: '#8A6520' },
};

function ExtBadge({ ext }: { ext: string }) {
  if (!ext) return null;
  const style = EXT_COLORS[ext] ?? { bg: 'rgba(61,50,95,0.1)', color: '#3d325f' };
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 5,
      background: style.bg, color: style.color, flexShrink: 0, letterSpacing: '0.2px' }}>
      .{ext}
    </span>
  );
}

export class GraphTree {
  static fromFiles(files: SourceFile[]): TreeNode {
    const root: TreeNode = { kind: 'dir', name: '', path: '', children: [], fileCount: 0 };
    const dirMap = new Map<string, TreeNode>();
    dirMap.set('', root);

    for (const f of files) {
      const parts = splitPath(f.file_path);
      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const nextPath = currentPath ? `${currentPath}/${part}` : part;
        const isLeaf = i === parts.length - 1;
        const parent = dirMap.get(currentPath);
        if (!parent || parent.kind !== 'dir') break;
        if (isLeaf) {
          if (!parent.children.find((c) => c.kind === 'file' && c.path === f.file_path)) {
            const ext = getExt(f.file_path);
            parent.children.push({ kind: 'file', name: part, path: f.file_path, fileType: f.file_type, ext });
          }
        } else {
          let dir = dirMap.get(nextPath);
          if (!dir) {
            dir = { kind: 'dir', name: part, path: nextPath, children: [], fileCount: 0 };
            dirMap.set(nextPath, dir);
            parent.children.push(dir);
          }
        }
        currentPath = nextPath;
      }
    }

    const sortRec = (n: TreeNode) => {
      if (n.kind === 'dir') {
        n.children.sort(sortNodes);
        n.children.forEach(sortRec);
        n.fileCount = countFiles(n);
      }
    };
    sortRec(root);
    return root;
  }

  static Panel({
    tree, selectedPath, focusedPath, onSelectPath, onFocusToggle, collapsed, onCollapse,
  }: {
    tree: TreeNode;
    selectedPath: string | null;
    focusedPath: string | null;
    onSelectPath: (path: string) => void;
    onFocusToggle: (path: string) => void;
    collapsed: boolean;
    onCollapse: () => void;
  }) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<FileTypeFilter>('all');

    return (
      <div className={`graph-panel ${collapsed ? 'graph-panel--collapsed' : ''}`}>
        <div className="graph-panel__header">
          {!collapsed && (
            <>
              <div className="graph-panel__title">Файлы</div>
              <div className="panel-filters">
                {(['all', 'js', 'ts', 'tsx'] as FileTypeFilter[]).map((f) => (
                  <button key={f} type="button"
                    className={`panel-filter-btn ${filter === f ? 'panel-filter-btn--active' : ''}`}
                    onClick={() => setFilter(f)}>
                    {f === 'all' ? 'все' : `.${f}`}
                  </button>
                ))}
              </div>
            </>
          )}
          <button className="panel-collapse-btn" type="button"
            title={collapsed ? 'Развернуть' : 'Свернуть'} onClick={onCollapse}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {!collapsed && (
          <div className="graph-panel__body">
            <input className="graph-search" value={query}
              onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" />
            <div className="tree-wrap">
              <GraphTree.View
                tree={tree} query={query} filter={filter}
                selectedPath={selectedPath} focusedPath={focusedPath}
                onSelectPath={onSelectPath} onFocusToggle={onFocusToggle}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  static View({
    tree, query, filter, selectedPath, focusedPath, onSelectPath, onFocusToggle,
  }: {
    tree: TreeNode;
    query: string;
    filter: FileTypeFilter;
    selectedPath: string | null;
    focusedPath: string | null;
    onSelectPath: (path: string) => void;
    onFocusToggle: (path: string) => void;
  }) {
    const [open, setOpen] = useState<Record<string, boolean>>({ '': true });
    const q = query.trim().toLowerCase();

    const matches = useMemo(() => {
      if (!q && filter === 'all') return new Set<string>();
      const set = new Set<string>();
      const walk = (n: TreeNode): boolean => {
        if (n.kind === 'file') {
          const okFilter = filter === 'all' ? true : fileTypeFromExt(n.ext) === filter;
          const okQuery = !q ? true : n.path.toLowerCase().includes(q);
          const ok = okFilter && okQuery;
          if (ok) set.add(n.path);
          return ok;
        }
        let any = false;
        for (const c of n.children) any = walk(c) || any;
        if (any) set.add(n.path);
        return any;
      };
      walk(tree);
      return set;
    }, [filter, q, tree]);

    const showAll = !q && filter === 'all';
    const toggleDir = (path: string) =>
      setOpen((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }));

    const Row = ({ node, depth }: { node: TreeNode; depth: number }) => {
      const indent = depth * 14;

      if (node.kind === 'dir') {
        const isOpen = open[node.path] ?? false;
        if (!showAll && !matches.has(node.path)) return null;
        return (
          <div>
            <div className="tree-row tree-row--dir" style={{ paddingLeft: 8 + indent }}
              onClick={() => toggleDir(node.path)} role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleDir(node.path)}>
              <span className="tree-caret">{isOpen ? '▾' : '▸'}</span>
              <IconFolder />
              <span className="tree-name" style={{ flex: 1 }}>{node.name || 'root'}</span>
              {node.fileCount > 0 && <span className="tree-count">{node.fileCount}</span>}
            </div>
            {isOpen && node.children.map((c) => <Row key={c.path} node={c} depth={depth + 1} />)}
          </div>
        );
      }

      if (!showAll && !matches.has(node.path)) return null;
      const isSelected = node.path === selectedPath;
      const isFocused = node.path === focusedPath;

      return (
        <div
          // ← data-path для прокрутки дерева при клике в графе
          data-path={node.path}
          className={`tree-row tree-row--file ${isSelected ? 'tree-row--selected' : ''}`}
          style={{ paddingLeft: 8 + indent }}
          onClick={() => onSelectPath(node.path)}
          role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPath(node.path)}
          title={node.path}
        >
          <IconFile ext={node.ext} />
          <span className="tree-name" style={{ flex: 1 }}>
            {node.name.replace(/\.[^.]+$/, '')}
          </span>
          <button
            className={`tree-focus-btn ${isFocused ? 'tree-focus-btn--active' : ''}`}
            type="button"
            title={isFocused ? 'Выйти из режима фокуса' : 'Показать только связи этого файла'}
            onClick={(e) => { e.stopPropagation(); onFocusToggle(node.path); }}>
            <IconEye active={isFocused} />
          </button>
          <ExtBadge ext={node.ext} />
        </div>
      );
    };

    return (
      <div className="tree">
        {tree.kind === 'dir' && tree.children.map((c) => <Row key={c.path} node={c} depth={0} />)}
      </div>
    );
  }
}