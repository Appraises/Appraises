import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGraph,
  edgeId,
  planTraversals,
  traverseBreadthFirst,
  traverseDepthFirst,
} from '../src/graph.mjs';

test('creates only orthogonal edges and never diagonal edges', () => {
  const graph = buildGraph(
    calendarFromCoordinates([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 2],
    ]),
  );
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));

  assert.deepEqual(edgeIds, new Set([
    edgeId('0:0', '1:0'),
    edgeId('0:0', '0:1'),
    edgeId('1:0', '1:1'),
    edgeId('0:1', '1:1'),
  ]));
  assert.equal(edgeIds.has(edgeId('1:1', '2:2')), false);
  assert.equal(graph.components.length, 2);
  assert.deepEqual(graph.components.map((component) => component.size), [4, 1]);
});

test('DFS follows right/down/left/up order and records backtracking', () => {
  const graph = buildGraph(
    calendarFromCoordinates([
      [0, 0],
      [1, 0],
      [1, 1],
    ]),
  );
  const traversal = traverseDepthFirst(graph, graph.components[0]);

  assert.deepEqual(
    traversal.visits.map((visit) => visit.nodeId),
    ['0:0', '1:0', '1:1'],
  );
  assert.deepEqual(
    traversal.moves.map(({ from, to, kind }) => `${from}>${to}:${kind}`),
    [
      '0:0>1:0:forward',
      '1:0>1:1:forward',
      '1:1>1:0:backtrack',
      '1:0>0:0:backtrack',
    ],
  );
});

test('BFS groups the component into simultaneous distance layers', () => {
  const graph = buildGraph(
    calendarFromCoordinates([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
    ]),
  );
  const traversal = traverseBreadthFirst(graph, graph.components[0]);

  assert.deepEqual(traversal.levels, [
    ['0:0'],
    ['1:0', '0:1'],
    ['2:0'],
  ]);
  assert.equal(traversal.treeEdges.length, graph.components[0].size - 1);
});

test('alternates DFS and BFS across non-trivial components', () => {
  const graph = buildGraph(
    calendarFromCoordinates([
      [0, 0],
      [1, 0],
      [2, 0],
      [4, 2],
      [4, 3],
      [6, 6],
    ], 7),
  );
  const traversals = planTraversals(graph);

  assert.deepEqual(
    traversals.map((traversal) => traversal.algorithm),
    ['dfs', 'bfs', 'isolated'],
  );
});

function calendarFromCoordinates(coordinates, width = 4) {
  const active = new Set(
    coordinates.map(([weekIndex, weekday]) => `${weekIndex}:${weekday}`),
  );
  const start = new Date('2026-01-04T00:00:00Z');
  let totalContributions = 0;

  const weeks = Array.from({ length: width }, (_, weekIndex) => {
    const firstDay = addDays(start, weekIndex * 7);
    return {
      firstDay: formatDate(firstDay),
      contributionDays: Array.from({ length: 7 }, (_, weekday) => {
        const contributionCount = active.has(`${weekIndex}:${weekday}`) ? 1 : 0;
        totalContributions += contributionCount;
        return {
          date: formatDate(addDays(firstDay, weekday)),
          weekday,
          contributionCount,
          contributionLevel:
            contributionCount > 0 ? 'FIRST_QUARTILE' : 'NONE',
        };
      }),
    };
  });

  return { totalContributions, weeks };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}
