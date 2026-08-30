const DIRECTION_ORDER = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function normalizeCalendar(calendar) {
  if (!calendar || !Array.isArray(calendar.weeks)) {
    throw new TypeError('Expected a contribution calendar with a weeks array.');
  }

  const weeks = calendar.weeks.map((week, weekIndex) => {
    const daysByWeekday = new Map(
      (week.contributionDays ?? []).map((day) => [
        Number(day.weekday ?? utcWeekday(day.date)),
        day,
      ]),
    );

    return {
      firstDay: week.firstDay ?? null,
      contributionDays: Array.from({ length: 7 }, (_, weekday) => {
        const day = daysByWeekday.get(weekday);
        if (!day) return null;

        const contributionCount = Number(day.contributionCount ?? 0);
        return {
          id: `${weekIndex}:${weekday}`,
          date: day.date,
          weekday,
          weekIndex,
          contributionCount,
          contributionLevel: normalizeLevel(
            day.contributionLevel,
            contributionCount,
          ),
          color: day.color ?? null,
        };
      }),
    };
  });

  return {
    totalContributions: Number(calendar.totalContributions ?? 0),
    weeks,
  };
}

export function buildGraph(calendar) {
  const normalized = normalizeCalendar(calendar);
  const cells = normalized.weeks.flatMap((week) =>
    week.contributionDays.filter(Boolean),
  );
  const nodes = cells.filter((cell) => cell.contributionCount > 0);
  const nodeByCoordinate = new Map(
    nodes.map((node) => [coordinateKey(node.weekIndex, node.weekday), node]),
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const edges = [];

  for (const node of nodes) {
    for (const [deltaWeek, deltaDay] of [
      [1, 0],
      [0, 1],
    ]) {
      const neighbor = nodeByCoordinate.get(
        coordinateKey(
          node.weekIndex + deltaWeek,
          node.weekday + deltaDay,
        ),
      );
      if (!neighbor) continue;

      const edge = {
        id: edgeId(node.id, neighbor.id),
        from: node.id,
        to: neighbor.id,
      };
      edges.push(edge);
      adjacency.get(node.id).push(neighbor.id);
      adjacency.get(neighbor.id).push(node.id);
    }
  }

  for (const node of nodes) {
    adjacency.get(node.id).sort(
      (leftId, rightId) =>
        directionRank(node, nodeById.get(leftId)) -
          directionRank(node, nodeById.get(rightId)) ||
        leftId.localeCompare(rightId),
    );
  }

  const graph = {
    calendar: normalized,
    cells,
    nodes,
    nodeById,
    adjacency,
    edges,
  };
  graph.components = findComponents(graph);
  return graph;
}

export function findComponents(graph) {
  const seen = new Set();
  const components = [];

  for (const start of [...graph.nodes].sort(compareNodes)) {
    if (seen.has(start.id)) continue;

    const queue = [start.id];
    const componentIds = [];
    seen.add(start.id);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const currentId = queue[cursor];
      componentIds.push(currentId);
      for (const neighborId of graph.adjacency.get(currentId)) {
        if (seen.has(neighborId)) continue;
        seen.add(neighborId);
        queue.push(neighborId);
      }
    }

    componentIds.sort((a, b) =>
      compareNodes(graph.nodeById.get(a), graph.nodeById.get(b)),
    );
    components.push({
      id: `component-${components.length}`,
      nodeIds: componentIds,
      size: componentIds.length,
      firstDate: graph.nodeById.get(componentIds[0]).date,
    });
  }

  components.sort(
    (a, b) => b.size - a.size || a.firstDate.localeCompare(b.firstDate),
  );
  components.forEach((component, index) => {
    component.id = `component-${index}`;
  });
  return components;
}

