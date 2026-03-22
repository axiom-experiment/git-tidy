'use strict';

/**
 * git-tidy test suite — 60+ tests.
 *
 * This file covers:
 *   - lib/config.js       (pure data, no mocking needed)
 *   - lib/branches.js     (pure functions, no mocking needed)
 *   - lib/formatter.js    (pure functions, no mocking needed)
 *   - index.js API        (mocks ../lib/git)
 *
 * git.js tests with child_process mocking live in git.test.js
 * to avoid hoisting conflicts between jest.mock calls.
 */

// ─── lib/config.js ───────────────────────────────────────────────────────────

describe('lib/config.js', () => {
  const { DEFAULT_PROTECTED, DEFAULT_OPTIONS, COLORS, useColor } = require('../lib/config');

  test('DEFAULT_PROTECTED includes main', () => {
    expect(DEFAULT_PROTECTED).toContain('main');
  });

  test('DEFAULT_PROTECTED includes master', () => {
    expect(DEFAULT_PROTECTED).toContain('master');
  });

  test('DEFAULT_PROTECTED includes develop', () => {
    expect(DEFAULT_PROTECTED).toContain('develop');
  });

  test('DEFAULT_PROTECTED includes dev', () => {
    expect(DEFAULT_PROTECTED).toContain('dev');
  });

  test('DEFAULT_PROTECTED includes staging', () => {
    expect(DEFAULT_PROTECTED).toContain('staging');
  });

  test('DEFAULT_PROTECTED includes production', () => {
    expect(DEFAULT_PROTECTED).toContain('production');
  });

  test('DEFAULT_PROTECTED includes release', () => {
    expect(DEFAULT_PROTECTED).toContain('release');
  });

  test('DEFAULT_PROTECTED is an array', () => {
    expect(Array.isArray(DEFAULT_PROTECTED)).toBe(true);
  });

  test('DEFAULT_OPTIONS.olderThan is 90', () => {
    expect(DEFAULT_OPTIONS.olderThan).toBe(90);
  });

  test('DEFAULT_OPTIONS.json is false', () => {
    expect(DEFAULT_OPTIONS.json).toBe(false);
  });

  test('DEFAULT_OPTIONS.dryRun is false', () => {
    expect(DEFAULT_OPTIONS.dryRun).toBe(false);
  });

  test('DEFAULT_OPTIONS.force is false', () => {
    expect(DEFAULT_OPTIONS.force).toBe(false);
  });

  test('DEFAULT_OPTIONS.base is null', () => {
    expect(DEFAULT_OPTIONS.base).toBeNull();
  });

  test('COLORS.reset is defined', () => {
    expect(COLORS.reset).toBeTruthy();
  });

  test('COLORS.green is defined', () => {
    expect(COLORS.green).toBeTruthy();
  });

  test('useColor returns a boolean', () => {
    const result = useColor();
    expect(typeof result).toBe('boolean');
  });
});

// ─── lib/branches.js ─────────────────────────────────────────────────────────

