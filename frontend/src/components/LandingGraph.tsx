import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
  id: number;
  r: number;
}

interface Link {
  source: number;
  target: number;
}

// Узлы — разного размера
const NODES: Node[] = [
  { id: 0, r: 20 },
  { id: 1, r: 13 },
  { id: 2, r: 16 },
  { id: 3, r: 11 },
  { id: 4, r: 14 },
  { id: 5, r: 9  },
  { id: 6, r: 12 },
  { id: 7, r: 8  },
];

const LINKS: Link[] = [
  { source: 0, target: 1 },
  { source: 0, target: 2 },
  { source: 0, target: 4 },
  { source: 1, target: 3 },
  { source: 2, target: 5 },
  { source: 2, target: 6 },
  { source: 4, target: 7 },
  { source: 3, target: 6 },
];

const ACCENT = '#8074A4';

export function LandingGraph() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const W = 600;
    const H = 400;

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    const nodes: Node[] = NODES.map(n => ({
      ...n,
      // Начальные позиции — правее, уходят за правый край
      x: W * 0.65 + Math.random() * W * 0.5,
      y: H * 0.1  + Math.random() * H * 0.8,
    }));

    // Строим map для link source/target по id
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const simLinks = LINKS.map(l => ({
      source: nodeById.get(l.source)!,
      target: nodeById.get(l.target)!,
    }));

    const g = svg.append('g');

    const linkSel = g.append('g')
      .selectAll<SVGLineElement, typeof simLinks[0]>('line')
      .data(simLinks).join('line')
      .attr('stroke', ACCENT)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.2);

    const nodeSel = g.append('g')
      .selectAll<SVGCircleElement, Node>('circle')
      .data(nodes).join('circle')
      .attr('r', d => d.r)
      .attr('fill', (_, i) => i === 0 ? ACCENT : 'none')
      .attr('stroke', ACCENT)
      .attr('stroke-width', (_, i) => i === 0 ? 0 : 1.8)
      .attr('stroke-opacity', 0.45)
      .attr('fill-opacity', (_, i) => i === 0 ? 0.85 : 0);

    // Мягкая симуляция — очень слабые силы для плавного дрейфа
    const sim = d3.forceSimulation<Node>(nodes)
      .alphaDecay(0)           // никогда не останавливается
      .velocityDecay(0.6)      // высокое затухание = плавные движения
      .force('link', d3.forceLink(simLinks).distance(90).strength(0.08))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(W * 0.85, H * 0.5).strength(0.015))
      .force('collide', d3.forceCollide<Node>(d => d.r + 18).strength(0.5))
      // Мягкие границы — только слева чтобы не заезжать на текст, справа свободно
      .force('bound', () => {
        for (const n of nodes) {
          if (n.x == null || n.y == null) continue;
          const pad = n.r + 20;
          // Левая граница — не заезжать на текст (55% ширины)
          if (n.x < W * 0.55) n.vx = (n.vx ?? 0) + 0.5;
          // Вертикальные границы — мягко
          if (n.y < pad)      n.vy = (n.vy ?? 0) + 0.3;
          if (n.y > H - pad)  n.vy = (n.vy ?? 0) - 0.3;
          // Справа — нет ограничения, пусть уходит за край
        }
      });

    // Добавляем лёгкий случайный «шум» чтобы граф постоянно шевелился
    const interval = setInterval(() => {
      for (const n of nodes) {
        n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * 0.4;
        n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * 0.4;
      }
      sim.alpha(0.05).restart();
    }, 2000);

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => (d.source as Node).x ?? 0)
        .attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0)
        .attr('y2', d => (d.target as Node).y ?? 0);

      nodeSel
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0);
    });

    return () => {
      clearInterval(interval);
      sim.stop();
    };
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',   // ← не обрезается
      }}
    />
  );
}