import dagre from '@dagrejs/dagre';
import type { Edge, Node, XYPosition } from '@xyflow/react';
import { WORKFLOW_NODE_HEIGHT, WORKFLOW_NODE_WIDTH } from './WorkflowNodeCard';

const WORKFLOW_NODE_COLUMN_GAP = 80;
const WORKFLOW_NODE_ROW_GAP = 56;
const WORKFLOW_QUICK_ADD_COLUMNS = 4;
const WORKFLOW_POSITION_SEARCH_LIMIT = 128;

function positionsOverlap(left: XYPosition, right: XYPosition, gap = 0): boolean {
  return left.x < right.x + WORKFLOW_NODE_WIDTH + gap
    && left.x + WORKFLOW_NODE_WIDTH + gap > right.x
    && left.y < right.y + WORKFLOW_NODE_HEIGHT + gap
    && left.y + WORKFLOW_NODE_HEIGHT + gap > right.y;
}

export function hasWorkflowNodeOverlap(nodes: Array<Pick<Node, 'position'>>): boolean {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      if (positionsOverlap(nodes[leftIndex].position, nodes[rightIndex].position)) return true;
    }
  }
  return false;
}

export function findFreeWorkflowNodePosition(
  nodes: Array<Pick<Node, 'position'>>,
  preferred: XYPosition = { x: 80, y: 120 },
): XYPosition {
  const origin = {
    x: Number.isFinite(preferred.x) ? preferred.x : 80,
    y: Number.isFinite(preferred.y) ? preferred.y : 120,
  };
  const columnPitch = WORKFLOW_NODE_WIDTH + WORKFLOW_NODE_COLUMN_GAP;
  const rowPitch = WORKFLOW_NODE_HEIGHT + WORKFLOW_NODE_ROW_GAP;

  for (let slot = 0; slot < WORKFLOW_POSITION_SEARCH_LIMIT; slot += 1) {
    const candidate = {
      x: origin.x + (slot % WORKFLOW_QUICK_ADD_COLUMNS) * columnPitch,
      y: origin.y + Math.floor(slot / WORKFLOW_QUICK_ADD_COLUMNS) * rowPitch,
    };
    if (nodes.every((node) => !positionsOverlap(candidate, node.position, 24))) return candidate;
  }

  return {
    x: origin.x,
    y: origin.y + Math.ceil(nodes.length / WORKFLOW_QUICK_ADD_COLUMNS) * rowPitch,
  };
}

export function layoutWorkflowNodes<T extends Node>(nodes: T[], edges: Edge[]): T[] {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', ranksep: 90, nodesep: 55, marginx: 40, marginy: 40 });
  nodes.forEach((node) => graph.setNode(node.id, { width: WORKFLOW_NODE_WIDTH, height: WORKFLOW_NODE_HEIGHT }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => {
    const position = graph.node(node.id) as { x: number; y: number };
    return {
      ...node,
      position: {
        x: position.x - WORKFLOW_NODE_WIDTH / 2,
        y: position.y - WORKFLOW_NODE_HEIGHT / 2,
      },
    };
  });
}
