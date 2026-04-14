import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import dagreLib from 'dagre';
import type { GraphData } from '../types/api';
import { clusterColor, runMCL } from '../utils/mcl';
import { GraphNavigator, type MiniCoords } from './GraphNavigator';

interface Props {
  data: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  cycleEdgeKeys?: ReadonlySet<string>;
  mclInflation?: number;
  mclIterations?: number;
}

const INK    = '#3D325F';
const CYCLE  = '#d64c4c';
const BG     = '#fffaeb';
const CARD_W = 176;
const CARD_H = 50;

function shortName(id: string) { return id.split(/[\\/]/).pop() ?? id; }
function dirName(id: string) {
  const parts = id.split(/[\\/]/); parts.pop();
  return parts.slice(-2).join('/');
}
function extOf(id: string) { return id.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? ''; }
function fileColor(ext: string) {
  if (ext === 'tsx' || ext === 'jsx') return '#8074A4';
  if (ext === 'ts') return '#6B7FD4';
  return '#9B8EC4';
}

const zoomBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid rgba(61,50,95,0.25)',
  background: 'rgba(255,250,235,0.92)',
  color: INK, cursor: 'pointer', fontSize: 20, fontWeight: 700,
  display: 'grid', placeItems: 'center',
  boxShadow: '0 2px 8px rgba(61,50,95,0.08)',
};