export function traverseDepthFirst(graph, component) {
  const allowed = new Set(component.nodeIds);
  const seen = new Set();
  const visits = [];
  const moves = [];
  const rootId = earliestNodeId(graph, component.nodeIds);

  function visit(nodeId, parentId = null, depth = 0) {
    seen.add(nodeId);
    visits.push({ nodeId, parentId, depth });

    for (const neighborId of graph.adjacency.get(nodeId)) {
      if (!allowed.has(neighborId) || seen.has(neighborId)) continue;
      moves.push({ from: nodeId, to: neighborId, kind: 'forward' });
      visit(neighborId, nodeId, depth + 1);
      moves.push({ from: neighborId, to: nodeId, kind: 'backtrack' });
    }
  }

  visit(rootId);
  return {
    algorithm: 'dfs',
    rootId,
    visits,
    moves,
    treeEdges: visits
      .filter((visitEvent) => visitEvent.parentId)
      .map((visitEvent) => ({
        from: visitEvent.parentId,
        to: visitEvent.nodeId,
      })),
  };
}

export function traverseBreadthFirst(graph, component) {
  const allowed = new Set(component.nodeIds);
  const rootId = earliestNodeId(graph, component.nodeIds);
  const seen = new Set([rootId]);
  const queue = [{ nodeId: rootId, parentId: null, level: 0 }];
  const visits = [];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    visits.push(current);

    for (const neighborId of graph.adjacency.get(current.nodeId)) {
      if (!allowed.has(neighborId) || seen.has(neighborId)) continue;
      seen.add(neighborId);
      queue.push({
        nodeId: neighborId,
        parentId: current.nodeId,
        level: current.level + 1,
      });
    }
  }

  const levels = [];
  for (const visitEvent of visits) {
    levels[visitEvent.level] ??= [];
    levels[visitEvent.level].push(visitEvent.nodeId);
  }

  return {
    algorithm: 'bfs',
    rootId,
    visits,
    levels,
    treeEdges: visits
      .filter((visitEvent) => visitEvent.parentId)
      .map((visitEvent) => ({
        from: visitEvent.parentId,
        to: visitEvent.nodeId,
        level: visitEvent.level,
      })),
  };
}

export function planTraversals(graph) {
  let nextAlgorithm = 'dfs';

  return graph.components.map((component) => {
    if (component.size === 1) {
      return {
        component,
        algorithm: 'isolated',
        rootId: component.nodeIds[0],
        visits: [{
          nodeId: component.nodeIds[0],
          parentId: null,
          level: 0,
        }],
        treeEdges: [],
      };
    }

    const traversal =
      nextAlgorithm === 'dfs'
        ? traverseDepthFirst(graph, component)
        : traverseBreadthFirst(graph, component);
    nextAlgorithm = nextAlgorithm === 'dfs' ? 'bfs' : 'dfs';
    return { component, ...traversal };
  });
}

export function edgeId(leftId, rightId) {
  return [leftId, rightId].sort().join('--');
}

function earliestNodeId(graph, nodeIds) {
  return [...nodeIds].sort((a, b) =>
    compareNodes(graph.nodeById.get(a), graph.nodeById.get(b)),
  )[0];
}

function compareNodes(a, b) {
  return (
    a.date.localeCompare(b.date) ||
    a.weekIndex - b.weekIndex ||
    a.weekday - b.weekday
  );
}

function directionRank(origin, target) {
  const deltaWeek = target.weekIndex - origin.weekIndex;
  const deltaDay = target.weekday - origin.weekday;
  return DIRECTION_ORDER.findIndex(
    ([week, day]) => week === deltaWeek && day === deltaDay,
  );
}

function coordinateKey(weekIndex, weekday) {
  return `${weekIndex}:${weekday}`;
}

function utcWeekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function normalizeLevel(level, contributionCount) {
  if (typeof level === 'string') return level;
  if (contributionCount === 0) return 'NONE';
  if (contributionCount <= 2) return 'FIRST_QUARTILE';
  if (contributionCount <= 5) return 'SECOND_QUARTILE';
  if (contributionCount <= 9) return 'THIRD_QUARTILE';
  return 'FOURTH_QUARTILE';
}
