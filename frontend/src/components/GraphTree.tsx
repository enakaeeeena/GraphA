import { useMemo, useState } from 'react';
import type { SourceFile } from '../types/api';

type FileTypeFilter = 'all' | 'js' | 'ts' | 'tsx';

type TreeNode =
  | { kind: 'dir'; name: string; path: string; children: TreeNode[] }
  | { kind: 'file'; name: string; path: string; fileType: string };

function splitPath(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean);
}

function fileTypeFromPath(path: string): 'js' | 'ts' | 'tsx' | 'other' {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'js';
  return 'other';
}

function sortNodes(a: TreeNode, b: TreeNode) {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export class GraphTree {
  static fromFiles(files: SourceFile[]): TreeNode {
    const root: TreeNode = { kind: 'dir', name: '', path: '', children: [] };
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
          const existing = parent.children.find((c) => c.kind === 'file' && c.path === f.file_path);
          if (!existing) {
            parent.children.push({
              kind: 'file',
              name: part,
              path: f.file_path,
              fileType: f.file_type,
            });
          }
        } else {
          let dir = dirMap.get(nextPath);
          if (!dir) {
            dir = { kind: 'dir', name: part, path: nextPath, children: [] };
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
      }
    };
    sortRec(root);
    return root;
  }

  static View({
    tree,
    query,
    filter,
    selectedPath,
    onSelectPath,
  }: {
    tree: TreeNode;
    query: string;
    filter: FileTypeFilter;
    selectedPath: string | null;
    onSelectPath: (path: string) => void;
  }) {
    const [open, setOpen] = useState<Record<string, boolean>>({ '': true });
    const q = query.trim().toLowerCase();

    const matches = useMemo(() => {
      if (!q && filter === 'all') return new Set<string>();
      const set = new Set<string>();

      const walk = (n: TreeNode): boolean => {
        if (n.kind === 'file') {
          const okFilter = filter === 'all' ? true : fileTypeFromPath(n.path) === filter;
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

    const toggleDir = (path: string) => {
      setOpen((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }));
    };

    const Row = ({ node, depth }: { node: TreeNode; depth: number }) => {
      const indent = depth * 12;
      if (node.kind === 'dir') {
        const isOpen = open[node.path] ?? false;
        const visible = showAll || matches.has(node.path);
        if (!visible) return null;
        return (
          <div>
            <div
              className="tree-row tree-row--dir"
              style={{ paddingLeft: 10 + indent }}
              onClick={() => toggleDir(node.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleDir(node.path)}
            >
              <span className="tree-caret">{isOpen ? '▾' : '▸'}</span>
              <span className="tree-name">{node.name || 'root'}</span>
            </div>
            {isOpen && node.children.map((c) => <Row key={c.path} node={c} depth={depth + 1} />)}
          </div>
        );
      }

      const visible = showAll || matches.has(node.path);
      if (!visible) return null;
      const isSelected = node.path === selectedPath;
      return (
        <div
          className={`tree-row tree-row--file ${isSelected ? 'tree-row--selected' : ''}`}
          style={{ paddingLeft: 28 + indent }}
          onClick={() => onSelectPath(node.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPath(node.path)}
          title={node.path}
        >
          <span className="tree-filedot" />
          <span className="tree-name">{node.name}</span>
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

