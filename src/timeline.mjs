export function buildTimeline(graph, traversals) {
  const revealStart = 0.9;
  const revealEnd = 3.0;
  const traversalStart = 3.35;
  const nonIsolated = traversals.filter(
    (traversal) => traversal.algorithm !== 'isolated',
  );
  const isolated = traversals.filter(
    (traversal) => traversal.algorithm === 'isolated',
  );

  const rawTraversalDuration = nonIsolated.reduce((total, traversal) => {
    if (traversal.algorithm === 'dfs') {
      return total + Math.max(0.5, traversal.moves.length * 0.085) + 0.24;
    }
    return total + Math.max(0.55, traversal.levels.length * 0.3) + 0.24;
  }, 0);

  const speedScale = calculateSpeedScale(rawTraversalDuration);
  const edgeRevealTimes = new Map();
  const sortedEdges = [...graph.edges].sort((left, right) => {
    const leftMidpoint = edgeMidpoint(graph, left);
    const rightMidpoint = edgeMidpoint(graph, right);
    return (
      leftMidpoint.week - rightMidpoint.week ||
      leftMidpoint.day - rightMidpoint.day ||
      left.id.localeCompare(right.id)
    );
  });

  sortedEdges.forEach((edge, index) => {
    const progress = sortedEdges.length <= 1 ? 0 : index / (sortedEdges.length - 1);
    const start = revealStart + progress * (revealEnd - revealStart - 0.15);
    edgeRevealTimes.set(edge.id, { start, end: start + 0.15 });
  });

  let time = traversalStart;
  const scheduledTraversals = [];

  for (const traversal of nonIsolated) {
    const scheduled =
      traversal.algorithm === 'dfs'
        ? scheduleDfs(traversal, time, speedScale)
        : scheduleBfs(traversal, time, speedScale);
    scheduledTraversals.push(scheduled);
    time = scheduled.end + 0.24 * speedScale;
  }

  let isolatedPulse = null;
  if (isolated.length > 0) {
    const start = time + 0.08;
    isolatedPulse = {
      nodeIds: isolated.map((traversal) => traversal.rootId),
      start,
      end: start + Math.max(0.34, 0.48 * speedScale),
    };
    time = isolatedPulse.end + 0.16;
  }

  const fadeStart = Math.max(time + 0.35, traversalStart + 1.4);
  const fadeEnd = fadeStart + 0.8;
  const duration = fadeEnd + 1.1;

  return {
    duration,
    revealStart,
    revealEnd,
    traversalStart,
    fadeStart,
    fadeEnd,
    speedScale,
    edgeRevealTimes,
    traversals: scheduledTraversals,
    isolatedPulse,
  };
}

function scheduleDfs(traversal, start, speedScale) {
  const step = Math.max(0.036, 0.085 * speedScale);
  const visitTimes = new Map([[traversal.rootId, start + 0.025]]);
  const treeEdges = [];
  const backtracks = [];
  const cursorPoints = [{ nodeId: traversal.rootId, time: start }];
  let time = start;

  for (const move of traversal.moves) {
    const moveStart = time;
    const moveEnd = moveStart + step;
    cursorPoints.push({ nodeId: move.to, time: moveEnd });

    if (move.kind === 'forward') {
      visitTimes.set(move.to, moveEnd);
      treeEdges.push({
        from: move.from,
        to: move.to,
        start: moveStart,
        end: moveEnd,
      });
    } else {
      backtracks.push({
        from: move.from,
        to: move.to,
        start: moveStart,
        end: moveEnd,
      });
    }
    time = moveEnd;
  }

  const end = Math.max(time + 0.12 * speedScale, start + 0.42);
  return {
    ...traversal,
    start,
    end,
    visitTimes,
    treeEdges,
    backtracks,
    cursorPoints,
  };
}

function scheduleBfs(traversal, start, speedScale) {
  const levelStep = Math.max(0.14, 0.3 * speedScale);
  const pulseDuration = Math.max(0.11, 0.21 * speedScale);
  const visitTimes = new Map();
  const currentPulses = [];
  const treeEdges = [];

  traversal.levels.forEach((nodeIds, level) => {
    const levelTime = start + level * levelStep;
    for (const nodeId of nodeIds) {
      visitTimes.set(nodeId, levelTime);
      currentPulses.push({
        nodeId,
        start: levelTime,
        end: levelTime + pulseDuration,
      });
    }
  });

  for (const edge of traversal.treeEdges) {
    const end = start + edge.level * levelStep;
    treeEdges.push({
      from: edge.from,
      to: edge.to,
      start: Math.max(start, end - levelStep * 0.65),
      end,
    });
  }

  const end =
    start + Math.max(0, traversal.levels.length - 1) * levelStep + pulseDuration;
  return {
    ...traversal,
    start,
    end: Math.max(end, start + 0.5),
    visitTimes,
    treeEdges,
    currentPulses,
  };
}

function calculateSpeedScale(rawDuration) {
  if (rawDuration === 0) return 1;
  if (rawDuration < 7) return Math.min(1.35, 7 / rawDuration);
  if (rawDuration > 24) return Math.max(0.45, 24 / rawDuration);
  return 1;
}

function edgeMidpoint(graph, edge) {
  const from = graph.nodeById.get(edge.from);
  const to = graph.nodeById.get(edge.to);
  return {
    week: (from.weekIndex + to.weekIndex) / 2,
    day: (from.weekday + to.weekday) / 2,
  };
}
