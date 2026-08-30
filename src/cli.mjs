#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { createDemoCalendar } from './demo-calendar.mjs';
import { fetchContributionCalendar } from './github.mjs';
import { buildGraph, planTraversals } from './graph.mjs';
import { renderContributionGraph } from './svg.mjs';
import { buildTimeline } from './timeline.mjs';

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const source = await loadSource(options);
  const graph = buildGraph(source.calendar);
  const traversals = planTraversals(graph);
  const timeline = buildTimeline(graph, traversals);
  const outputDirectory = resolve(options.outputDirectory);

  await mkdir(outputDirectory, { recursive: true });
  const variants = [
    ['github-contribution-graph.svg', 'light'],
    ['github-contribution-graph-dark.svg', 'dark'],
  ];

  for (const [filename, theme] of variants) {
    const svg = renderContributionGraph({
      graph,
      timeline,
      theme,
      owner: source.displayName || source.owner,
    });
    await writeFile(resolve(outputDirectory, filename), svg, 'utf8');
  }

  const dfsCount = traversals.filter(
    (traversal) => traversal.algorithm === 'dfs',
  ).length;
  const bfsCount = traversals.filter(
    (traversal) => traversal.algorithm === 'bfs',
  ).length;
  const isolatedCount = traversals.filter(
    (traversal) => traversal.algorithm === 'isolated',
  ).length;

  console.log(
    [
      `Generated contribution graph for ${source.owner}.`,
      `${graph.nodes.length} active days, ${graph.edges.length} orthogonal edges, ${graph.components.length} components.`,
      `Traversals: ${dfsCount} DFS, ${bfsCount} BFS, ${isolatedCount} isolated.`,
      `Animation duration: ${timeline.duration.toFixed(2)}s.`,
      `Output: ${outputDirectory}`,
    ].join('\n'),
  );
}

async function loadSource(options) {
  if (options.demo) return createDemoCalendar();

  if (options.input) {
    const payload = JSON.parse(
      await readFile(resolve(options.input), 'utf8'),
    );
    const calendar = unwrapCalendar(payload);
    return {
      owner: options.username || payload.owner || 'local-input',
      displayName:
        payload.displayName || options.username || payload.owner || 'GitHub user',
      calendar,
    };
  }

  return fetchContributionCalendar({
    username:
      options.username ||
      process.env.GITHUB_USER ||
      process.env.GITHUB_REPOSITORY_OWNER,
    token:
      process.env.CONTRIBUTIONS_TOKEN || process.env.GITHUB_TOKEN,
  });
}

function parseArguments(argumentsList) {
  const options = {
    demo: false,
    input: null,
    username: null,
    outputDirectory: 'dist',
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--demo') {
      options.demo = true;
      continue;
    }
    if (argument === '--input') {
      options.input = requireValue(argumentsList, ++index, '--input');
      continue;
    }
    if (argument === '--user') {
      options.username = requireValue(argumentsList, ++index, '--user');
      continue;
    }
    if (argument === '--output') {
      options.outputDirectory = requireValue(
        argumentsList,
        ++index,
        '--output',
      );
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.demo && options.input) {
    throw new Error('Choose either --demo or --input, not both.');
  }
  return options;
}

function unwrapCalendar(payload) {
  return (
    payload.calendar ??
    payload.data?.user?.contributionsCollection?.contributionCalendar ??
    payload.contributionsCollection?.contributionCalendar ??
    payload
  );
}

function requireValue(argumentsList, index, option) {
  const value = argumentsList[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} expects a value.`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: node src/cli.mjs [options]

Options:
  --demo              Generate deterministic demonstration data
  --input <file>      Read a contribution calendar JSON file
  --user <login>      GitHub login (defaults to repository owner)
  --output <dir>      Output directory (defaults to dist)
  -h, --help          Show this help

Environment:
  GITHUB_TOKEN        Token used to query GitHub GraphQL
  CONTRIBUTIONS_TOKEN Optional token with read:user for private contributions
  GITHUB_USER         GitHub login override`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