describe('lib/branches.js — parseBranchLine', () => {
  const { parseBranchLine } = require('../lib/branches');

  test('parses a basic branch line correctly', () => {
    const result = parseBranchLine('feature/my-branch|||2024-01-15 10:23:44 +0000|||');
    expect(result).not.toBeNull();
    expect(result.name).toBe('feature/my-branch');
    expect(result.lastCommit).toBeInstanceOf(Date);
    expect(result.upstreamGone).toBe(false);
  });

  test('detects [gone] upstream', () => {
    const result = parseBranchLine('old-branch|||2023-06-01 08:00:00 +0000|||[gone]');
    expect(result.upstreamGone).toBe(true);
  });

  test('returns null for empty string', () => {
    expect(parseBranchLine('')).toBeNull();
  });

  test('returns null for null input', () => {
    expect(parseBranchLine(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(parseBranchLine(undefined)).toBeNull();
  });

  test('handles missing date gracefully', () => {
    const result = parseBranchLine('feature/no-date|||  |||');
    expect(result).not.toBeNull();
    expect(result.lastCommit).toBeNull();
  });

  test('handles branch with no upstream section', () => {
    const result = parseBranchLine('feature/thing|||2024-03-01 00:00:00 +0000');
    expect(result).not.toBeNull();
    expect(result.upstreamGone).toBe(false);
  });

  test('raw property equals original line', () => {
    const line = 'main|||2024-01-01 00:00:00 +0000|||';
    const result = parseBranchLine(line);
    expect(result.raw).toBe(line);
  });
});

describe('lib/branches.js — isProtected', () => {
  const { isProtected } = require('../lib/branches');
  const protectedList = ['main', 'master', 'develop'];

  test('returns true for protected branch', () => {
    expect(isProtected('main', protectedList)).toBe(true);
  });

  test('returns true for master', () => {
    expect(isProtected('master', protectedList)).toBe(true);
  });

  test('returns false for unprotected branch', () => {
    expect(isProtected('feature/my-thing', protectedList)).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(isProtected('MAIN', protectedList)).toBe(true);
    expect(isProtected('Main', protectedList)).toBe(true);
  });

  test('returns false for empty name', () => {
    expect(isProtected('', protectedList)).toBe(false);
  });

  test('returns false for null protected list', () => {
    expect(isProtected('main', null)).toBe(false);
  });

  test('returns false for empty protected list', () => {
    expect(isProtected('main', [])).toBe(false);
  });
});

describe('lib/branches.js — getDaysSince', () => {
  const { getDaysSince } = require('../lib/branches');

  test('returns Infinity for null', () => {
    expect(getDaysSince(null)).toBe(Infinity);
  });

  test('returns Infinity for undefined', () => {
    expect(getDaysSince(undefined)).toBe(Infinity);
  });

  test('returns Infinity for invalid date', () => {
    expect(getDaysSince('not-a-date')).toBe(Infinity);
  });

  test('returns 0 for today', () => {
    const today = new Date();
    expect(getDaysSince(today)).toBe(0);
  });

  test('returns correct days for a known past date', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    expect(getDaysSince(tenDaysAgo)).toBe(10);
  });

  test('accepts a Date object', () => {
    const date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(getDaysSince(date)).toBe(5);
  });

  test('accepts an ISO string', () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(getDaysSince(date.toISOString())).toBe(3);
  });
});

describe('lib/branches.js — filterByAge', () => {
  const { filterByAge } = require('../lib/branches');

  const makeBranch = (name, daysOld) => ({
    name,
    lastCommit: new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
  });

  test('filters branches older than threshold', () => {
    const branches = [makeBranch('a', 10), makeBranch('b', 40), makeBranch('c', 100)];
    const result = filterByAge(branches, 30);
    expect(result.map(b => b.name)).toEqual(['b', 'c']);
  });

  test('returns empty array for empty input', () => {
    expect(filterByAge([], 30)).toEqual([]);
  });

  test('returns empty array for null input', () => {
    expect(filterByAge(null, 30)).toEqual([]);
  });

  test('returns all branches when threshold is 0', () => {
    const branches = [makeBranch('a', 1), makeBranch('b', 2)];
    expect(filterByAge(branches, 0)).toHaveLength(2);
  });

  test('returns empty when all branches are within threshold', () => {
    const branches = [makeBranch('a', 1), makeBranch('b', 2)];
    expect(filterByAge(branches, 30)).toHaveLength(0);
  });
});

describe('lib/branches.js — filterByMerged', () => {
  const { filterByMerged } = require('../lib/branches');

  const branches = [
    { name: 'feature/a' },
    { name: 'feature/b' },
    { name: 'feature/c' }
  ];

  test('returns only merged branches', () => {
    const result = filterByMerged(branches, ['feature/a', 'feature/c']);
    expect(result.map(b => b.name)).toEqual(['feature/a', 'feature/c']);
  });

  test('returns empty array when no branches match', () => {
    const result = filterByMerged(branches, ['nonexistent']);
    expect(result).toHaveLength(0);
  });

  test('returns empty array for empty mergedNames', () => {
    expect(filterByMerged(branches, [])).toHaveLength(0);
  });

  test('returns empty array for null input', () => {
    expect(filterByMerged(null, ['a'])).toHaveLength(0);
  });

  test('is case-insensitive', () => {
    const result = filterByMerged(branches, ['FEATURE/A']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('feature/a');
  });
});

describe('lib/branches.js — sortByAge', () => {
  const { sortByAge } = require('../lib/branches');

  const makeB = (name, daysOld) => ({
    name,
    lastCommit: daysOld === null ? null : new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)
  });

  test('sorts oldest first', () => {
    const branches = [makeB('new', 5), makeB('old', 100), makeB('medium', 30)];
    const sorted = sortByAge(branches);
    expect(sorted[0].name).toBe('old');
    expect(sorted[1].name).toBe('medium');
    expect(sorted[2].name).toBe('new');
  });

  test('does not mutate original array', () => {
    const branches = [makeB('a', 10), makeB('b', 20)];
    sortByAge(branches);
    expect(branches[0].name).toBe('a'); // original order preserved
  });

  test('returns empty array for empty input', () => {
    expect(sortByAge([])).toEqual([]);
  });

  test('handles null input', () => {
    expect(sortByAge(null)).toEqual([]);
  });

  test('sorts branches with null dates to end', () => {
    const branches = [makeB('nodates', null), makeB('old', 100)];
    const sorted = sortByAge(branches);
    expect(sorted[0].name).toBe('old');
    expect(sorted[1].name).toBe('nodates');
  });
});

