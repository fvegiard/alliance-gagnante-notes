import type { GraphData } from '../types';

export type GraphViewKind = 'hierarchy' | 'structure' | 'relations';

export interface GraphAnalysis {
  nodeCount: number;
  folderCount: number;
  edgeCount: number;
  /** edges / nodes — average half-degree, a cheap density proxy */
  linkDensity: number;
  /** ratio of nodes with zero links */
  isolatedRatio: number;
  recommended: GraphViewKind;
  reason: string;
}

const VIEW_LABELS: Record<GraphViewKind, string> = {
  hierarchy: 'Hierarchy',
  structure: 'Structure',
  relations: 'Relations',
};

export function viewLabel(v: GraphViewKind): string {
  return VIEW_LABELS[v];
}

/**
 * Pure, synchronous auto-layout analyzer (<5ms for 500 nodes).
 * Inspects graph shape and recommends the most readable default view.
 */
export function analyzeGraph(data: GraphData): GraphAnalysis {
  const nodeCount = data.nodes.length;
  const edgeCount = data.edges.length;

  if (nodeCount === 0) {
    return {
      nodeCount: 0, folderCount: 0, edgeCount: 0,
      linkDensity: 0, isolatedRatio: 0,
      recommended: 'structure',
      reason: 'graphe vide',
    };
  }

  const folders = new Set<string>();
  let isolated = 0;
  for (const n of data.nodes) {
    folders.add(n.folder || 'Unfiled');
    if (n.linkCount === 0) isolated++;
  }
  const folderCount = folders.size;
  const linkDensity = edgeCount / nodeCount;
  const isolatedRatio = isolated / nodeCount;

  let recommended: GraphViewKind;
  let reason: string;

  if (folderCount > 12) {
    recommended = 'hierarchy';
    reason = `${folderCount} dossiers, organisation profonde`;
  } else if (folderCount <= 12 && linkDensity >= 1.2 && isolatedRatio < 0.5) {
    recommended = 'relations';
    reason = `réseau dense (${linkDensity.toFixed(1)} liens/note, ${folderCount} dossiers)`;
  } else if (isolatedRatio > 0.5) {
    recommended = 'structure';
    reason = `${Math.round(isolatedRatio * 100)}% de notes isolées, essaim par dossier plus lisible`;
  } else {
    recommended = 'structure';
    reason = `graphe équilibré (${folderCount} dossiers, ${linkDensity.toFixed(1)} liens/note)`;
  }

  return { nodeCount, folderCount, edgeCount, linkDensity, isolatedRatio, recommended, reason };
}
