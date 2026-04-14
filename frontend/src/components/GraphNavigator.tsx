import { useRef, useState, useEffect, useCallback } from 'react';
import * as d3 from 'd3';

const INK    = '#3D325F';
const ACCENT = '#8074A4';

export interface MiniCoords {
  fitSc: number;
  ox: number;
  oy: number;
}

interface GraphNavigatorProps {
  svgRef:   React.RefObject<SVGSVGElement>;
  zoomRef:  React.RefObject<d3.ZoomBehavior<SVGSVGElement, unknown>>;
  currentScale: number;
  minScale?: number;
  maxScale?: number;
  renderMini: (
    miniSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    W: number,
    H: number,
  ) => MiniCoords;
  viewW: number;
  viewH: number;
}

export function GraphNavigator({
  svgRef, zoomRef, currentScale,
  minScale = 0.05, maxScale = 5,
  renderMini, viewW, viewH,
}: GraphNavigatorProps) {
  const miniSvgRef  = useRef<SVGSVGElement | null>(null);
  const coordsRef   = useRef<MiniCoords>({ fitSc: 1, ox: 0, oy: 0 });
  const viewWRef    = useRef(viewW);
  const viewHRef    = useRef(viewH);

  const [hidden, setHidden] = useState(false);
  const [miniW,  setMiniW]  = useState(220);
  const [miniH,  setMiniH]  = useState(140);

  // Держим актуальные размеры в ref чтобы избежать stale closure
  useEffect(() => { viewWRef.current = viewW; }, [viewW]);
  useEffect(() => { viewHRef.current = viewH; }, [viewH]);

  // ── drawViewport объявляем ПЕРВОЙ ──────────────────────────────────────────
  const drawViewport = useCallback((transform: d3.ZoomTransform, coords: MiniCoords) => {
    const el = miniSvgRef.current;
    if (!el) return;
    const { fitSc, ox, oy } = coords;
    const W = viewWRef.current;
    const H = viewHRef.current;
    const mini = d3.select(el);
    mini.select('.mvp').remove();

    const visX = -transform.x / transform.k;
    const visY = -transform.y / transform.k;
    const visW = W / transform.k;
    const visH = H / transform.k;

    mini.append('rect').attr('class', 'mvp')
      .attr('x', visX * fitSc + ox)
      .attr('y', visY * fitSc + oy)
      .attr('width', Math.max(4, visW * fitSc))
      .attr('height', Math.max(4, visH * fitSc))
      .attr('fill', 'rgba(128,116,164,0.13)')
      .attr('stroke', ACCENT).attr('stroke-width', 1.5).attr('rx', 3)
      .style('pointer-events', 'none');
  }, []); // стабильная функция — читает из ref

  // ── updateViewport использует drawViewport ─────────────────────────────────
  const updateViewport = useCallback((transform: d3.ZoomTransform) => {
    drawViewport(transform, coordsRef.current);
  }, [drawViewport]);

  // ── Рендер мини-карты ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = miniSvgRef.current;
    if (!el || hidden) return;
    const mini = d3.select(el) as d3.Selection<SVGSVGElement, unknown, null, undefined>;
    mini.selectAll(':not(.mvp)').remove();
    const coords = renderMini(mini, miniW, miniH);
    coordsRef.current = coords;
    const svgEl = svgRef.current;
    if (svgEl) drawViewport(d3.zoomTransform(svgEl), coords);
  }, [renderMini, miniW, miniH, hidden, drawViewport]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Подписка на зум главного графа ────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current;
    const zoom  = zoomRef.current;
    if (!svgEl || !zoom) return;
    zoom.on('zoom.navigator', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      updateViewport(event.transform);
    });
    updateViewport(d3.zoomTransform(svgEl));
    return () => { zoom.on('zoom.navigator', null); };
  }, [svgRef, zoomRef, updateViewport]);

  // ── Клик → телепорт ────────────────────────────────────────────────────────
  const handleMiniClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgEl = svgRef.current;
    const zoom  = zoomRef.current;
    if (!svgEl || !zoom) return;
    const { fitSc, ox, oy } = coordsRef.current;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const gx = (e.clientX - rect.left - ox) / fitSc;
    const gy = (e.clientY - rect.top  - oy) / fitSc;
    const newTx = viewWRef.current / 2 - gx * currentScale;
    const newTy = viewHRef.current / 2 - gy * currentScale;
    d3.select(svgEl).transition().duration(350).call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
      d3.zoomIdentity.translate(newTx, newTy).scale(currentScale),
    );
  };

  // ── Слайдер ────────────────────────────────────────────────────────────────
  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const svgEl = svgRef.current;
    const zoom  = zoomRef.current;
    if (!svgEl || !zoom) return;
    const newScale = Number(e.target.value);
    const t = d3.zoomTransform(svgEl);
    const cx = viewWRef.current / 2;
    const cy = viewHRef.current / 2;
    d3.select(svgEl).transition().duration(120).call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).transform,
      d3.zoomIdentity
        .translate(cx - (cx - t.x) * (newScale / t.k), cy - (cy - t.y) * (newScale / t.k))
        .scale(newScale),
    );
  };

  // ── Колесо ─────────────────────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svgEl = svgRef.current;
    const zoom  = zoomRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(100).call(
      (zoom as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>).scaleBy,
      e.deltaY > 0 ? 0.85 : 1.18,
    );
  };

  // ── Ресайз за верхний левый угол ──────────────────────────────────────────
  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 220, h: 140 });
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    isResizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: miniW, h: miniH };
    const onMove = (me: MouseEvent) => {
      if (!isResizing.current) return;
      setMiniW(Math.max(140, resizeStart.current.w + resizeStart.current.x - me.clientX));
      setMiniH(Math.max(90,  resizeStart.current.h + resizeStart.current.y - me.clientY));
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(false)} style={{
        position: 'absolute', bottom: 16, right: 16, height: 28,
        borderRadius: 999, border: '1.5px solid rgba(61,50,95,0.22)',
        background: 'rgba(255,250,235,0.93)', color: INK,
        fontSize: 11, fontWeight: 800, padding: '0 12px',
        cursor: 'pointer', boxShadow: '0 2px 6px rgba(61,50,95,0.08)', zIndex: 20,
      }}>
        Навигатор ↗
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      background: 'rgba(255,250,235,0.96)',
      border: '1.5px solid rgba(61,50,95,0.18)',
      borderRadius: 12, boxShadow: '0 4px 18px rgba(61,50,95,0.11)',
      userSelect: 'none', zIndex: 20, width: miniW + 24,
    }}>
      {/* Ручка ресайза — верхний левый угол */}
      <div onMouseDown={onResizeMouseDown} style={{
        position: 'absolute', top: 0, left: 0, width: 18, height: 18,
        cursor: 'nw-resize', zIndex: 1, opacity: 0.35,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="9" x2="9" y2="1" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="5" x2="5" y2="1" stroke={INK} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Заголовок */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 4px 18px' }}>
        <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.45, color: INK }}>Навигатор</span>
        <button type="button" onClick={() => setHidden(true)} style={{
          border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 12, opacity: 0.4, padding: 0, color: INK, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Мини-карта */}
      <div style={{ padding: '0 10px' }}>
        <svg ref={miniSvgRef} width={miniW} height={miniH} viewBox={`0 0 ${miniW} ${miniH}`}
          style={{
            display: 'block', cursor: 'crosshair', borderRadius: 8,
            border: '1px solid rgba(61,50,95,0.1)',
            background: 'rgba(255,250,235,0.4)',
          }}
          onClick={handleMiniClick}
          onWheel={handleWheel}
        />
      </div>

      {/* Слайдер */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 10px' }}>
        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.4, color: INK, flexShrink: 0 }}>−</span>
        <input type="range" min={minScale} max={maxScale} step={0.01} value={currentScale}
          onChange={handleSlider} style={{ flex: 1, minWidth: 0, accentColor: ACCENT }} />
        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.4, color: INK, flexShrink: 0 }}>+</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
          {Math.round(currentScale * 100)}%
        </span>
      </div>
    </div>
  );
}