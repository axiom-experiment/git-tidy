#!/usr/bin/env node
'use strict';

/**
 * git-tidy CLI entry point.
 *
 * Parses process.argv manually — zero external dependencies.
 */

const git = require('../lib/git');
const {
  parseBranchOutput,
  isProtected,
  getDaysSince,
  filterByAge,
  filterByMerged,
  sortByAge,
  annotateBranches
} = require('../lib/branches');
const {
  formatBranchTable,
  formatSummary,
  formatDryRun,
  formatDeleted,
  formatError,
  formatHelp,
  colorize
} = require('../lib/formatter');
const { DEFAULT_PROTECTED, DEFAULT_OPTIONS, COLORS } = require('../lib/config');
const readline = require('readline');

// ─── Package version (read from package.json) ─────────────────────────────
let VERSION = '1.0.0';
try {
  VERSION = require('../package.json').version;
} catch (_) {}

// ─── Argument Parser ────────────────────────────────────────────────────────

/**
 * Minimal argv parser. Supports:
 *   --flag          → { flag: true }
 *   --key value     → { key: 'value' }
 *   --key=value     → { key: 'value' }
 *   positional args → stored in _
 *
 * @param {string[]} argv
 * @returns {object}
 */
function parseArgs(argv) {
  const args = { _: [] };
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        const key = token.slice(2, eqIdx);
        const val = token.slice(eqIdx + 1);
        args[key] = val;
      } else {
        const key = token.slice(2);
        // Peek ahead: if next token is not a flag, treat as value
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          args[key] = next;
          i++;
        } else {
          args[key] = true;
        }
      }
    } else if (token.startsWith('-') && token.length === 2) {
      // short flag
      args[token.slice(1)] = true;
    } else {
      args._.push(token);
    }
    i++;
  }
  return args;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function die(msg) {
  process.stderr.write(formatError(msg) + '\n');
  process.exit(1);
}

function print(msg) {
  process.stdout.write(msg + '\n');
}

/**
 * Prompt the user for a yes/no answer.
 * Returns a Promise<boolean>.
 */
function confirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout
    });
    rl.question(question, answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

/**
 * Validate that we are inside a git repo and git is available.
 */
function requireGit() {
  if (!git.checkGitAvailable()) {
    die('git is not installed or not found on PATH.');
  }
  if (!git.isInsideRepo()) {
    die('Not inside a git repository. Please run git-tidy from within a git repo.');
  }
}

/**
 * Resolve the base branch: uses --base flag, then auto-detects main/master.
 *
 * @param {string[]|null} allBranchNames
 * @param {string|null}   flagBase
 * @returns {string|null}
 */
function resolveBase(allBranchNames, flagBase) {
  if (flagBase && typeof flagBase === 'string') return flagBase;
  if (!Array.isArray(allBranchNames)) return null;
  if (allBranchNames.includes('main'))   return 'main';
  if (allBranchNames.includes('master')) return 'master';
  return null;
}

/**
 * Build the candidate stale branch list given CLI flags.
 *
 * @param {object} flags - parsed CLI flags
 * @returns {{ branches, mergedNames, base, currentBranch }}
 */
function buildCandidates(flags) {
  const olderThan = flags['older-than'] !== undefined
    ? parseInt(flags['older-than'], 10)
    : DEFAULT_OPTIONS.olderThan;

  const rawOutput    = git.getBranchList();
  const allBranches  = parseBranchOutput(rawOutput);
  const currentBranch = git.getCurrentBranch();

  const allNames  = allBranches.map(b => b.name);
  const base      = resolveBase(allNames, flags.base || null);

  // Get merged branch names
  let mergedNames = [];
  if (base) {
    try {
      mergedNames = git.getMergedBranches(base);
    } catch (_) {}
  }

  // Exclude protected and current branches
  const candidates = allBranches.filter(b =>
    !isProtected(b.name, DEFAULT_PROTECTED) && b.name !== currentBranch
  );

  // Annotate with age / merge status
  const annotated = annotateBranches(candidates, olderThan).map(b => ({
    ...b,
    merged:    mergedNames.includes(b.name),
    isCurrent: false
  }));

  return { branches: annotated, mergedNames, base, currentBranch, olderThan, allBranches };
}

// ─── Commands ───────────────────────────────────────────────────────────────

/**
 * git-tidy list [--merged] [--older-than N] [--json]
 */
async function cmdList(flags) {
  requireGit();

  const { branches, olderThan } = buildCandidates(flags);

  let results;

  if (flags.merged) {
    results = sortByAge(branches.filter(b => b.merged));
  } else if (flags['older-than'] !== undefined) {
    results = sortByAge(filterByAge(branches, olderThan));
  } else {
    // Default: show all stale (merged or old or upstream-gone)
    results = sortByAge(branches.filter(b => b.merged || b.isOld || b.upstreamGone));
  }

  if (flags.json) {
    print(JSON.stringify(results.map(b => ({
      name:         b.name,
      ageInDays:    b.ageInDays,
      merged:       b.merged,
      upstreamGone: b.upstreamGone,
      lastCommit:   b.lastCommit ? b.lastCommit.toISOString() : null
    })), null, 2));
    return;
  }

  if (results.length === 0) {
    print(colorize('\n  No stale branches found. Your repo is tidy!\n', COLORS.green));
    return;
  }

  print(formatBranchTable(results, { title: 'Stale Branches' }));
  print('  Total: ' + colorize(String(results.length), COLORS.yellow) + ' stale ' + (results.length === 1 ? 'branch' : 'branches'));
  print('');
}

/**
 * git-tidy clean [--dry-run] [--force] [--merged] [--older-than N] [--base B]
 */
async function cmdClean(flags) {
  requireGit();

  const { branches, olderThan } = buildCandidates(flags);

  let targets;

  if (flags.merged) {
    targets = sortByAge(branches.filter(b => b.merged));
  } else if (flags['older-than'] !== undefined) {
    targets = sortByAge(filterByAge(branches, olderThan));
  } else {
    targets = sortByAge(branches.filter(b => b.merged || b.isOld || b.upstreamGone));
  }

  if (targets.length === 0) {
    print(colorize('\n  No stale branches to clean. Your repo is already tidy!\n', COLORS.green));
    return;
  }

  // Show what we found
  print(formatBranchTable(targets, { title: 'Branches to Delete' }));

  // Dry run — just preview
  if (flags['dry-run']) {
    print(formatDryRun(targets));
    return;
  }

  // Ask for confirmation unless --force
  if (!flags.force) {
    const answer = await confirm(
      colorize('  Delete ' + targets.length + ' ' + (targets.length === 1 ? 'branch' : 'branches') + '? [y/N] ', COLORS.yellow)
    );
    if (!answer) {
      print(colorize('\n  Aborted. No branches were deleted.\n', COLORS.dim));
      return;
    }
  }

  // Delete branches one by one
  const results = [];
  for (const branch of targets) {
    // Use force delete (-D) for unmerged old branches so git doesn't refuse
    const forceDelete = !branch.merged;
    try {
      git.deleteBranch(branch.name, forceDelete);
      results.push({ branch: branch.name, deleted: true, error: null });
    } catch (err) {
      results.push({ branch: branch.name, deleted: false, error: err });
    }
  }

  print(formatDeleted(results));
}

/**
 * git-tidy status
 */
async function cmdStatus(flags) {
  requireGit();

  const { branches, allBranches } = buildCandidates(flags);

  const total   = allBranches.length;
  const merged  = branches.filter(b => b.merged).length;
  const old     = branches.filter(b => !b.merged && (b.isOld || b.upstreamGone)).length;
  const stale   = merged + old;

  print('');
  print(formatSummary({ total, stale, merged, old }));
  print('');

  if (stale > 0) {
    print(colorize('  Run ' + colorize('git-tidy list', COLORS.cyan) + colorize(' to see stale branches, or ', COLORS.reset) + colorize('git-tidy clean', COLORS.cyan) + colorize(' to remove them.', COLORS.reset), COLORS.reset));
    print('');
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  const argv  = process.argv.slice(2);
  const flags = parseArgs(argv);
  const cmd   = flags._[0];

  // Top-level flags
  if (flags.version || flags.v) {
    print('git-tidy v' + VERSION);
    return;
  }

  if (flags.help || flags.h || !cmd) {
    print(formatHelp());
    return;
  }

  switch (cmd) {
    case 'list':
      await cmdList(flags);
      break;
    case 'clean':
      await cmdClean(flags);
      break;
    case 'status':
      await cmdStatus(flags);
      break;
    default:
      die('Unknown command: ' + cmd + '\nRun git-tidy --help for usage.');
  }
}

main().catch(err => {
  process.stderr.write(formatError(err) + '\n');
  process.exit(1);
});
