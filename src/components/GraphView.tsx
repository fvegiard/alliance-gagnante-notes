import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { GraphData, GraphNode } from '../types';
import { graphConfig } from '../config';
import { analyzeGraph, viewLabel, type GraphViewKind } from '../utils/graphAnalysis';

interface Props {
  data: GraphData;
  onNodeClick: (id: string) => void;
  selectedNodeId?: string | null;
}

// Punk swarm palette — one color per cluster / folder
const CLUSTER_COLORS = ['#ff2d78', '#ffe600', '#a3ff12', '#00e5ff', '#c792ea', '#ff9e64', '#7dac5a', '#e0e0e0'];

/** Same hash-based folder color logic as Sidebar */
function folderColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CLUSTER_COLORS[h % CLUSTER_COLORS.length];
}

const RECENT_MS = 3 * 24 * 3600 * 1000;

function fmtDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

type Sel = { updateSelection: (id: string | null) => void } | null;

export default function GraphView({ data, onNodeClick, selectedNodeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const selRef = useRef<Sel>(null);
  const [view, setView] = useState<GraphViewKind | null>(null);
  const [selection, setSelection] = useState<string | null>(selectedNodeId ?? null);

  const analysis = useMemo(() => analyzeGraph(data), [data]);
  const effectiveView: GraphViewKind = view ?? analysis.recommended;
  const stableOpen = useCallback(onNodeClick, [onNodeClick]);
  const stableSelect = useCallback((id: string | null) => setSelection(id), []);

  // Keep internal selection in sync with parent-driven selection
  useEffect(() => { if (selectedNodeId) setSelection(selectedNodeId); }, [selectedNodeId]);

  // Push selection styling into the active SVG without re-running layouts
  useEffect(() => { selRef.current?.updateSelection(selection); }, [selection, effectiveView]);

  const selectedNode = useMemo(
    () => data.nodes.find((n) => n.id === selection) ?? null,
    [data, selection],
  );
  const neighbors = useMemo(() => {
    if (!selection) return [] as GraphNode[];
    const ids = new Set<string>();
    for (const e of data.edges) {
      if (e.source === selection) ids.add(e.target);
      else if (e.target === selection) ids.add(e.source);
    }
    return data.nodes.filter((n) => ids.has(n.id)).slice(-3);
  }, [data, selection]);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || data.nodes.length === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const svg = d3.select(svgEl).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();
    selRef.current = null;

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
    filter.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'blur');
    const merge = filter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 5]).on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);
    svg.on('click', (e) => { if (e.target === svgEl) stableSelect(null); });

    /** Fit current content into the viewport */
    const fitToView = () => {
      const node = g.node();
      if (!node) return;
      const b = node.getBBox();
      if (!b.width || !b.height) return;
      const scale = Math.min(1.2, 0.92 / Math.max(b.width / width, b.height / height));
      const tx = width / 2 - scale * (b.x + b.width / 2);
      const ty = height / 2 - scale * (b.y + b.height / 2);
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };

    let cleanup: (() => void) | undefined;
    if (effectiveView === 'hierarchy') selRef.current = renderHierarchy();
    else if (effectiveView === 'relations') selRef.current = renderRelations();
    else cleanup = renderStructure();

    selRef.current?.updateSelection(selection);
    const fitTimer = window.setTimeout(fitToView, effectiveView === 'structure' ? 900 : 30);

    return () => {
      window.clearTimeout(fitTimer);
      cleanup?.();
      selRef.current = null;
    };

    // ─────────────────────────── HIERARCHY ───────────────────────────
    function renderHierarchy(): Sel {
      const CARD_W = 216;
      const CARD_H = 52;

      interface TreeNode {
        name: string;
        kind: 'root' | 'folder' | 'note';
        color: string;
        subtitle: string;
        recent: boolean;
        id?: string;
        children?: TreeNode[];
      }

      const byFolder = new Map<string, GraphNode[]>();
      for (const n of data.nodes) {
        const f = n.folder || 'Unfiled';
        if (!byFolder.has(f)) byFolder.set(f, []);
        byFolder.get(f)!.push(n);
      }
      const folders = [...byFolder.keys()].sort((a, b) => a.localeCompare(b));
      const root: TreeNode = {
        name: '📓 Alliance Gagnante',
        kind: 'root',
        color: '#ff2d78',
        subtitle: `${data.nodes.length} notes · ${folders.length} dossiers`,
        recent: true,
        children: folders.map((f) => {
          const notes = byFolder.get(f)!.sort((a, b) => a.title.localeCompare(b.title));
          return {
            name: f,
            kind: 'folder' as const,
            color: folderColor(f),
            subtitle: `${notes.length} note${notes.length > 1 ? 's' : ''}`,
            recent: true,
            children: notes.map((n) => ({
              name: n.title,
              kind: 'note' as const,
              color: folderColor(f),
              subtitle: `${n.linkCount} lien${n.linkCount > 1 ? 's' : ''} · maj ${fmtDate(n.updatedAt)}`,
              recent: !!n.updatedAt && Date.now() - n.updatedAt < RECENT_MS,
              id: n.id,
            })),
          };
        }),
      };

      const tree = d3.tree<TreeNode>().nodeSize([CARD_H + 26, CARD_W + 46]);
      const hierarchy = d3.hierarchy(root);
      tree(hierarchy);

      // Elbow (orthogonal) connectors
      g.append('g').selectAll('path')
        .data(hierarchy.links())
        .enter().append('path')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255,255,255,0.14)')
        .attr('stroke-width', 1.2)
        .attr('d', (l) => {
          const sx = l.source.x!, sy = l.source.y! + CARD_H / 2;
          const tx = l.target.x!, ty = l.target.y! - CARD_H / 2;
          const my = (sy + ty) / 2;
          return `M${sx},${sy}V${my}H${tx}V${ty}`;
        });

      const node = g.append('g').selectAll<SVGGElement, d3.HierarchyPointNode<TreeNode>>('g')
        .data(hierarchy.descendants())
        .enter().append('g')
        .attr('transform', (d) => `translate(${d.x},${d.y})`)
        .style('cursor', (d) => (d.data.kind === 'note' ? 'pointer' : 'default'));

      node.append('rect')
        .attr('x', -CARD_W / 2).attr('y', -CARD_H / 2)
        .attr('width', CARD_W).attr('height', CARD_H)
        .attr('rx', 9)
        .attr('fill', 'rgba(16,16,16,0.92)')
        .attr('stroke', (d) => (d.data.id && d.data.id === selection ? '#fff' : 'rgba(255,255,255,0.10)'))
        .attr('stroke-width', (d) => (d.data.id && d.data.id === selection ? 1.6 : 1));

      // Colored left border
      node.append('rect')
        .attr('x', -CARD_W / 2).attr('y', -CARD_H / 2)
        .attr('width', 4).attr('height', CARD_H)
        .attr('rx', 2)
        .attr('fill', (d) => d.data.color);

      // Status dot
      node.append('circle')
        .attr('cx', CARD_W / 2 - 12).attr('cy', -CARD_H / 2 + 12)
        .attr('r', 3.5)
        .attr('fill', (d) => (d.data.kind !== 'note' ? 'transparent' : d.data.recent ? '#7dac5a' : '#555'));

      node.append('text')
        .attr('x', -CARD_W / 2 + 14).attr('y', -4)
        .attr('fill', (d) => (d.data.kind === 'note' ? '#e8e8e8' : d.data.color))
        .attr('font-size', '11.5px')
        .attr('font-weight', 600)
        .attr('pointer-events', 'none')
        .text((d) => (d.data.name.length > 30 ? `${d.data.name.slice(0, 29)}…` : d.data.name));
      node.append('title').text((d) => d.data.name);

      node.append('text')
        .attr('x', -CARD_W / 2 + 14).attr('y', 13)
        .attr('fill', '#888')
        .attr('font-size', '9px')
        .attr('font-family', 'monospace')
        .attr('pointer-events', 'none')
        .text((d) => d.data.subtitle);

      node.on('click', (e, d) => {
        if (d.data.kind !== 'note' || !d.data.id) return;
        e.stopPropagation();
        stableSelect(d.data.id);
      });

      return {
        updateSelection: (id) => {
          node.select('rect')
            .attr('stroke', (d: any) => (d.data.id && d.data.id === id ? '#fff' : 'rgba(255,255,255,0.10)'))
            .attr('stroke-width', (d: any) => (d.data.id && d.data.id === id ? 1.6 : 1));
        },
      };
    }

    // ─────────────────────────── STRUCTURE ───────────────────────────
    function renderStructure(): () => void {
      const nodes = data.nodes.map((d) => ({ ...d }));
      const links = data.edges.map((d) => ({ ...d }));

      const clusterOf = (d: (typeof nodes)[number]) => d.folder || d.tags?.[0] || 'free';
      const clusters = [...new Set(nodes.map(clusterOf))].sort();
      const clusterColor = new Map(clusters.map((c, i) => [c, CLUSTER_COLORS[i % CLUSTER_COLORS.length]]));
      const anchor = new Map(
        clusters.map((c, i) => {
          const angle = (i / clusters.length) * Math.PI * 2;
          const R = Math.min(width, height) * 0.28;
          return [c, { x: width / 2 + R * Math.cos(angle), y: height / 2 + R * Math.sin(angle) }];
        }),
      );

      function nr(d: any) { return Math.max(5, Math.sqrt(d.linkCount + 1) * 5.5); }

      const sim = d3.forceSimulation(nodes as any)
        .force('link', d3.forceLink(links).id((d: any) => d.id).distance(120).strength(0.3))
        .force('charge', d3.forceManyBody().strength(-260))
        .force('collision', d3.forceCollide().radius((d: any) => nr(d) + 8))
        .force('x', d3.forceX((d: any) => anchor.get(clusterOf(d))!.x).strength(0.09))
        .force('y', d3.forceY((d: any) => anchor.get(clusterOf(d))!.y).strength(0.09));

      // Faint convex-hull blob behind each cluster
      const hull = g.append('g').selectAll('path')
        .data(clusters)
        .enter().append('path')
        .attr('fill', (c) => clusterColor.get(c)!)
        .attr('fill-opacity', 0.08)
        .attr('stroke', (c) => clusterColor.get(c)!)
        .attr('stroke-opacity', 0.12)
        .attr('pointer-events', 'none');

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
        .attr('stroke', (d: any) => (d.id === selection ? '#fff' : 'transparent'))
        .attr('stroke-width', 2);

      node.append('text')
        .text((d: any) => d.title)
        .attr('dx', (d: any) => nr(d) + 6)
        .attr('dy', 4)
        .attr('fill', '#999')
        .attr('font-size', '10px')
        .attr('pointer-events', 'none');

      node.on('click', (e, d: any) => { e.stopPropagation(); stableSelect(d.id); });

      node.on('mouseover', function (_, d: any) {
        d3.select(this).select('circle').attr('fill-opacity', 1).attr('stroke', '#fff').attr('filter', 'url(#glow)');
        link
          .attr('stroke', (l: any) => (l.source.id === d.id || l.target.id === d.id ? 'rgba(255,45,120,0.45)' : 'rgba(255,45,120,0.03)'))
          .attr('stroke-width', (l: any) => (l.source.id === d.id || l.target.id === d.id ? 1.5 : 0.5));
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
        node.select('circle')
          .attr('fill-opacity', 0.7)
          .attr('filter', null)
          .attr('stroke', (d: any) => (d.id === currentSel ? '#fff' : 'transparent'));
        node.select('text').attr('fill-opacity', 1);
        link.attr('stroke', 'rgba(255,45,120,0.12)').attr('stroke-width', 1);
      });

      let currentSel: string | null = selection;
      selRef.current = {
        updateSelection: (id) => {
          currentSel = id;
          node.select('circle').attr('stroke', (d: any) => (d.id === id ? '#fff' : 'transparent'));
        },
      };

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
        hull.attr('d', (c) => {
          const pts = nodes.filter((n) => clusterOf(n) === c).map((n: any) => [n.x, n.y] as [number, number]);
          if (pts.length < 3) return '';
          const h = d3.polygonHull(pts);
          if (!h) return '';
          // Expand hull slightly outward from its centroid for breathing room
          const cx = d3.mean(h, (p) => p[0])!;
          const cy = d3.mean(h, (p) => p[1])!;
          const padded = h.map(([x, y]) => {
            const dx = x - cx, dy = y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            return [x + (dx / dist) * 34, y + (dy / dist) * 34];
          });
          return `M${padded.map((p) => p.join(',')).join('L')}Z`;
        });
      });

      return () => sim.stop();
    }

    // ─────────────────────────── RELATIONS ───────────────────────────
    function renderRelations(): Sel {
      // Sort nodes by folder so same-folder nodes sit next to each other on the ring
      const nodes = [...data.nodes].sort((a, b) =>
        (a.folder || 'Unfiled').localeCompare(b.folder || 'Unfiled') || a.title.localeCompare(b.title),
      );
      const R = Math.min(width, height) * 0.36;
      const cx = width / 2;
      const cy = height / 2;
      const pos = new Map<string, { x: number; y: number; angle: number }>();
      nodes.forEach((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        pos.set(n.id, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle), angle });
      });

      interface TypedEdge { a: string; b: string; type: 'wiki' | 'folder' | 'tag'; }
      const edges: TypedEdge[] = [];
      const seen = new Set<string>();
      const key = (a: string, b: string) => [a, b].sort().join('::');

      // 1) Wiki-links (actual note links)
      const wikiPairs = new Set<string>();
      for (const e of data.edges) {
        wikiPairs.add(key(e.source, e.target));
        edges.push({ a: e.source, b: e.target, type: 'wiki' });
        seen.add(key(e.source, e.target));
      }
      // 2) Same-folder chain edges (dashed pink) — skip pairs already linked
      const byFolder = new Map<string, string[]>();
      for (const n of nodes) {
        const f = n.folder || 'Unfiled';
        if (!byFolder.has(f)) byFolder.set(f, []);
        byFolder.get(f)!.push(n.id);
      }
      for (const ids of byFolder.values()) {
        for (let i = 0; i + 1 < ids.length; i++) {
          const k = key(ids[i], ids[i + 1]);
          if (!seen.has(k)) { seen.add(k); edges.push({ a: ids[i], b: ids[i + 1], type: 'folder' }); }
        }
      }
      // 3) Shared-tag chain edges (dotted yellow)
      const byTag = new Map<string, string[]>();
      for (const n of nodes) for (const t of n.tags ?? []) {
        if (!byTag.has(t)) byTag.set(t, []);
        byTag.get(t)!.push(n.id);
      }
      for (const ids of byTag.values()) {
        if (ids.length > 12) continue; // avoid hairball from very common tags
        for (let i = 0; i + 1 < ids.length; i++) {
          const k = key(ids[i], ids[i + 1]);
          if (!seen.has(k)) { seen.add(k); edges.push({ a: ids[i], b: ids[i + 1], type: 'tag' }); }
        }
      }

      const edgeStyle: Record<TypedEdge['type'], { stroke: string; dash: string | null; opacity: number }> = {
        wiki: { stroke: '#a3ff12', dash: null, opacity: 0.45 },
        folder: { stroke: '#ff2d78', dash: '5 4', opacity: 0.3 },
        tag: { stroke: '#ffe600', dash: '1.5 4', opacity: 0.3 },
      };

      // Chord-like curves: quadratic bezier pulled toward the center
      const edgePath = (e: TypedEdge) => {
        const p1 = pos.get(e.a)!;
        const p2 = pos.get(e.b)!;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const qx = mx + (cx - mx) * 0.55;
        const qy = my + (cy - my) * 0.55;
        return `M${p1.x},${p1.y}Q${qx},${qy} ${p2.x},${p2.y}`;
      };

      const link = g.append('g').selectAll('path').data(edges).enter().append('path')
        .attr('fill', 'none')
        .attr('d', edgePath)
        .attr('stroke', (e) => edgeStyle[e.type].stroke)
        .attr('stroke-opacity', (e) => edgeStyle[e.type].opacity)
        .attr('stroke-width', (e) => (e.type === 'wiki' ? 1.3 : 1))
        .attr('stroke-dasharray', (e) => edgeStyle[e.type].dash);

      const node = g.append('g').selectAll<SVGGElement, GraphNode>('g').data(nodes).enter().append('g')
        .attr('transform', (n) => `translate(${pos.get(n.id)!.x},${pos.get(n.id)!.y})`)
        .style('cursor', 'pointer');

      node.append('circle')
        .attr('r', (n) => Math.max(4, Math.sqrt(n.linkCount + 1) * 4))
        .attr('fill', (n) => folderColor(n.folder || 'Unfiled'))
        .attr('fill-opacity', 0.85)
        .attr('stroke', (n) => (n.id === selection ? '#fff' : 'transparent'))
        .attr('stroke-width', 2);

      // Radial labels — full titles, flipped on the left half
      node.append('text')
        .text((n) => n.title)
        .attr('font-size', '9.5px')
        .attr('fill', '#bbb')
        .attr('pointer-events', 'none')
        .attr('transform', (n) => {
          const a = (pos.get(n.id)!.angle * 180) / Math.PI;
          const flip = a > 90 && a < 270;
          return `rotate(${flip ? a + 180 : a})`;
        })
        .attr('dx', (n) => {
          const a = (pos.get(n.id)!.angle * 180) / Math.PI;
          return a > 90 && a < 270 ? -9 : 9;
        })
        .attr('dy', 3)
        .attr('text-anchor', (n) => {
          const a = (pos.get(n.id)!.angle * 180) / Math.PI;
          return a > 90 && a < 270 ? 'end' : 'start';
        });

      node.on('click', (e, n) => { e.stopPropagation(); stableSelect(n.id); });

      node.on('mouseover', (_, n) => {
        link.attr('stroke-opacity', (e) =>
          e.a === n.id || e.b === n.id ? 0.9 : 0.04,
        );
      });
      node.on('mouseout', () => {
        link.attr('stroke-opacity', (e) => edgeStyle[e.type].opacity);
      });

      return {
        updateSelection: (id) => {
          node.select('circle').attr('stroke', (d: any) => (d.id === id ? '#fff' : 'transparent'));
        },
      };
    }
  }, [data, effectiveView, stableOpen, stableSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: GraphViewKind[] = ['hierarchy', 'structure', 'relations'];

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black">
      <svg ref={svgRef} className="w-full h-full" />

      {/* Punk segmented view tabs */}
      <div className="graph-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={`graph-tab${effectiveView === t ? ' active' : ''}`}
            onClick={() => setView(t)}
          >
            {viewLabel(t)}
          </button>
        ))}
      </div>

      {/* Auto-layout analyzer banner */}
      {analysis.recommended !== effectiveView && (
        <div className="graph-banner">
          <span>🧠 Analyse&nbsp;: {analysis.reason} → vue {viewLabel(analysis.recommended)} recommandée</span>
          <button onClick={() => setView(analysis.recommended)}>Appliquer</button>
        </div>
      )}

      {/* Floating note info card */}
      {selectedNode && (
        <div className="graph-info-card">
          <h3>{selectedNode.title}</h3>
          <div className="meta">
            {selectedNode.folder || 'Unfiled'} · {selectedNode.linkCount} lien{selectedNode.linkCount > 1 ? 's' : ''}
            {selectedNode.updatedAt ? ` · maj ${fmtDate(selectedNode.updatedAt)}` : ''}
          </div>
          {(selectedNode.tags?.length ?? 0) > 0 && (
            <div className="tags">
              {selectedNode.tags!.slice(0, 5).map((t) => <span key={t} className="tag">#{t}</span>)}
            </div>
          )}
          {neighbors.length > 0 && (
            <div className="chips">
              {neighbors.map((n) => (
                <button key={n.id} className="chip" onClick={() => stableSelect(n.id)} title={n.title}>
                  → {n.title}
                </button>
              ))}
            </div>
          )}
          <button className="open-btn" onClick={() => stableOpen(selectedNode.id)}>Ouvrir</button>
        </div>
      )}

      {/* Edge-type legend (Relations view) */}
      {effectiveView === 'relations' && data.nodes.length > 0 && (
        <div className="graph-legend">
          <div><span className="swatch" style={{ borderColor: '#a3ff12' }} />lien wiki [[…]]</div>
          <div><span className="swatch" style={{ borderColor: '#ff2d78', borderTopStyle: 'dashed' }} />même dossier</div>
          <div><span className="swatch" style={{ borderColor: '#ffe600', borderTopStyle: 'dotted' }} />tag partagé</div>
          <div style={{ marginTop: 4, color: '#777' }}>● couleur du nœud = dossier</div>
        </div>
      )}

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