describe('lib/branches.js — parseBranchOutput', () => {
  const { parseBranchOutput } = require('../lib/branches');

  test('parses multi-line output', () => {
    const output = [
      'main|||2024-01-01 00:00:00 +0000|||',
      'feature/a|||2024-02-01 00:00:00 +0000|||',
      'feature/b|||2024-03-01 00:00:00 +0000|||[gone]'
    ].join('\n');
    const result = parseBranchOutput(output);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('main');
    expect(result[2].upstreamGone).toBe(true);
  });

  test('skips empty lines', () => {
    const output = 'feature/a|||2024-01-01 00:00:00 +0000|||\n\nfeature/b|||2024-02-01 00:00:00 +0000|||';
    const result = parseBranchOutput(output);
    expect(result).toHaveLength(2);
  });

  test('returns empty array for empty string', () => {
    expect(parseBranchOutput('')).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(parseBranchOutput(null)).toEqual([]);
  });
});

// ─── lib/formatter.js ─────────────────────────────────────────────────────────

describe('lib/formatter.js — formatAge', () => {
  const { formatAge } = require('../lib/formatter');

  test('formats 0 as "today"', () => {
    expect(formatAge(0)).toBe('today');
  });

  test('formats 1 as "1 day ago"', () => {
    expect(formatAge(1)).toBe('1 day ago');
  });

  test('formats 30 as "30 days ago"', () => {
    expect(formatAge(30)).toBe('30 days ago');
  });

  test('formats 365 as "1 year ago"', () => {
    expect(formatAge(365)).toBe('1 year ago');
  });

  test('formats 400 with years and days', () => {
    const result = formatAge(400);
    expect(result).toContain('year');
    expect(result).toContain('day');
  });

  test('formats Infinity as "unknown"', () => {
    expect(formatAge(Infinity)).toBe('unknown');
  });

  test('formats negative as "unknown"', () => {
    expect(formatAge(-5)).toBe('unknown');
  });
});

describe('lib/formatter.js — formatSummary', () => {
  const { formatSummary } = require('../lib/formatter');

  test('shows "tidy" message when no stale branches', () => {
    const result = formatSummary({ total: 5, stale: 0, merged: 0, old: 0 });
    expect(result).toMatch(/tidy/i);
  });

  test('shows stale count when branches exist', () => {
    const result = formatSummary({ total: 10, stale: 3, merged: 2, old: 1 });
    expect(result).toContain('3');
  });

  test('includes merged count in output', () => {
    const result = formatSummary({ total: 10, stale: 3, merged: 2, old: 1 });
    expect(result).toContain('2');
  });

  test('includes old count in output', () => {
    const result = formatSummary({ total: 10, stale: 3, merged: 0, old: 3 });
    expect(result).toContain('3');
  });

  test('handles zero defaults gracefully', () => {
    expect(() => formatSummary({})).not.toThrow();
  });
});

describe('lib/formatter.js — formatDryRun', () => {
  const { formatDryRun } = require('../lib/formatter');

  const makeBranch = (name, merged = true) => ({
    name,
    ageInDays: 45,
    merged,
    lastCommit: new Date()
  });

  test('shows DRY RUN header', () => {
    const result = formatDryRun([makeBranch('feature/a')]);
    expect(result).toMatch(/dry run/i);
  });

  test('lists branch names', () => {
    const result = formatDryRun([makeBranch('feature/my-branch')]);
    expect(result).toContain('feature/my-branch');
  });

  test('shows count of branches', () => {
    const result = formatDryRun([makeBranch('a'), makeBranch('b')]);
    expect(result).toContain('2');
  });

  test('shows "Nothing to delete" for empty array', () => {
    const result = formatDryRun([]);
    expect(result).toMatch(/nothing/i);
  });

  test('handles null input', () => {
    const result = formatDryRun(null);
    expect(result).toMatch(/nothing/i);
  });
});

