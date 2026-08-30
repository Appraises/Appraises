const CELL_SIZE = 10;
const CELL_GAP = 3;
const CELL_PITCH = CELL_SIZE + CELL_GAP;
const GRID_LEFT = 31;
const GRID_TOP = 20;

const THEMES = {
  light: {
    level: {
      NONE: '#ebedf0',
      FIRST_QUARTILE: '#9be9a8',
      SECOND_QUARTILE: '#40c463',
      THIRD_QUARTILE: '#30a14e',
      FOURTH_QUARTILE: '#216e39',
    },
    edge: '#d0d7de',
    text: '#57606a',
    dfs: '#8250df',
    bfs: '#0969da',
    current: '#bf8700',
    isolated: '#6e7781',
  },
  dark: {
    level: {
      NONE: '#161b22',
      FIRST_QUARTILE: '#0e4429',
      SECOND_QUARTILE: '#006d32',
      THIRD_QUARTILE: '#26a641',
      FOURTH_QUARTILE: '#39d353',
    },
    edge: '#30363d',
    text: '#8b949e',
    dfs: '#a371f7',
    bfs: '#58a6ff',
    current: '#d29922',
    isolated: '#8b949e',
  },
};

export function renderContributionGraph({
  graph,
  timeline,
  theme = 'light',
  owner = 'GitHub user',
}) {
  const palette = THEMES[theme];
  if (!palette) throw new Error(`Unknown SVG theme: ${theme}`);

  const weekCount = graph.calendar.weeks.length;
  const gridWidth = Math.max(0, weekCount * CELL_PITCH - CELL_GAP);
  const gridHeight = 7 * CELL_PITCH - CELL_GAP;
  const width = GRID_LEFT + gridWidth + 5;
  const height = GRID_TOP + gridHeight + 7;
  const animations = createAnimationRegistry(timeline.duration);

  const baseEdges = renderBaseEdges(graph, timeline, animations);
  const traversalLayers = renderTraversalLayers(
    graph,
    timeline,
    animations,
  );
  const baseCells = renderBaseCells(graph, palette);
  const labels = renderCalendarLabels(graph, palette);
  const metadata = {
    owner,
    activeDays: graph.nodes.length,
    edges: graph.edges.length,
    components: graph.components.length,
    durationSeconds: Number(timeline.duration.toFixed(3)),
  };

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="graph-title graph-description">`,
    `<title id="graph-title">${escapeXml(owner)}'s GitHub contribution graph</title>`,
    `<desc id="graph-description">Contribution days are connected only to orthogonal neighbors. Connected components alternate between depth-first and breadth-first traversal.</desc>`,
    `<metadata>${escapeXml(JSON.stringify(metadata))}</metadata>`,
    '<style>',
    renderStyles(palette, timeline.duration),
    animations.css(),
    '</style>',
    labels,
    `<g class="base-edges" aria-hidden="true">${baseEdges}</g>`,
    `<g class="traversal-edges" aria-hidden="true">${traversalLayers.edges}</g>`,
    `<g class="base-cells" aria-hidden="true">${baseCells}</g>`,
    `<g class="node-overlays" aria-hidden="true">${traversalLayers.nodes}</g>`,
    `<g class="cursors" aria-hidden="true">${traversalLayers.cursors}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

function renderStyles(palette, duration) {
  const levelRules = Object.entries(palette.level)
    .map(([level, color]) => `.level-${level.toLowerCase()} { fill: ${color}; }`)
    .join('\n');

  return `
    :root { --animation-duration: ${formatNumber(duration)}s; }
    text {
      fill: ${palette.text};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 9px;
    }
    .base-cell { shape-rendering: geometricPrecision; }
    ${levelRules}
    .base-edge,
    .traversal-edge,
    .backtrack-edge {
      fill: none;
      stroke-linecap: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
    }
    .base-edge { stroke: ${palette.edge}; stroke-width: 1.35; }
    .traversal-edge { stroke-width: 2; }
    .traversal-edge.dfs, .node-overlay.dfs { stroke: ${palette.dfs}; }
    .traversal-edge.bfs, .node-overlay.bfs { stroke: ${palette.bfs}; }
    .backtrack-edge { stroke: ${palette.current}; stroke-width: 2.2; }
    .node-overlay {
      fill: none;
      stroke-width: 1.6;
      shape-rendering: geometricPrecision;
    }
    .cursor {
      fill: none;
      stroke: ${palette.current};
      stroke-width: 2;
      shape-rendering: geometricPrecision;
    }
    .cursor.bfs { fill: ${palette.current}; fill-opacity: .22; }
    .isolated-cursor { fill: none; stroke: ${palette.isolated}; stroke-width: 1.8; }
    .animated {
      animation-duration: var(--animation-duration);
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .animated { animation: none !important; }
      .base-edge { opacity: .32 !important; stroke-dashoffset: 0 !important; }
      .traversal-edge, .backtrack-edge, .node-overlay, .cursor {
        opacity: 0 !important;
      }
    }
  `;
}

function renderBaseEdges(graph, timeline, animations) {
  return graph.edges
    .map((edge) => {
      const timing = timeline.edgeRevealTimes.get(edge.id) ?? {
        start: timeline.revealStart,
        end: timeline.revealEnd,
      };
      const animation = animations.add([
        frame(0, { opacity: 0, 'stroke-dashoffset': 1 }),
        frame(timing.start, { opacity: 0, 'stroke-dashoffset': 1 }),
        frame(timing.end, { opacity: 0.42, 'stroke-dashoffset': 0 }),
        frame(timeline.fadeStart, {
          opacity: 0.42,
          'stroke-dashoffset': 0,
        }),
        frame(timeline.fadeEnd, { opacity: 0, 'stroke-dashoffset': 0 }),
        frame(timeline.duration, { opacity: 0, 'stroke-dashoffset': 1 }),
      ]);
      return renderPath(graph, edge.from, edge.to, `base-edge ${animation}`);
    })
    .join('');
}

function renderTraversalLayers(graph, timeline, animations) {
  const edges = [];
  const nodes = [];
  const cursors = [];

  for (const traversal of timeline.traversals) {
    for (const [nodeId, visitTime] of traversal.visitTimes) {
      const node = graph.nodeById.get(nodeId);
      const animation = animations.add(
        persistentFrames(
          visitTime,
          Math.min(visitTime + 0.07, timeline.fadeStart),
          timeline,
          { opacity: 0 },
          { opacity: 1 },
        ),
      );
      nodes.push(
        renderRect(
          node,
          `node-overlay ${traversal.algorithm} ${animation}`,
        ),
      );
    }

    for (const edge of traversal.treeEdges) {
      const animation = animations.add(
        persistentFrames(
          edge.start,
          edge.end,
          timeline,
          { opacity: 0, 'stroke-dashoffset': 1 },
          { opacity: 0.92, 'stroke-dashoffset': 0 },
        ),
      );
      edges.push(
        renderPath(
          graph,
          edge.from,
          edge.to,
          `traversal-edge ${traversal.algorithm} ${animation}`,
        ),
      );
    }

    if (traversal.algorithm === 'dfs') {
      cursors.push(renderDfsCursor(graph, traversal, timeline, animations));
      for (const backtrack of traversal.backtracks) {
        const animation = animations.add([
          frame(0, { opacity: 0, 'stroke-dashoffset': 1 }),
          frame(backtrack.start, { opacity: 0, 'stroke-dashoffset': 1 }),
          frame(backtrack.end, { opacity: 0.95, 'stroke-dashoffset': 0 }),
          frame(Math.min(backtrack.end + 0.055, timeline.fadeStart), {
            opacity: 0,
            'stroke-dashoffset': 0,
          }),
          frame(timeline.duration, { opacity: 0, 'stroke-dashoffset': 1 }),
        ]);
        edges.push(
          renderPath(
            graph,
            backtrack.from,
            backtrack.to,
            `backtrack-edge ${animation}`,
          ),
        );
      }
    } else {
      for (const pulse of traversal.currentPulses) {
        const node = graph.nodeById.get(pulse.nodeId);
        const animation = animations.add(pulseFrames(pulse, timeline));
        cursors.push(renderRect(node, `cursor bfs ${animation}`, 1));
      }
    }
  }

  if (timeline.isolatedPulse) {
    for (const nodeId of timeline.isolatedPulse.nodeIds) {
      const node = graph.nodeById.get(nodeId);
      const animation = animations.add(
        pulseFrames(timeline.isolatedPulse, timeline),
      );
      cursors.push(renderRect(node, `cursor isolated-cursor ${animation}`, 1));
    }
  }

  return {
    edges: edges.join(''),
    nodes: nodes.join(''),
    cursors: cursors.join(''),
  };
}

function renderDfsCursor(graph, traversal, timeline, animations) {
  const root = graph.nodeById.get(traversal.rootId);
  const frames = [
    frame(0, { opacity: 0, transform: 'translate(0px, 0px)' }),
    frame(traversal.start, {
      opacity: 0,
      transform: 'translate(0px, 0px)',
    }),
    frame(traversal.start + 0.012, {
      opacity: 1,
      transform: 'translate(0px, 0px)',
    }),
  ];

  for (const point of traversal.cursorPoints.slice(1)) {
    const node = graph.nodeById.get(point.nodeId);
    const deltaX = (node.weekIndex - root.weekIndex) * CELL_PITCH;
    const deltaY = (node.weekday - root.weekday) * CELL_PITCH;
    frames.push(
      frame(point.time, {
        opacity: 1,
        transform: `translate(${deltaX}px, ${deltaY}px)`,
      }),
    );
  }

  frames.push(
    frame(traversal.end, { opacity: 1 }),
    frame(Math.min(traversal.end + 0.07, timeline.fadeStart), { opacity: 0 }),
    frame(timeline.duration, { opacity: 0 }),
  );

  const animation = animations.add(frames);
  return renderRect(root, `cursor dfs ${animation}`, 1);
}

function renderBaseCells(graph) {
  return graph.cells
    .map(
      (cell) =>
        `<rect class="base-cell level-${cell.contributionLevel.toLowerCase()}" x="${cellX(
          cell,
        )}" y="${cellY(cell)}" width="${CELL_SIZE}" height="${
          CELL_SIZE
        }" rx="2"/>`,
    )
    .join('');
}

