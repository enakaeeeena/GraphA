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

interface GraphCanvasProps {
  data: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  showLabels?: boolean;
  nodeRadius?: number;
  cycleEdgeKeys?: ReadonlySet<string>;
  mclInflation?: number;
  mclIterations?: number;
  focusNodeId?: string | null;          // телепортация к узлу
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
  showLabels = true,
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
  const nodesRef   = useRef<GraphNode[]>([]);   // живые позиции узлов из симуляции
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

  // ── Основной useEffect — строим граф ──────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    if (!svgEl || !wrapperEl) return;

    const width  = Math.max(320, wrapperEl.clientWidth);
    const height = Math.max(320, wrapperEl.clientHeight);

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const defs = svg.append('defs');
    const makeArrow = (id: string, color: string, opacity = 1) => {
      defs.append('marker')
        .attr('id', id).attr('viewBox', '0 0 10 10')
        .attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M1 2L8 5L1 8')
        .attr('fill', 'none').attr('stroke', color)
        .attr('stroke-opacity', opacity)
        .attr('stroke-width', 1.8).attr('stroke-linecap', 'round');
    };
    makeArrow('arr-normal', INK, 0.4);
    makeArrow('arr-cycle', CYCLE);
    makeArrow('arr-hover', INK, 0.9);

    const zoomLayer  = svg.append('g');
    const linkLayer  = zoomLayer.append('g');
    const nodeLayer  = zoomLayer.append('g');
    const labelLayer = zoomLayer.append('g').style('pointer-events', 'none');