describe('lib/formatter.js — formatDeleted', () => {
  const { formatDeleted } = require('../lib/formatter');

  test('shows success for deleted branch', () => {
    const result = formatDeleted([{ branch: 'feature/a', deleted: true, error: null }]);
    expect(result).toContain('feature/a');
  });

  test('shows failure for un-deleted branch', () => {
    const result = formatDeleted([{ branch: 'feature/b', deleted: false, error: new Error('not merged') }]);
    expect(result).toContain('feature/b');
  });

  test('shows count of successes', () => {
    const results = [
      { branch: 'a', deleted: true, error: null },
      { branch: 'b', deleted: true, error: null }
    ];
    const output = formatDeleted(results);
    expect(output).toContain('2');
  });

  test('returns "Nothing was deleted" for empty array', () => {
    const result = formatDeleted([]);
    expect(result).toMatch(/nothing/i);
  });
});

describe('lib/formatter.js — formatBranchTable', () => {
  const { formatBranchTable } = require('../lib/formatter');

  const branches = [
    { name: 'feature/a', ageInDays: 45, merged: true, upstreamGone: false, isCurrent: false, isOld: false },
    { name: 'feature/b', ageInDays: 120, merged: false, upstreamGone: true, isCurrent: false, isOld: true }
  ];

  test('includes branch names', () => {
    const result = formatBranchTable(branches);
    expect(result).toContain('feature/a');
    expect(result).toContain('feature/b');
  });

  test('shows header row', () => {
    const result = formatBranchTable(branches);
    expect(result).toMatch(/branch/i);
  });

  test('returns "No branches found" for empty input', () => {
    const result = formatBranchTable([]);
    expect(result).toMatch(/no branches/i);
  });
});

describe('lib/formatter.js — formatError', () => {
  const { formatError } = require('../lib/formatter');

  test('includes error message', () => {
    const result = formatError(new Error('something went wrong'));
    expect(result).toContain('something went wrong');
  });

  test('handles string input', () => {
    const result = formatError('plain error');
    expect(result).toContain('plain error');
  });
});

// ─── index.js API (mocked lib/git) ───────────────────────────────────────────

jest.mock('../lib/git');

describe('index.js — isGitAvailable', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns true when git is available', async () => {
    gitLib.checkGitAvailable.mockReturnValue(true);
    expect(await api.isGitAvailable()).toBe(true);
  });

  test('returns false when git is unavailable', async () => {
    gitLib.checkGitAvailable.mockReturnValue(false);
    expect(await api.isGitAvailable()).toBe(false);
  });
});

describe('index.js — getCurrentBranch', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns current branch name', async () => {
    gitLib.getCurrentBranch.mockReturnValue('feature/active');
    expect(await api.getCurrentBranch()).toBe('feature/active');
  });
});

describe('index.js — getBranches', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns array of branches', async () => {
    gitLib.getBranchList.mockReturnValue(
      'main|||2024-01-01 00:00:00 +0000|||\nfeature/a|||2024-02-15 00:00:00 +0000|||'
    );
    gitLib.getCurrentBranch.mockReturnValue('main');
    const result = await api.getBranches();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  test('returns empty array when no branches', async () => {
    gitLib.getBranchList.mockReturnValue('');
    gitLib.getCurrentBranch.mockReturnValue('');
    const result = await api.getBranches();
    expect(result).toEqual([]);
  });

  test('marks current branch correctly', async () => {
    gitLib.getBranchList.mockReturnValue('main|||2024-01-01 00:00:00 +0000|||');
    gitLib.getCurrentBranch.mockReturnValue('main');
    const result = await api.getBranches();
    expect(result[0].isCurrent).toBe(true);
  });
});

