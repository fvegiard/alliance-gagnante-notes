import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import type { GraphData } from '../types';
import { graphConfig } from '../config';

interface Props {
  data: GraphData;
  onNodeClick: (id: string) => void;
  selectedNodeId?: string | null;
}

// Punk swarm palette — one color per cluster
const CLUSTER_COLORS = ['#ff2d78', '#a3ff12', '#00e5ff', '#ffe600', '#c792ea', '#ff9e64', '#7dac5a', '#e0e0e0'];

export default function GraphView({ data, onNodeClick, selectedNodeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const stableClick = useCallback(onNodeClick, [onNodeClick]);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || data.nodes.length === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const svg = d3.select(svgEl).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'blur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 5]).on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);

    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.edges.map((d) => ({ ...d }));

    // ── Swarm clusters: folder first, else first tag, else "free" ──
    const clusterOf = (d: (typeof nodes)[number]) => d.folder || d.tags?.[0] || 'free';
    const clusters = [...new Set(nodes.map(clusterOf))].sort();
    const clusterColor = new Map(clusters.map((c, i) => [c, CLUSTER_COLORS[i % CLUSTER_COLORS.length]]));
    // Cluster anchor points arranged in a circle around the center
    const anchor = new Map(
      clusters.map((c, i) => {
        const angle = (i / clusters.length) * Math.PI * 2;
        const R = Math.min(width, height) * 0.28;
        return [c, { x: width / 2 + R * Math.cos(angle), y: height / 2 + R * Math.sin(angle) }];
      })
    );

    const sim = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(120).strength(0.3))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('collision', d3.forceCollide().radius((d: any) => nr(d) + 8))
      // Swarm behavior: each node is pulled toward its cluster's anchor
      .force('x', d3.forceX((d: any) => anchor.get(clusterOf(d))!.x).strength(0.09))
      .force('y', d3.forceY((d: any) => anchor.get(clusterOf(d))!.y).strength(0.09));

    function nr(d: any) { return Math.max(5, Math.sqrt(d.linkCount + 1) * 5.5); }

    // Cluster labels at the anchors
    const label = g.append('g').selectAll('text').data(clusters).enter().append('text')
      .text((d) => d.toUpperCase())
      .attr('x', (d) => anchor.get(d)!.x)
      .attr('y', (d) => anchor.get(d)!.y - 60)
      .attr('text-anchor', 'middle')
      .attr('fill', (d) => clusterColor.get(d)!)
      .attr('fill-opacity', 0.35)
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('letter-spacing', '2px')
      .attr('pointer-events', 'none');

    const link = g.append('g').selectAll('line').data(links).enter().append('line')
      .attr('stroke', 'rgba(255,45,120,0.12)')
      .attr('stroke-width', 1);

    const node = g.append('g').selectAll<SVGGElement, any>('g').data(nodes).enter().append('g')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (e) => { if (!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
        .on('drag', (e) => { e.subject.fx = e.x; e.subject.fy = e.y; })
        .on('end', (e) => { if (!e.active) sim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }));

    node.append('circle')
      .attr('r', nr)
      .attr('fill', (d: any) => clusterColor.get(clusterOf(d))!)
      .attr('fill-opacity', 0.7)
      .attr('stroke', (d: any) => d.id === selectedNodeId ? '#fff' : 'transparent')
      .attr('stroke-width', 2)
      .attr('filter', 'url(#glow)');

    node.append('text')
      .text((d: any) => (d.title.length > 14 ? `${d.title.slice(0, 13)}…` : d.title))
      .attr('dx', (d: any) => nr(d) + 6)
      .attr('dy', 4)
      .attr('fill', '#777')
      .attr('font-size', '11px')
      .attr('pointer-events', 'none');

    node.on('click', (_, d: any) => stableClick(d.id));

    node.on('mouseover', function (_, d: any) {
      d3.select(this).select('circle').attr('fill-opacity', 1).attr('stroke', '#fff');
      link
        .attr('stroke', (l: any) => l.source.id === d.id || l.target.id === d.id ? 'rgba(255,45,120,0.45)' : 'rgba(255,45,120,0.03)')
        .attr('stroke-width', (l: any) => l.source.id === d.id || l.target.id === d.id ? 1.5 : 0.5);
      node.select('circle').attr('fill-opacity', (n: any) => {
        if (n.id === d.id) return 1;
        return links.some((l: any) => (l.source.id === d.id && l.target.id === n.id) || (l.target.id === d.id && l.source.id === n.id)) ? 0.8 : 0.15;
      });
      node.select('text').attr('fill-opacity', (n: any) => {
        if (n.id === d.id) return 1;
        return links.some((l: any) => (l.source.id === d.id && l.target.id === n.id) || (l.target.id === d.id && l.source.id === n.id)) ? 1 : 0.15;
      });
    });

    node.on('mouseout', () => {
      node.select('circle').attr('fill-opacity', 0.7).attr('stroke', (d: any) => d.id === selectedNodeId ? '#fff' : 'transparent');
      node.select('text').attr('fill-opacity', 1);
      link.attr('stroke', 'rgba(255,45,120,0.12)').attr('stroke-width', 1);
    });

    // Constrain nodes within SVG bounds to prevent clipping
    const padding = 30;
    sim.on('tick', () => {
      nodes.forEach((d: any) => {
        const r = nr(d) + padding;
        d.x = Math.max(r, Math.min(width - r, d.x));
        d.y = Math.max(r, Math.min(height - r, d.y));
      });
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y).attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
      label.attr('x', (d) => anchor.get(d)!.x).attr('y', (d) => anchor.get(d)!.y - 60);
    });

    return () => { sim.stop(); };
  }, [data, stableClick, selectedNodeId]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="liquid-glass absolute bottom-10 left-4 rounded-xl px-4 py-2.5 w-fit">
        <div className="relative z-10 text-xs text-[#666] space-y-0.5">
          <div><span className="text-[#999]">{data.nodes.length}</span> {graphConfig.notesLabel} · <span className="text-[#999]">{data.edges.length}</span> {graphConfig.connectionsLabel}</div>
        </div>
      </div>
      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[#333] text-sm">{graphConfig.emptyGraphLabel}</div>
      )}
    </div>
  );
}
