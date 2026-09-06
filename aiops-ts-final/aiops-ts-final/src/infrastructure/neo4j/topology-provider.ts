export interface TopologyResult {
  center: string;
  nodes: Array<{ name: string; type: string }>;
  edges: Array<{ from: string; to: string }>;
}
export interface TopologyProvider {
  oneHop(node: string): Promise<TopologyResult>;
}
