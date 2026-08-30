import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoCalendar } from '../src/demo-calendar.mjs';
import { buildGraph, planTraversals } from '../src/graph.mjs';
import { renderContributionGraph } from '../src/svg.mjs';
import { buildTimeline } from '../src/timeline.mjs';

test('renders an animated GitHub-style SVG without scripts', () => {
  const source = createDemoCalendar();
  const graph = buildGraph(source.calendar);
  const timeline = buildTimeline(graph, planTraversals(graph));
  const svg = renderContributionGraph({
    graph,
    timeline,
    theme: 'light',
    owner: source.displayName,
  });

  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(svg, /@keyframes anim-0/);
  assert.match(svg, /class="base-cell level-none"/);
  assert.match(svg, /stroke: #8250df/);
  assert.match(svg, /stroke: #0969da/);
  assert.doesNotMatch(svg, /<script/i);
  assert.equal((svg.match(/class="base-cell /g) ?? []).length, 53 * 7);
});

test('every rendered base edge is horizontal or vertical', () => {
  const source = createDemoCalendar();
  const graph = buildGraph(source.calendar);
  const timeline = buildTimeline(graph, planTraversals(graph));
  const svg = renderContributionGraph({ graph, timeline, theme: 'dark' });
  const paths = [...svg.matchAll(/class="base-edge [^"]+" pathLength="1" d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)"/g)];

  assert.equal(paths.length, graph.edges.length);
  for (const [, x1, y1, x2, y2] of paths) {
    assert.equal(x1 === x2 || y1 === y2, true, `${x1},${y1} -> ${x2},${y2}`);
    assert.equal(x1 === x2 && y1 === y2, false);
  }
});

test('light and dark variants preserve different GitHub palettes', () => {
  const source = createDemoCalendar();
  const graph = buildGraph(source.calendar);
  const timeline = buildTimeline(graph, planTraversals(graph));
  const light = renderContributionGraph({ graph, timeline, theme: 'light' });
  const dark = renderContributionGraph({ graph, timeline, theme: 'dark' });

  assert.match(light, /#ebedf0/);
  assert.match(light, /#216e39/);
  assert.match(dark, /#161b22/);
  assert.match(dark, /#39d353/);
  assert.notEqual(light, dark);
});
