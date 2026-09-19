export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  folder?: string | null;
  source?: string;
}

export interface GraphNode {
  id: string;
  title: string;
  linkCount: number;
  folder?: string | null;
  tags?: string[];
  updatedAt?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type ViewMode = 'editor' | 'graph' | 'connections';
