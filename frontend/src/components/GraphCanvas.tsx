import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { GraphData } from '../types/api';
import { runMCL, clusterColor } from '../utils/mcl';

type GraphNode = GraphData['nodes'][number] & d3.SimulationNodeDatum;
type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  value?: number;
} & d3.SimulationLinkDatum<GraphNode>;

export type LabelMode = 'all' | 'selected' | 'none';

interface GraphCanvasProps {
  data: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  labelMode?: LabelMode;
  nodeRadius?: number;
  cycleEdgeKeys?: ReadonlySet<string>;
  mclInflation?: number;
  mclIterations?: number;
  focusNodeId?: string | null;
  onZoomReady?: (zoomFn: (delta: number) => void) => void;
}

const INK   = '#3D325F';
const CYCLE = '#d64c4c';

function shortName(id: string): string {
  return id.split(/[\\/]/).pop() ?? id;
}

function getId(d: string | GraphNode): string {
  return typeof d === 'string' ? d : d.id;
}

export function GraphCanvas({
  data,
  selectedNodeId,
  onSelectNode,
  labelMode = 'selected',
  nodeRadius = 9,
  cycleEdgeKeys,
  mclInflation = 2,
  mclIterations = 12,
  focusNodeId,
  onZoomReady,
}: GraphCanvasProps) {
  const svgRef     = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const zoomBehRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef   = useRef<GraphNode[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const nodes = useMemo<GraphNode[]>(() => data.nodes.map((n) => ({ ...n })), [data.nodes]);
  const links = useMemo<GraphLink[]>(() => data.links.map((l) => ({ ...l })) as GraphLink[], [data.links]);

  const clusterMap = useMemo(() => {
    const nodeIds = data.nodes.map((n) => n.id);
    const edges = data.links.map((l) => ({ source: String(l.source), target: String(l.target) }));
    return runMCL(nodeIds, edges, mclInflation, mclIterations);
  }, [data, mclInflation, mclIterations]);

  const degreeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of data.nodes) map.set(n.id, 0);
    for (const l of data.links) {
      const s = String(l.source); const t = String(l.target);
      map.set(s, (map.get(s) ?? 0) + 1);
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const maxDegree = useMemo(() => Math.max(...degreeMap.values(), 1), [degreeMap]);

  const neighborSet = useMemo(() => {
    const target = selectedNodeId;
    if (!target) return new Set<string>();
    const set = new Set<string>([target]);
    for (const l of data.links) {
      const s = String(l.source); const t = String(l.target);
      if (s === target) set.add(t);
      if (t === target) set.add(s);
    }
    return set;
  }, [selectedNodeId, data.links]);

  const getRadius = (id: string) => {
    const deg = degreeMap.get(id) ?? 0;
    return nodeRadius + (deg / maxDegree) * nodeRadius * 1.5;
  };

  const getNodeColor = (id: string, selected: boolean) => {
    if (selected) return '#ffffff';
    return clusterColor(clusterMap.get(id) ?? 0) + '33';
  };
  const getNodeStroke = (id: string) => clusterColor(clusterMap.get(id) ?? 0);

  const getLabelOpacity = (d: GraphNode): number => {
    if (labelMode === 'none') return 0;
    if (labelMode === 'all') return 1;
    if (d.id === selectedNodeId) return 1;
    if (neighborSet.has(d.id)) return 0.9;
    return 0;
  };

  useEffect(() => {
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    if (!svgEl || !wrapperEl) return;

    const width  = Math.max(320, wrapperEl.clientWidth);
    const height = Math.max(320, wrapperEl.clientHeight);
    const n = nodes.length;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Маркер только для циклических рёбер
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arr-cycle').attr('viewBox', '0 0 10 10')
      .attr('refX', 9).attr('refY', 5)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M1 2L8 5L1 8')
      .attr('fill', 'none').attr('stroke', CYCLE)
      .attr('stroke-width', 1.8).attr('stroke-linecap', 'round');

    const zoomLayer  = svg.append('g');
    const linkLayer  = zoomLayer.append('g');
    const nodeLayer  = zoomLayer.append('g');
    const labelLayer = zoomLayer.append('g').style('pointer-events', 'none');

    // ── Параметры симуляции адаптируются к размеру ───────────────────────────
    // Для маленьких графов — классический force-directed
    // Для больших — сильнее расталкиваем, слабее притягиваем
    const isLarge = n > 100;
    const isVeryLarge = n > 250;

    const chargeStrength = isVeryLarge ? -800 : isLarge ? -500 : -300;
    const linkDistance   = isVeryLarge ? 90   : isLarge ? 60   : 45;
    const linkStrengthSame  = isLarge ? 0.5 : 0.8;
    const linkStrengthDiff  = isLarge ? 0.1 : 0.3;
    const collideRadius  = isVeryLarge ? 14  : isLarge ? 10   : 8;

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        .distance((d) => {
          const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
          const same = clusterMap.get(s) === clusterMap.get(t);
          return same ? linkDistance * 0.6 : linkDistance;
        })
        .strength((d) => {
          const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
          return clusterMap.get(s) === clusterMap.get(t) ? linkStrengthSame : linkStrengthDiff;
        }))
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(isLarge ? 400 : 300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>((d) => getRadius(d.id) + collideRadius));

    sim.on('tick.positions', () => { nodesRef.current = nodes; });

    // ── Рёбра ────────────────────────────────────────────────────────────────
    const linkSel = linkLayer.selectAll<SVGLineElement, GraphLink>('line').data(links).join('line')
      .attr('stroke-width', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        if (cycleEdgeKeys?.has(`${s}→${t}`)) return 2;
        return clusterMap.get(s) === clusterMap.get(t) ? 1.2 : 0.7;
      })
      .attr('stroke', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        if (cycleEdgeKeys?.has(`${s}→${t}`)) return CYCLE;
        if (clusterMap.get(s) === clusterMap.get(t)) return clusterColor(clusterMap.get(s) ?? 0);
        return INK;
      })
      .attr('stroke-opacity', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        if (cycleEdgeKeys?.has(`${s}→${t}`)) return 0.85;
        return clusterMap.get(s) === clusterMap.get(t) ? 0.35 : 0.12;
      })
      .attr('marker-end', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        return cycleEdgeKeys?.has(`${s}→${t}`) ? 'url(#arr-cycle)' : null;
      });

    // ── Узлы ─────────────────────────────────────────────────────────────────
    const nodeSel = nodeLayer.selectAll<SVGCircleElement, GraphNode>('circle').data(nodes).join('circle')
      .attr('r', (d) => getRadius(d.id))
      .attr('fill', (d) => getNodeColor(d.id, d.id === selectedNodeId))
      .attr('stroke', (d) => getNodeStroke(d.id))
      .attr('stroke-width', (d) => d.id === selectedNodeId ? 3 : 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect) setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 12, text: d.id });
        linkSel
          .attr('stroke-opacity', (l) => {
            const s = getId(l.source as GraphNode); const t = getId(l.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return 0.85;
            return (s === d.id || t === d.id) ? 0.8 : 0.03;
          })
          .attr('stroke', (l) => {
            const s = getId(l.source as GraphNode); const t = getId(l.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return CYCLE;
            if (s === d.id || t === d.id) return clusterColor(clusterMap.get(d.id) ?? 0);
            return INK;
          });
      })
      .on('mousemove', function(event) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect) setTooltip((prev) =>
          prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top - 12 } : null);
      })
      .on('mouseleave', function() {
        setTooltip(null);
        linkSel
          .attr('stroke-opacity', (d) => {
            const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return 0.85;
            return clusterMap.get(s) === clusterMap.get(t) ? 0.35 : 0.12;
          })
          .attr('stroke', (d) => {
            const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return CYCLE;
            if (clusterMap.get(s) === clusterMap.get(t)) return clusterColor(clusterMap.get(s) ?? 0);
            return INK;
          });
      })
      .on('click', (_, d) => onSelectNode(d.id))
      .call(d3.drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // ── Подписи ───────────────────────────────────────────────────────────────
    const labelSel = labelLayer.selectAll<SVGTextElement, GraphNode>('text').data(nodes).join('text')
      .text((d) => shortName(d.id))
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('fill', (d) => clusterColor(clusterMap.get(d.id) ?? 0))
      .attr('stroke', 'rgba(255,250,235,0.92)')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('dx', (d) => getRadius(d.id) + 3)
      .attr('dy', 4)
      .attr('opacity', (d) => getLabelOpacity(d));

    // ── Зум ───────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 6])
      .on('zoom', (event) => zoomLayer.attr('transform', event.transform.toString()));
    svg.call(zoom as unknown as (sel: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);
    zoomBehRef.current = zoom;

    if (onZoomReady) {
      onZoomReady((delta: number) => {
        svg.transition().duration(250).call(
          (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).scaleBy, delta,
        );
      });
    }

    // ── Тик ───────────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      nodeSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      labelSel.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
    });

    const ro = new ResizeObserver(() => {
      const w = Math.max(320, wrapperEl.clientWidth);
      const h = Math.max(320, wrapperEl.clientHeight);
      svg.attr('viewBox', `0 0 ${w} ${h}`);
      sim.force('center', d3.forceCenter(w / 2, h / 2));
      sim.alpha(0.3).restart();
    });
    ro.observe(wrapperEl);
    return () => { ro.disconnect(); sim.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, nodes, cycleEdgeKeys, nodeRadius, clusterMap]);

  // ── Обновляем выделение без перезапуска симуляции ─────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    d3.select(svgEl).selectAll<SVGCircleElement, GraphNode>('circle')
      .attr('fill', (d) => getNodeColor(d.id, d.id === selectedNodeId))
      .attr('stroke', (d) => getNodeStroke(d.id))
      .attr('stroke-width', (d) => d.id === selectedNodeId ? 3 : 1.5);

    d3.select(svgEl).selectAll<SVGTextElement, GraphNode>('text')
      .attr('opacity', (d) => getLabelOpacity(d))
      .attr('font-weight', (d) => d.id === selectedNodeId ? 800 : 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, neighborSet, labelMode]);

  // ── Телепортация к узлу ───────────────────────────────────────────────────
  useEffect(() => {
    if (!focusNodeId) return;
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    const zoom = zoomBehRef.current;
    if (!svgEl || !wrapperEl || !zoom) return;

    const tryZoom = (nx: number, ny: number) => {
      const W = wrapperEl.clientWidth; const H = wrapperEl.clientHeight;
      d3.select(svgEl).transition().duration(600).call(
        (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
        d3.zoomIdentity.translate(W / 2 - nx * 1.8, H / 2 - ny * 1.8).scale(1.8),
      );
    };

    const node = nodesRef.current.find((n) => n.id === focusNodeId);
    if (node?.x != null && node?.y != null) {
      tryZoom(node.x, node.y);
    } else {
      const timer = setTimeout(() => {
        const n2 = nodesRef.current.find((n) => n.id === focusNodeId);
        if (n2?.x != null && n2?.y != null) tryZoom(n2.x, n2.y);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [focusNodeId]);

  return (
    <div className="graph-canvas" ref={wrapperRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y,
          background: 'rgba(255,250,235,0.96)', border: '1.5px solid rgba(61,50,95,0.25)',
          borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: INK,
          pointerEvents: 'none', whiteSpace: 'nowrap', maxWidth: 400,
          overflow: 'hidden', textOverflow: 'ellipsis',
          boxShadow: '0 4px 14px rgba(61,50,95,0.1)', zIndex: 10,
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}