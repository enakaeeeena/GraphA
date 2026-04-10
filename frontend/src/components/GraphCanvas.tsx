import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import type { GraphData } from '../types/api';

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
}

const INK = '#3D325F';
const ACCENT = '#8074A4';

export function GraphCanvas({ data, selectedNodeId, onSelectNode }: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const nodes = useMemo<GraphNode[]>(
    () => data.nodes.map((n) => ({ ...n })),
    [data.nodes],
  );

  const links = useMemo<GraphLink[]>(
    () => data.links.map((l) => ({ ...l })) as GraphLink[],
    [data.links],
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    const wrapperEl = wrapperRef.current;
    if (!svgEl || !wrapperEl) return;

    const width = Math.max(320, wrapperEl.clientWidth);
    const height = Math.max(320, wrapperEl.clientHeight);

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const zoomLayer = svg.append('g');
    const linkLayer = zoomLayer.append('g').attr('stroke', INK).attr('stroke-opacity', 0.45);
    const nodeLayer = zoomLayer.append('g');

    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(90)
          .strength(0.7),
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(18));

    const linkSel = linkLayer
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1.6);

    const nodeSel = nodeLayer
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 9)
      .attr('fill', (d) => (d.id === selectedNodeId ? ACCENT : 'rgba(255,255,255,0.75)'))
      .attr('stroke', (d) => (d.id === selectedNodeId ? ACCENT : INK))
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGCircleElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on('click', (_, d) => onSelectNode(d.id));

    const labelSel = nodeLayer
      .selectAll<SVGTextElement, GraphNode>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.name || d.id)
      .attr('font-size', 10.5)
      .attr('fill', INK)
      .attr('stroke', 'rgba(255,250,235,0.75)')
      .attr('stroke-width', 4)
      .attr('paint-order', 'stroke')
      .attr('dx', 12)
      .attr('dy', 4)
      .style('pointer-events', 'none');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 2.8])
      .on('zoom', (event) => zoomLayer.attr('transform', event.transform.toString()));

    svg.call(zoom as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void);

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      nodeSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
      labelSel.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
    });

    const handleResize = () => {
      const w = Math.max(320, wrapperEl.clientWidth);
      const h = Math.max(320, wrapperEl.clientHeight);
      svg.attr('viewBox', `0 0 ${w} ${h}`);
      sim.force('center', d3.forceCenter(w / 2, h / 2));
      sim.alpha(0.35).restart();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(wrapperEl);

    return () => {
      ro.disconnect();
      sim.stop();
    };
  }, [links, nodes, onSelectNode, selectedNodeId]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .attr('fill', (d) => (d.id === selectedNodeId ? ACCENT : 'rgba(255,255,255,0.75)'))
      .attr('stroke', (d) => (d.id === selectedNodeId ? ACCENT : INK));
  }, [selectedNodeId]);

  return (
    <div className="graph-canvas" ref={wrapperRef}>
      <svg ref={svgRef} />
    </div>
  );
}