function renderCalendarLabels(graph) {
  const dayLabels = [
    [1, 'Mon'],
    [3, 'Wed'],
    [5, 'Fri'],
  ]
    .map(
      ([weekday, label]) =>
        `<text x="0" y="${cellY({ weekday }) + 8}">${label}</text>`,
    )
    .join('');

  const monthLabels = [];
  let previousMonth = null;
  for (const week of graph.calendar.weeks) {
    const firstCell = week.contributionDays.find(Boolean);
    if (!firstCell) continue;
    const date = new Date(`${firstCell.date}T00:00:00Z`);
    const month = date.getUTCMonth();
    if (month === previousMonth) continue;
    previousMonth = month;
    const label = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
    monthLabels.push(
      `<text x="${cellX(firstCell)}" y="10">${label}</text>`,
    );
  }

  return `<g class="calendar-labels" aria-hidden="true">${monthLabels.join(
    '',
  )}${dayLabels}</g>`;
}

function renderPath(graph, fromId, toId, className) {
  const from = graph.nodeById.get(fromId);
  const to = graph.nodeById.get(toId);
  const startX = cellX(from) + CELL_SIZE / 2;
  const startY = cellY(from) + CELL_SIZE / 2;
  const endX = cellX(to) + CELL_SIZE / 2;
  const endY = cellY(to) + CELL_SIZE / 2;
  return `<path class="${className}" pathLength="1" d="M ${startX} ${startY} L ${endX} ${endY}"/>`;
}