    // ── Симуляция ────────────────────────────────────────────────────────────
    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        .distance((d) => {
          const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
          const same = clusterMap.get(s) === clusterMap.get(t);
          return same ? 40 + getRadius(s) + getRadius(t) : 90 + getRadius(s) + getRadius(t);
        })
        .strength((d) => {
          const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
          return clusterMap.get(s) === clusterMap.get(t) ? 0.8 : 0.3;
        }))
      .force('charge', d3.forceManyBody().strength(-320))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<GraphNode>((d) => getRadius(d.id) + 8));

    // Обновляем живые позиции в ref на каждом тике
    sim.on('tick.positions', () => { nodesRef.current = nodes; });

    // ── Рёбра ────────────────────────────────────────────────────────────────
    const linkSel = linkLayer.selectAll<SVGLineElement, GraphLink>('line').data(links).join('line')
      .attr('stroke-width', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        if (cycleEdgeKeys?.has(`${s}→${t}`)) return 2;
        return clusterMap.get(s) === clusterMap.get(t) ? 1.5 : 0.9;
      })
      .attr('stroke', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        if (cycleEdgeKeys?.has(`${s}→${t}`)) return CYCLE;
        if (clusterMap.get(s) === clusterMap.get(t)) return clusterColor(clusterMap.get(s) ?? 0);
        return INK;
      })
      .attr('stroke-opacity', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        if (cycleEdgeKeys?.has(`${s}→${t}`)) return 0.9;
        return clusterMap.get(s) === clusterMap.get(t) ? 0.45 : 0.18;
      })
      .attr('marker-end', (d) => {
        const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
        return cycleEdgeKeys?.has(`${s}→${t}`) ? 'url(#arr-cycle)' : 'url(#arr-normal)';
      });

    // ── Узлы ─────────────────────────────────────────────────────────────────
    const nodeSel = nodeLayer.selectAll<SVGCircleElement, GraphNode>('circle').data(nodes).join('circle')
      .attr('r', (d) => getRadius(d.id))
      .attr('fill', (d) => getNodeColor(d.id, d.id === selectedNodeId))
      .attr('stroke', (d) => getNodeStroke(d.id))
      .attr('stroke-width', (d) => d.id === selectedNodeId ? 3 : 1.8)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event, d) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect) setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 12, text: d.id });
        linkSel
          .attr('stroke-opacity', (l) => {
            const s = getId(l.source as GraphNode); const t = getId(l.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return 0.9;
            return (s === d.id || t === d.id) ? 0.9 : 0.04;
          })
          .attr('stroke', (l) => {
            const s = getId(l.source as GraphNode); const t = getId(l.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return CYCLE;
            if (s === d.id || t === d.id) return clusterColor(clusterMap.get(d.id) ?? 0);
            return INK;
          })
          .attr('marker-end', (l) => {
            const s = getId(l.source as GraphNode); const t = getId(l.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return 'url(#arr-cycle)';
            return (s === d.id || t === d.id) ? 'url(#arr-hover)' : 'url(#arr-normal)';
          });
      })
      .on('mousemove', function(event) {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect) setTooltip((prev) => prev
          ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top - 12 }
          : null);
      })
      .on('mouseleave', function() {
        setTooltip(null);
        linkSel
          .attr('stroke-opacity', (d) => {
            const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return 0.9;
            return clusterMap.get(s) === clusterMap.get(t) ? 0.45 : 0.18;
          })
          .attr('stroke', (d) => {
            const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
            if (cycleEdgeKeys?.has(`${s}→${t}`)) return CYCLE;
            if (clusterMap.get(s) === clusterMap.get(t)) return clusterColor(clusterMap.get(s) ?? 0);
            return INK;
          })
          .attr('marker-end', (d) => {
            const s = getId(d.source as GraphNode); const t = getId(d.target as GraphNode);
            return cycleEdgeKeys?.has(`${s}→${t}`) ? 'url(#arr-cycle)' : 'url(#arr-normal)';
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
      .attr('dy', 4);

    // ── Зум ───────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on('zoom', (event) => zoomLayer.attr('transform', event.transform.toString()));
    svg.call(zoom as unknown as (sel: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);
    zoomBehRef.current = zoom;

    if (onZoomReady) {
      onZoomReady((delta: number) => {
        svg.transition().duration(250).call(
          (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).scaleBy,
          delta,
        );
      });
    }

    // ── Тик ───────────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => { const s = d.source as GraphNode; const t = d.target as GraphNode; const dx=(t.x??0)-(s.x??0); const dy=(t.y??0)-(s.y??0); const dist=Math.sqrt(dx*dx+dy*dy)||1; return (s.x??0)+(dx/dist)*getRadius(s.id); })
        .attr('y1', (d) => { const s = d.source as GraphNode; const t = d.target as GraphNode; const dx=(t.x??0)-(s.x??0); const dy=(t.y??0)-(s.y??0); const dist=Math.sqrt(dx*dx+dy*dy)||1; return (s.y??0)+(dy/dist)*getRadius(s.id); })
        .attr('x2', (d) => { const s = d.source as GraphNode; const t = d.target as GraphNode; const dx=(t.x??0)-(s.x??0); const dy=(t.y??0)-(s.y??0); const dist=Math.sqrt(dx*dx+dy*dy)||1; return (t.x??0)-(dx/dist)*(getRadius(t.id)+6); })
        .attr('y2', (d) => { const s = d.source as GraphNode; const t = d.target as GraphNode; const dx=(t.x??0)-(s.x??0); const dy=(t.y??0)-(s.y??0); const dist=Math.sqrt(dx*dx+dy*dy)||1; return (t.y??0)-(dy/dist)*(getRadius(t.id)+6); });

      nodeSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);

      labelSel
        .attr('x', (d) => d.x ?? 0)
        .attr('y', (d) => d.y ?? 0)
        .attr('opacity', (d) => {
          if (!showLabels) return 0;
          // До 40 узлов — показываем все
          if (nodes.length <= 40) return 1;
          // Выбранный и его соседи — всегда видны
          if (d.id === selectedNodeId) return 1;
          if (neighborSet.has(d.id)) return 0.9;
          return 0;
        });
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
  }, [links, nodes, cycleEdgeKeys, showLabels, nodeRadius, clusterMap]);

  // ── Обновляем выделение без перезапуска симуляции ─────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    d3.select(svgEl).selectAll<SVGCircleElement, GraphNode>('circle')
      .attr('fill', (d) => getNodeColor(d.id, d.id === selectedNodeId))
      .attr('stroke', (d) => getNodeStroke(d.id))
      .attr('stroke-width', (d) => d.id === selectedNodeId ? 3 : 1.8);

    d3.select(svgEl).selectAll<SVGTextElement, GraphNode>('text')
      .attr('opacity', (d) => {
        if (!showLabels) return 0;
        if (nodes.length <= 40) return 1;
        if (d.id === selectedNodeId) return 1;
        if (neighborSet.has(d.id)) return 0.9;
        return 0;
      })
      .attr('font-weight', (d) => d.id === selectedNodeId ? 800 : 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, neighborSet, showLabels, nodes.length]);

  // ── Телепортация к узлу при включении фокуса ─────────────────────────────
  useEffect(() => {
    if (!focusNodeId) return;
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    const zoom = zoomBehRef.current;
    if (!svgEl || !wrapperEl || !zoom) return;

    // Ищем узел в живых позициях (после симуляции)
    const node = nodesRef.current.find((n) => n.id === focusNodeId);
    if (!node || node.x == null || node.y == null) {
      // Симуляция ещё не установилась — пробуем через 800ms
      const timer = setTimeout(() => {
        const n2 = nodesRef.current.find((n) => n.id === focusNodeId);
        if (!n2 || n2.x == null || n2.y == null) return;
        const W = wrapperEl.clientWidth;
        const H = wrapperEl.clientHeight;
        const scale = 1.8;
        d3.select(svgEl).transition().duration(700).call(
          (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
          d3.zoomIdentity.translate(W / 2 - n2.x * scale, H / 2 - n2.y * scale).scale(scale),
        );
      }, 800);
      return () => clearTimeout(timer);
    }

    const W = wrapperEl.clientWidth;
    const H = wrapperEl.clientHeight;
    const scale = 1.8;
    d3.select(svgEl).transition().duration(600).call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
      d3.zoomIdentity.translate(W / 2 - node.x * scale, H / 2 - node.y * scale).scale(scale),
    );
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