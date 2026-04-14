import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
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

const INK   = '#3D325F';
const CYCLE = '#d64c4c';
const BG    = '#fffaeb';

// Радиусы колец в пикселях
const RING_R = [0, 180, 340, 480, 600];

function shortName(id: string) { return id.split(/[\\/]/).pop() ?? id; }

const zoomBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid rgba(61,50,95,0.25)',
  background: 'rgba(255,250,235,0.92)',
  color: INK, cursor: 'pointer', fontSize: 20, fontWeight: 700,
  display: 'grid', placeItems: 'center',
  boxShadow: '0 2px 8px rgba(61,50,95,0.08)',
};

export function GraphCanvasRadial({
  data, selectedNodeId, onSelectNode, cycleEdgeKeys,
  mclInflation = 2, mclIterations = 12,
}: Props) {
  const svgRef     = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const zoomBehRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [currentScale, setCurrentScale] = useState(1);
  const [viewSize, setViewSize] = useState({ w: 800, h: 600 });
  const [layoutReady, setLayoutReady] = useState(false);

  const clusterMap = useMemo(() => {
    const nodeIds = data.nodes.map((n) => n.id);
    const edges = data.links.map((l) => ({ source: String(l.source), target: String(l.target) }));
    return runMCL(nodeIds, edges, mclInflation, mclIterations);
  }, [data, mclInflation, mclIterations]);

  const links = useMemo(() =>
    data.links.map((l) => ({ source: String(l.source), target: String(l.target) })),
    [data.links]);

  // Степень каждого узла
  const degreeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of data.nodes) map.set(n.id, 0);
    for (const l of links) {
      map.set(l.source, (map.get(l.source) ?? 0) + 1);
      map.set(l.target, (map.get(l.target) ?? 0) + 1);
    }
    return map;
  }, [data.nodes, links]);

  const maxDegree = useMemo(() => Math.max(...degreeMap.values(), 1), [degreeMap]);

  // Центр — самый связанный узел (фиксированно)
  const centerId = useMemo(() => {
    let best = data.nodes[0]?.id ?? '';
    let bestDeg = 0;
    for (const [id, d] of degreeMap) {
      if (d > bestDeg) { bestDeg = d; best = id; }
    }
    return best;
  }, [data.nodes, degreeMap]);

  // Раскладываем все узлы по кольцам по убыванию степени
  const ringLayout = useMemo(() => {
    // Сортируем по степени убывания
    const sorted = [...data.nodes]
      .sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0));

    // Центр — самый связанный
    const ringMap = new Map<string, number>();
    const positions = new Map<string, { x: number; y: number }>();

    ringMap.set(centerId, 0);
    positions.set(centerId, { x: 0, y: 0 });

    const rest = sorted.filter((n) => n.id !== centerId);

    // Распределяем по кольцам равномерно
    // Количество узлов на каждом кольце зависит от его длины окружности
    const ringCapacity = RING_R.slice(1).map((r) => Math.max(6, Math.floor(2 * Math.PI * r / 90)));
    let idx = 0;

    for (let ring = 0; ring < RING_R.length - 1; ring++) {
      const cap = ringCapacity[ring]!;
      const r   = RING_R[ring + 1]!;
      const slice = rest.slice(idx, idx + cap);
      if (!slice.length) break;
      idx += slice.length;

      slice.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / slice.length - Math.PI / 2;
        ringMap.set(n.id, ring + 1);
        positions.set(n.id, {
          x: r * Math.cos(angle),
          y: r * Math.sin(angle),
        });
      });

      if (idx >= rest.length) break;
    }

    // Узлы которые не поместились — скрываем (слишком много)
    return { ringMap, positions };
  }, [data.nodes, degreeMap, centerId]);

  const nodeRadius = (id: string) => {
    const deg = degreeMap.get(id) ?? 0;
    return 7 + (deg / maxDegree) * 8;
  };

  const renderMini = useCallback((
    mini: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    W: number,
    H: number,
  ): MiniCoords => {
    const maxR = RING_R[RING_R.length - 1]!;
    const fitSc = Math.min(W, H) / (maxR * 2 + 40) * 0.88;
    const ox = W / 2;
    const oy = H / 2;

    // Рёбра
    for (const l of links) {
      const sp = ringLayout.positions.get(l.source);
      const tp = ringLayout.positions.get(l.target);
      if (!sp || !tp) continue;
      mini.append('line')
        .attr('x1', sp.x * fitSc + ox).attr('y1', sp.y * fitSc + oy)
        .attr('x2', tp.x * fitSc + ox).attr('y2', tp.y * fitSc + oy)
        .attr('stroke', INK).attr('stroke-width', 0.3).attr('stroke-opacity', 0.18);
    }

    // Узлы
    for (const [id, pos] of ringLayout.positions) {
      mini.append('circle')
        .attr('cx', pos.x * fitSc + ox).attr('cy', pos.y * fitSc + oy)
        .attr('r', id === centerId ? 5 : 2.5)
        .attr('fill', clusterColor(clusterMap.get(id) ?? 0))
        .attr('opacity', id === centerId ? 1 : 0.55);
    }

    return { fitSc, ox, oy };
  }, [links, ringLayout, clusterMap, centerId]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    if (!svgEl || !wrapperEl) return;

    const W = Math.max(600, wrapperEl.clientWidth);
    const H = Math.max(400, wrapperEl.clientHeight);
    setViewSize({ w: W, h: H });
    setLayoutReady(false);

    const cx = W / 2;
    const cy = H / 2;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    // Маркеры стрелок
    const defs = svg.append('defs');
    const makeArrow = (id: string, color: string, op = 0.5) =>
      defs.append('marker')
        .attr('id', id).attr('viewBox', '0 0 10 10')
        .attr('refX', 9).attr('refY', 5)
        .attr('markerWidth', 5).attr('markerHeight', 5)
        .attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M1 2L8 5L1 8')
        .attr('fill', 'none').attr('stroke', color)
        .attr('stroke-opacity', op)
        .attr('stroke-width', 1.6).attr('stroke-linecap', 'round');
    makeArrow('ra-normal', INK, 0.45);
    makeArrow('ra-cycle', CYCLE, 1);
    makeArrow('ra-accent', '#8074A4', 0.85);

    const zoomLayer = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 5])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform.toString());
        setCurrentScale(event.transform.k);
      });
    svg.call(zoom as unknown as (sel: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);
    zoomBehRef.current = zoom;

    // Начальный масштаб — виден весь граф
    const usedRings = Math.max(...[...ringLayout.ringMap.values()]);
    const outerR = RING_R[Math.min(usedRings, RING_R.length - 1)]!;
    const sc0 = Math.min(1, (Math.min(W, H) * 0.82) / (outerR * 2 + 60));
    svg.call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
      d3.zoomIdentity.translate(W / 2 * (1 - sc0), H / 2 * (1 - sc0)).scale(sc0),
    );
    setCurrentScale(sc0);

    // Пунктирные кольца
    const ringLayer = zoomLayer.append('g');
    for (let i = 1; i <= usedRings && i < RING_R.length; i++) {
      ringLayer.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', RING_R[i])
        .attr('fill', 'none')
        .attr('stroke', 'rgba(61,50,95,0.07)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5');
    }

    // Рёбра
    const linkLayer = zoomLayer.append('g');
    for (const l of links) {
      const sp = ringLayout.positions.get(l.source);
      const tp = ringLayout.positions.get(l.target);
      if (!sp || !tp) continue;

      const isCycle = cycleEdgeKeys?.has(`${l.source}→${l.target}`) ?? false;
      const isToCenter = l.source === centerId || l.target === centerId;

      const sx = sp.x + cx; const sy = sp.y + cy;
      const tx = tp.x + cx; const ty = tp.y + cy;

      // Смещаем концы линии к краю узла
      const dx = tx - sx; const dy = ty - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const rs = nodeRadius(l.source); const rt = nodeRadius(l.target);
      const x1 = sx + (dx / dist) * rs;
      const y1 = sy + (dy / dist) * rs;
      const x2 = tx - (dx / dist) * (rt + 5);
      const y2 = ty - (dy / dist) * (rt + 5);

      linkLayer.append('line')
        .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
        .attr('stroke', isCycle ? CYCLE : isToCenter ? '#8074A4' : INK)
        .attr('stroke-width', isCycle ? 2 : isToCenter ? 1.4 : 0.8)
        .attr('stroke-opacity', isCycle ? 0.9 : isToCenter ? 0.5 : 0.18)
        .attr('marker-end', `url(#${isCycle ? 'ra-cycle' : isToCenter ? 'ra-accent' : 'ra-normal'})`);
    }

    // Узлы и подписи
    const nodeLayer  = zoomLayer.append('g');
    const labelLayer = zoomLayer.append('g').style('pointer-events', 'none');

    for (const [nodeId, pos] of ringLayout.positions) {
      const x = pos.x + cx;
      const y = pos.y + cy;
      const isSel = nodeId === selectedNodeId;
      const isCenter = nodeId === centerId;
      const color = clusterColor(clusterMap.get(nodeId) ?? 0);
      const r = nodeRadius(nodeId);

      nodeLayer.append('circle')
        .attr('cx', x).attr('cy', y).attr('r', r)
        .attr('fill', isSel ? '#fff' : color + '33')
        .attr('stroke', color)
        .attr('stroke-width', isSel ? 3 : isCenter ? 2.5 : 1.6)
        .style('cursor', 'pointer')
        .on('click', () => onSelectNode(nodeId))
        .on('mouseenter', function(event) {
          const rect = wrapperEl.getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left + 12, y: event.clientY - rect.top - 12, text: nodeId });
          d3.select(this).attr('stroke-width', 3);
        })
        .on('mouseleave', function() {
          setTooltip(null);
          d3.select(this).attr('stroke-width', isSel ? 3 : isCenter ? 2.5 : 1.6);
        });

      // Подпись
      const deg = degreeMap.get(nodeId) ?? 0;
      const showLabel = isCenter || isSel || deg > maxDegree * 0.3;

      labelLayer.append('text')
        .attr('x', x).attr('y', y - r - 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', isCenter ? 12 : isSel ? 11 : 9.5)
        .attr('font-weight', isCenter || isSel ? 800 : 600)
        .attr('fill', color)
        .attr('stroke', 'rgba(255,250,235,0.9)')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .attr('opacity', showLabel ? 1 : 0)
        .text(shortName(nodeId));
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
  }, [data, cycleEdgeKeys, clusterMap, centerId, links, ringLayout]);

  // Обновляем выделение без перерисовки
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    d3.select(svgEl).selectAll<SVGCircleElement, { id: string }>('circle[data-id]')
      .attr('fill', function() {
        const id = this.getAttribute('data-id') ?? '';
        return id === selectedNodeId ? '#fff' : clusterColor(clusterMap.get(id) ?? 0) + '33';
      });
  }, [selectedNodeId, clusterMap]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', background: BG }} />

      {/* Кнопки зума */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
        <button type="button" style={zoomBtnStyle} onClick={() => handleZoom(1.3)}>+</button>
        <button type="button" style={zoomBtnStyle} onClick={() => handleZoom(0.77)}>−</button>
      </div>

      {/* Подпись центра */}
      {centerId && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,250,235,0.92)', border: '1.5px solid rgba(61,50,95,0.18)',
          borderRadius: 999, padding: '4px 14px',
          fontSize: 11, fontWeight: 800, color: INK,
          opacity: 0.65, pointerEvents: 'none', whiteSpace: 'nowrap',
          boxShadow: '0 2px 6px rgba(61,50,95,0.07)',
        }}>
          ◎ {shortName(centerId)} · {degreeMap.get(centerId) ?? 0} связей
        </div>
      )}

      {/* Навигатор */}
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

      {/* Tooltip */}
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

  function handleZoom(delta: number) {
    const svgEl = svgRef.current;
    const zoom = zoomBehRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(250).call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).scaleBy, delta,
    );
  }
}