function renderRect(node, className, outset = 0) {
  const size = CELL_SIZE + outset * 2;
  return `<rect class="${className}" x="${cellX(node) - outset}" y="${
    cellY(node) - outset
  }" width="${size}" height="${size}" rx="${2 + outset * 0.6}"/>`;
}

function persistentFrames(start, end, timeline, hidden, visible) {
  return [
    frame(0, hidden),
    frame(start, hidden),
    frame(end, visible),
    frame(timeline.fadeStart, visible),
    frame(timeline.fadeEnd, { ...visible, opacity: 0 }),
    frame(timeline.duration, hidden),
  ];
}

function pulseFrames(pulse, timeline) {
  const ramp = Math.min(0.035, (pulse.end - pulse.start) / 3);
  return [
    frame(0, { opacity: 0 }),
    frame(pulse.start, { opacity: 0 }),
    frame(pulse.start + ramp, { opacity: 0.88 }),
    frame(Math.max(pulse.start + ramp, pulse.end - ramp), { opacity: 0.88 }),
    frame(pulse.end, { opacity: 0 }),
    frame(timeline.duration, { opacity: 0 }),
  ];
}

function createAnimationRegistry(duration) {
  const rules = [];
  let nextId = 0;

  return {
    add(frames) {
      const name = `anim-${nextId}`;
      nextId += 1;
      const normalized = normalizeFrames(frames, duration);
      const body = normalized
        .map(
          ({ time, properties }) =>
            `${formatPercent((time / duration) * 100)}% { ${Object.entries(
              properties,
            )
              .map(([property, value]) => `${property}: ${value};`)
              .join(' ')} }`,
        )
        .join(' ');
      rules.push(`.${name} { animation-name: ${name}; } @keyframes ${name} { ${body} }`);
      return `animated ${name}`;
    },
    css() {
      return rules.join('\n');
    },
  };
}

function normalizeFrames(frames, duration) {
  const byTime = new Map();
  for (const candidate of frames) {
    const time = Math.max(0, Math.min(duration, candidate.time));
    const key = time.toFixed(6);
    byTime.set(key, {
      time,
      properties: {
        ...(byTime.get(key)?.properties ?? {}),
        ...candidate.properties,
      },
    });
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function frame(time, properties) {
  return { time, properties };
}

function cellX(cell) {
  return GRID_LEFT + cell.weekIndex * CELL_PITCH;
}

function cellY(cell) {
  return GRID_TOP + cell.weekday * CELL_PITCH;
}

function formatNumber(value) {
  return Number(value.toFixed(3));
}

function formatPercent(value) {
  return Number(value.toFixed(4));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