export function GraphCanvasHierarchical({
  data, selectedNodeId, onSelectNode, cycleEdgeKeys,
  mclInflation = 2, mclIterations = 12,
}: Props) {
  const svgRef     = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const zoomBehRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [currentScale, setCurrentScale] = useState(0.9);
  const [viewSize, setViewSize] = useState({ w: 800, h: 500 });
  const [layoutReady, setLayoutReady] = useState(false);

  const clusterMap = useMemo(() => {
    const nodeIds = data.nodes.map((n) => n.id);
    const edges = data.links.map((l) => ({ source: String(l.source), target: String(l.target) }));
    return runMCL(nodeIds, edges, mclInflation, mclIterations);
  }, [data, mclInflation, mclIterations]);

  const handleZoom = (delta: number) => {
    const svgEl = svgRef.current;
    const zoom = zoomBehRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(250).call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).scaleBy, delta,
    );
  };

  // renderMini — возвращает MiniCoords для синхронизации viewport
  const renderMini = useCallback((
    mini: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    W: number,
    H: number,
  ): MiniCoords => {
    const g2 = new dagreLib.graphlib.Graph();
    g2.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 50, marginx: 20, marginy: 20 });
    g2.setDefaultEdgeLabel(() => ({}));
    for (const n of data.nodes) g2.setNode(n.id, { width: CARD_W, height: CARD_H });
    for (const l of data.links) {
      const s = String(l.source); const t = String(l.target);
      if (s && t && s !== t) g2.setEdge(s, t);
    }
    try { dagreLib.layout(g2); } catch { return { fitSc: 1, ox: 0, oy: 0 }; }

    const gW = g2.graph().width ?? 1;
    const gH = g2.graph().height ?? 1;
    const fitSc = Math.min((W - 8) / gW, (H - 8) / gH) * 0.9;
    const ox = (W - gW * fitSc) / 2;
    const oy = (H - gH * fitSc) / 2;

    for (const e of g2.edges()) {
      const pts: Array<{ x: number; y: number }> = g2.edge(e)?.points ?? [];
      if (!pts.length) continue;
      const lf = d3.line<{ x: number; y: number }>()
        .x((d) => d.x * fitSc + ox).y((d) => d.y * fitSc + oy)
        .curve(d3.curveBasis);
      mini.append('path').attr('d', lf(pts) ?? '')
        .attr('fill', 'none').attr('stroke', INK)
        .attr('stroke-width', 0.5).attr('stroke-opacity', 0.25);
    }
    for (const nodeId of g2.nodes()) {
      const pos = g2.node(nodeId);
      if (!pos || pos.x == null) continue;
      mini.append('rect')
        .attr('x', (pos.x - CARD_W / 2) * fitSc + ox)
        .attr('y', (pos.y - CARD_H / 2) * fitSc + oy)
        .attr('width', CARD_W * fitSc).attr('height', CARD_H * fitSc).attr('rx', 2)
        .attr('fill', clusterColor(clusterMap.get(nodeId) ?? 0))
        .attr('opacity', nodeId === selectedNodeId ? 0.9 : 0.35);
    }

    return { fitSc, ox, oy };
  }, [data, clusterMap, selectedNodeId]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    if (!svgEl || !wrapperEl) return;

    const W = Math.max(600, wrapperEl.clientWidth);
    const H = Math.max(400, wrapperEl.clientHeight);
    setViewSize({ w: W, h: H });

    const g = new dagreLib.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 60, marginx: 40, marginy: 40 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of data.nodes) g.setNode(n.id, { width: CARD_W, height: CARD_H });
    for (const l of data.links) {
      const s = String(l.source); const t = String(l.target);
      if (s && t && s !== t) g.setEdge(s, t);
    }
    try { dagreLib.layout(g); } catch (e) { console.error('dagre error', e); return; }

    const graphW = g.graph().width ?? W;
    const graphH = g.graph().height ?? H;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const defs = svg.append('defs');
    const makeArrow = (id: string, color: string) =>
      defs.append('marker')
        .attr('id', id).attr('viewBox', '0 0 10 10')
        .attr('refX', 8).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M1 2L8 5L1 8')
        .attr('fill', 'none').attr('stroke', color)
        .attr('stroke-width', 1.6).attr('stroke-linecap', 'round');
    makeArrow('h-arr', INK);
    makeArrow('h-arr-c', CYCLE);

    const filt = defs.append('filter').attr('id', 'cshadow')
      .attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    filt.append('feDropShadow').attr('dx', 0).attr('dy', 2).attr('stdDeviation', 3)
      .attr('flood-color', 'rgba(61,50,95,0.09)');

    const zoomLayer = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform.toString());
        setCurrentScale(event.transform.k);
      });
    svg.call(zoom as unknown as (sel: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);
    zoomBehRef.current = zoom;

    const sc0 = Math.min(0.9, (W * 0.9) / graphW, (H * 0.9) / graphH);
    svg.call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
      d3.zoomIdentity.translate((W - graphW * sc0) / 2, (H - graphH * sc0) / 2).scale(sc0),
    );
    setCurrentScale(sc0);

    const linkLayer = zoomLayer.append('g');
    for (const e of g.edges()) {
      const pts: Array<{ x: number; y: number }> = g.edge(e)?.points ?? [];
      if (!pts.length) continue;
      const isCycle = cycleEdgeKeys?.has(`${e.v}→${e.w}`) ?? false;
      const lf = d3.line<{ x: number; y: number }>().x((d) => d.x).y((d) => d.y).curve(d3.curveBasis);
      linkLayer.append('path').attr('d', lf(pts) ?? '')
        .attr('fill', 'none')
        .attr('stroke', isCycle ? CYCLE : INK)
        .attr('stroke-width', isCycle ? 2 : 1)
        .attr('stroke-opacity', isCycle ? 0.85 : 0.25)
        .attr('marker-end', `url(#${isCycle ? 'h-arr-c' : 'h-arr'})`);
    }

    const nodeLayer = zoomLayer.append('g');
    for (const nodeId of g.nodes()) {
      const pos = g.node(nodeId);
      if (!pos || pos.x == null) continue;

      const x = pos.x - CARD_W / 2;
      const y = pos.y - CARD_H / 2;
      const isSel = nodeId === selectedNodeId;
      const color = clusterColor(clusterMap.get(nodeId) ?? 0);
      const ext = extOf(nodeId);
      const iconColor = fileColor(ext);
      const name = shortName(nodeId);
      const dir  = dirName(nodeId);

      const cg = nodeLayer.append('g')
        .attr('transform', `translate(${x},${y})`)
        .style('cursor', 'pointer')
        .on('click', () => onSelectNode(nodeId))
        .on('mouseenter', function(event) {
          const rect = wrapperEl.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left + 12, y: event.clientY - rect.top - 12, text: nodeId });
          d3.select(this).select('rect.cbg').attr('stroke-width', 2).attr('stroke', color);
        })
        .on('mouseleave', function() {
          setTooltip(null);
          d3.select(this).select('rect.cbg')
            .attr('stroke-width', isSel ? 2 : 1)
            .attr('stroke', isSel ? color : `${color}55`);
        });

      cg.append('rect').attr('class', 'cbg')
        .attr('width', CARD_W).attr('height', CARD_H).attr('rx', 10)
        .attr('fill', isSel ? `${color}18` : 'rgba(255,255,255,0.93)')
        .attr('stroke', isSel ? color : `${color}55`)
        .attr('stroke-width', isSel ? 2 : 1)
        .attr('filter', 'url(#cshadow)');

      cg.append('rect').attr('width', 4).attr('height', CARD_H).attr('rx', 2)
        .attr('fill', color).attr('opacity', 0.65);

      cg.append('rect').attr('x', 12).attr('y', 10)
        .attr('width', 13).attr('height', 16).attr('rx', 2)
        .attr('fill', iconColor).attr('opacity', 0.85);
      cg.append('polyline').attr('points', '21,10 21,15 26,15')
        .attr('fill', 'none').attr('stroke', 'rgba(255,255,255,0.55)').attr('stroke-width', 1);

      cg.append('text').attr('x', 34).attr('y', 20)
        .attr('font-size', 11.5).attr('font-weight', isSel ? 800 : 700)
        .attr('fill', INK).attr('dominant-baseline', 'middle')
        .text(name.length > 19 ? name.slice(0, 17) + '…' : name);

      cg.append('text').attr('x', 34).attr('y', 35)
        .attr('font-size', 9).attr('font-weight', 500)
        .attr('fill', color).attr('opacity', 0.7).attr('dominant-baseline', 'middle')
        .text(dir.length > 24 ? dir.slice(0, 22) + '…' : dir);
    }

    setLayoutReady(true);

    const ro = new ResizeObserver(() => {
      const w = Math.max(600, wrapperEl.clientWidth);
      const h = Math.max(400, wrapperEl.clientHeight);
      svg.attr('viewBox', `0 0 ${w} ${h}`);
      setViewSize({ w, h });
    });
    ro.observe(wrapperEl);
    return () => { ro.disconnect(); setLayoutReady(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cycleEdgeKeys, clusterMap]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', background: BG }} />

      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
        <button type="button" style={zoomBtnStyle} onClick={() => handleZoom(1.3)}>+</button>
        <button type="button" style={zoomBtnStyle} onClick={() => handleZoom(0.77)}>−</button>
      </div>

      {layoutReady && (
        <GraphNavigator
          svgRef={svgRef as React.RefObject<SVGSVGElement>}
          zoomRef={zoomBehRef as React.RefObject<d3.ZoomBehavior<SVGSVGElement, unknown>>}
          currentScale={currentScale}
          minScale={0.05}
          maxScale={5}
          renderMini={renderMini}
          viewW={viewSize.w}
          viewH={viewSize.h}
        />
      )}

      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y,
          background: 'rgba(255,250,235,0.96)', border: '1.5px solid rgba(61,50,95,0.22)',
          borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: INK,
          pointerEvents: 'none', whiteSpace: 'nowrap', maxWidth: 420,
          overflow: 'hidden', textOverflow: 'ellipsis',
          boxShadow: '0 4px 14px rgba(61,50,95,0.09)', zIndex: 10,
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}