describe('index.js — deleteBranch', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('refuses to delete a protected branch', async () => {
    gitLib.getCurrentBranch.mockReturnValue('feature/other');
    const result = await api.deleteBranch('main');
    expect(result.deleted).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('refuses to delete the current branch', async () => {
    gitLib.getCurrentBranch.mockReturnValue('feature/active');
    const result = await api.deleteBranch('feature/active');
    expect(result.deleted).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('returns deleted: true on success', async () => {
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.deleteBranch.mockReturnValue('Deleted branch feature/old.');
    const result = await api.deleteBranch('feature/old');
    expect(result.deleted).toBe(true);
    expect(result.error).toBeNull();
  });

  test('returns deleted: false on git error', async () => {
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.deleteBranch.mockImplementation(() => { throw new Error('not merged'); });
    const result = await api.deleteBranch('feature/old');
    expect(result.deleted).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  test('throws TypeError for missing branchName', async () => {
    await expect(api.deleteBranch()).rejects.toThrow(TypeError);
  });
});

describe('index.js — getBranchInfo', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns branch info object', async () => {
    gitLib.getBranchList.mockReturnValue('feature/a|||2024-01-15 10:00:00 +0000|||');
    gitLib.getCurrentBranch.mockReturnValue('main');
    const info = await api.getBranchInfo('feature/a');
    expect(info.name).toBe('feature/a');
    expect(typeof info.ageInDays).toBe('number');
    expect(info.isCurrent).toBe(false);
  });

  test('throws when branch not found', async () => {
    gitLib.getBranchList.mockReturnValue('main|||2024-01-01 00:00:00 +0000|||');
    gitLib.getCurrentBranch.mockReturnValue('main');
    await expect(api.getBranchInfo('nonexistent')).rejects.toThrow('Branch not found');
  });

  test('throws TypeError when branchName is missing', async () => {
    await expect(api.getBranchInfo()).rejects.toThrow(TypeError);
  });
});

describe('index.js — getStaleBranches', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns stale branches sorted oldest first', async () => {
    const raw = [
      'main|||2024-01-01 00:00:00 +0000|||',
      'feature/old|||2020-01-01 00:00:00 +0000|||',
      'feature/recent|||2024-11-01 00:00:00 +0000|||'
    ].join('\n');
    gitLib.getBranchList.mockReturnValue(raw);
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.getMergedBranches.mockReturnValue(['feature/old']);

    const result = await api.getStaleBranches({ mergedInto: 'main', olderThan: 30 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('feature/old');
  });

  test('excludes protected branches', async () => {
    const raw = 'main|||2020-01-01 00:00:00 +0000|||\ndevelop|||2020-01-01 00:00:00 +0000|||';
    gitLib.getBranchList.mockReturnValue(raw);
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.getMergedBranches.mockReturnValue(['main', 'develop']);

    const result = await api.getStaleBranches({ mergedInto: 'main' });
    const names = result.map(b => b.name);
    expect(names).not.toContain('main');
    expect(names).not.toContain('develop');
  });

  test('excludes current branch', async () => {
    const raw = 'feature/active|||2020-01-01 00:00:00 +0000|||';
    gitLib.getBranchList.mockReturnValue(raw);
    gitLib.getCurrentBranch.mockReturnValue('feature/active');
    gitLib.getMergedBranches.mockReturnValue(['feature/active']);

    const result = await api.getStaleBranches({ mergedInto: 'main' });
    expect(result.map(b => b.name)).not.toContain('feature/active');
  });

  test('returns empty array when all branches are protected', async () => {
    const raw = 'main|||2020-01-01 00:00:00 +0000|||\nmaster|||2020-01-01 00:00:00 +0000|||';
    gitLib.getBranchList.mockReturnValue(raw);
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.getMergedBranches.mockReturnValue(['main', 'master']);

    const result = await api.getStaleBranches({ mergedInto: 'main' });
    expect(result).toHaveLength(0);
  });

  test('handles mergedOnly option', async () => {
    const raw = [
      'main|||2024-01-01 00:00:00 +0000|||',
      'feature/merged|||2020-01-01 00:00:00 +0000|||',
      'feature/unmerged-old|||2020-01-01 00:00:00 +0000|||'
    ].join('\n');
    gitLib.getBranchList.mockReturnValue(raw);
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.getMergedBranches.mockReturnValue(['feature/merged']);

    const result = await api.getStaleBranches({ mergedInto: 'main', mergedOnly: true });
    expect(result.every(b => b.merged)).toBe(true);
  });
});

describe('index.js — deleteBranches', () => {
  const gitLib = require('../lib/git');
  const api    = require('../index');

  beforeEach(() => { jest.clearAllMocks(); });

  test('returns results array for each branch', async () => {
    gitLib.getCurrentBranch.mockReturnValue('main');
    gitLib.deleteBranch.mockReturnValue('Deleted.');
    const results = await api.deleteBranches(['feature/a', 'feature/b']);
    expect(results).toHaveLength(2);
    expect(results[0].branch).toBe('feature/a');
    expect(results[1].branch).toBe('feature/b');
  });

  test('throws TypeError for non-array input', async () => {
    await expect(api.deleteBranches('feature/a')).rejects.toThrow(TypeError);
  });

  test('handles empty array', async () => {
    const results = await api.deleteBranches([]);
    expect(results).toHaveLength(0);
  });
});
