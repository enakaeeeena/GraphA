/**
 * MCL — Markov Cluster Algorithm
 * Для графов > MCL_MAX_NODES автоматически переключается
 * на раскраску по папкам (быстро, без матриц).
 */

const MCL_MAX_NODES = 300;

type Matrix = number[][];

function makeMatrix(n: number): Matrix {
  return Array.from({ length: n }, () => new Array<number>(n).fill(0));
}

function normalize(m: Matrix): Matrix {
  const n = m.length;
  const result = makeMatrix(n);
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += m[i]![j]!;
    if (sum === 0) continue;
    for (let i = 0; i < n; i++) result[i]![j] = m[i]![j]! / sum;
  }
  return result;
}

function expand(m: Matrix): Matrix {
  const n = m.length;
  const result = makeMatrix(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += m[i]![k]! * m[k]![j]!;
      result[i]![j] = s;
    }
  return result;
}

function inflate(m: Matrix, r: number): Matrix {
  const n = m.length;
  const result = makeMatrix(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      result[i]![j] = Math.pow(m[i]![j]!, r);
  return normalize(result);
}

function diff(a: Matrix, b: Matrix): number {
  let maxDiff = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a[i]!.length; j++)
      maxDiff = Math.max(maxDiff, Math.abs(a[i]![j]! - b[i]![j]!));
  return maxDiff;
}

// Раскраска по папке верхнего уровня — для больших графов
function clusterByFolder(nodeIds: string[]): Map<string, number> {
  const folderIndex = new Map<string, number>();
  const result = new Map<string, number>();
  for (const id of nodeIds) {
    const parts = id.split(/[\\/]/).filter(Boolean);
    // Берём первые 2 сегмента пути как ключ папки
    const folder = parts.slice(0, 2).join('/');
    if (!folderIndex.has(folder)) folderIndex.set(folder, folderIndex.size);
    result.set(id, folderIndex.get(folder)!);
  }
  return result;
}

export function runMCL(
  nodeIds: string[],
  edges: Array<{ source: string; target: string }>,
  inflation = 2,
  iterations = 12,
): Map<string, number> {
  const n = nodeIds.length;
  if (n === 0) return new Map();

  // Для больших графов — быстрая раскраска по папкам
  if (n > MCL_MAX_NODES) {
    return clusterByFolder(nodeIds);
  }

  const idx = new Map<string, number>();
  nodeIds.forEach((id, i) => idx.set(id, i));

  let m = makeMatrix(n);
  for (let i = 0; i < n; i++) m[i]![i] = 1;
  for (const e of edges) {
    const s = idx.get(e.source);
    const t = idx.get(e.target);
    if (s == null || t == null) continue;
    m[s]![t] = 1;
    m[t]![s] = 1;
  }

  m = normalize(m);

  for (let iter = 0; iter < iterations; iter++) {
    const prev = m.map((row) => [...row]);
    m = expand(m);
    m = inflate(m, inflation);
    if (diff(m, prev) < 1e-6) break;
  }

  const clusterOf = new Map<string, number>();
  const attractors: number[] = [];

  for (let i = 0; i < n; i++) {
    if ((m[i]![i] ?? 0) > 1e-6) attractors.push(i);
  }

  if (attractors.length === 0) {
    nodeIds.forEach((id) => clusterOf.set(id, 0));
    return clusterOf;
  }

  for (let j = 0; j < n; j++) {
    let bestCluster = 0;
    let bestVal = -1;
    for (let ai = 0; ai < attractors.length; ai++) {
      const val = m[attractors[ai]!]![j] ?? 0;
      if (val > bestVal) { bestVal = val; bestCluster = ai; }
    }
    clusterOf.set(nodeIds[j]!, bestCluster);
  }

  return clusterOf;
}

export const CLUSTER_COLORS = [
  '#8074A4', '#5B8DB8', '#6BAA75', '#C97B5A',
  '#B85C8A', '#7BB8A8', '#C4A04A', '#8A6BBE',
  '#5B9E8E', '#C46B6B', '#7A9E5B', '#A07BC4',
];

export function clusterColor(clusterId: number): string {
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length] ?? '#8074A4';
}