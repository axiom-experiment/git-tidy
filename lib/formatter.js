'use strict';

const { COLORS, useColor } = require('./config');

/**
 * Apply ANSI color to a string, respecting NO_COLOR / non-TTY environments.
 *
 * @param {string} str
 * @param {string} colorCode - one of the COLORS values
 * @returns {string}
 */
function colorize(str, colorCode) {
  if (!useColor()) return str;
  return colorCode + str + COLORS.reset;
}

/**
 * Pad a string to a fixed width (left-align).
 *
 * @param {string} str
 * @param {number} width
 * @returns {string}
 */
function padEnd(str, width) {
  const s = String(str || '');
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

/**
 * Format a number of days into a human-readable age string.
 * e.g. 0 -> "today", 1 -> "1 day", 30 -> "30 days", 400 -> "1 year 35 days"
 *
 * @param {number} days
 * @returns {string}
 */
function formatAge(days) {
  if (!isFinite(days) || days < 0) return 'unknown';
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 365) return days + ' days ago';
  const years = Math.floor(days / 365);
  const remainder = days % 365;
  if (remainder === 0) return years + (years === 1 ? ' year ago' : ' years ago');
  return years + (years === 1 ? ' year' : ' years') + ' ' + remainder + ' days ago';
}

/**
 * Format a single branch row for table display.
 * Returns a colored string with fixed columns.
 *
 * @param {object}  branch
 * @param {string}  branch.name
 * @param {number}  branch.ageInDays
 * @param {boolean} branch.merged         - true if merged into base
 * @param {boolean} branch.upstreamGone   - true if remote tracking deleted
 * @param {boolean} branch.isCurrent      - true if currently checked out
 * @param {number}  nameWidth             - column width for name
 * @returns {string}
 */
function formatBranchRow(branch, nameWidth = 40) {
  const { name, ageInDays, merged, upstreamGone, isCurrent } = branch;

  // Status tag
  let statusTag;
  let rowColor;

  if (isCurrent) {
    statusTag = '* current';
    rowColor = COLORS.red;
  } else if (merged) {
    statusTag = 'merged';
    rowColor = COLORS.green;
  } else if (upstreamGone) {
    statusTag = 'remote gone';
    rowColor = COLORS.yellow;
  } else if (branch.isOld) {
    statusTag = 'old';
    rowColor = COLORS.yellow;
  } else {
    statusTag = 'active';
    rowColor = COLORS.gray;
  }

  const nameCol = padEnd(name, nameWidth);
  const ageCol  = padEnd(formatAge(ageInDays), 18);
  const statCol = padEnd(statusTag, 14);

  const row = '  ' + nameCol + '  ' + ageCol + '  ' + statCol;

  return colorize(row, rowColor);
}

/**
 * Format a full table of branches.
 *
 * @param {Array}  branches        - annotated branch objects
 * @param {object} [opts]
 * @param {string} [opts.title]    - optional section title
 * @returns {string} multi-line string ready for console.log
 */
function formatBranchTable(branches, opts = {}) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return colorize('  No branches found.', COLORS.dim);
  }

  const nameWidth = Math.max(20, ...branches.map(b => (b.name || '').length)) + 2;

  const header = colorize(
    '  ' + padEnd('BRANCH', nameWidth) + '  ' + padEnd('LAST COMMIT', 18) + '  ' + padEnd('STATUS', 14),
    COLORS.bold
  );
  const separator = colorize('  ' + '-'.repeat(nameWidth + 36), COLORS.dim);

  const rows = branches.map(b => formatBranchRow(b, nameWidth));

  const lines = [];
  if (opts.title) {
    lines.push('');
    lines.push(colorize(opts.title, COLORS.bold));
  }
  lines.push(header);
  lines.push(separator);
  lines.push(...rows);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a summary line.
 *
 * @param {object} stats
 * @param {number} stats.total    - total local branches
 * @param {number} stats.stale    - stale branches count
 * @param {number} stats.merged   - merged branches count
 * @param {number} stats.old      - old (unmerged) branches count
 * @param {number} stats.current  - number of current-branch skips
 * @returns {string}
 */
function formatSummary(stats) {
  const { total = 0, stale = 0, merged = 0, old = 0, current = 0 } = stats;

  if (stale === 0) {
    return colorize('  No stale branches found. Your repo is tidy!', COLORS.green);
  }

  const parts = [];
  if (merged > 0) parts.push(colorize(merged + ' merged', COLORS.green));
  if (old > 0)    parts.push(colorize(old + ' old', COLORS.yellow));

  const staleStr = colorize(stale + ' stale ' + (stale === 1 ? 'branch' : 'branches'), COLORS.yellow);
  const detail   = parts.length ? ' (' + parts.join(', ') + ')' : '';

  return '  ' + staleStr + ' found out of ' + total + ' total' + detail;
}

/**
 * Format a dry-run preview — shows what would be deleted.
 *
 * @param {Array} branches - branches that would be deleted
 * @returns {string}
 */
function formatDryRun(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    return colorize('  Nothing to delete.', COLORS.dim);
  }

  const lines = [
    '',
    colorize('  DRY RUN — the following branches would be deleted:', COLORS.yellow),
    ''
  ];

  branches.forEach(b => {
    const age = padEnd(formatAge(b.ageInDays), 18);
    const tag = b.merged ? colorize('[merged]', COLORS.green) : colorize('[old]', COLORS.yellow);
    lines.push('  ' + colorize('-', COLORS.red) + ' ' + colorize(padEnd(b.name, 40), COLORS.bold) + '  ' + age + '  ' + tag);
  });

  lines.push('');
  lines.push(colorize('  ' + branches.length + ' ' + (branches.length === 1 ? 'branch' : 'branches') + ' would be deleted.', COLORS.yellow));
  lines.push('  Run without --dry-run to delete them.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Format post-deletion results.
 *
 * @param {Array} results  - array of { branch, deleted, error }
 * @returns {string}
 */
function formatDeleted(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return colorize('  Nothing was deleted.', COLORS.dim);
  }

  const succeeded = results.filter(r => r.deleted);
  const failed    = results.filter(r => !r.deleted);

  const lines = [''];

  succeeded.forEach(r => {
    lines.push('  ' + colorize('✓', COLORS.green) + ' Deleted ' + colorize(r.branch, COLORS.bold));
  });

  failed.forEach(r => {
    const errMsg = r.error ? ' (' + r.error.message + ')' : '';
    lines.push('  ' + colorize('✗', COLORS.red) + ' Failed to delete ' + colorize(r.branch, COLORS.bold) + colorize(errMsg, COLORS.dim));
  });

  lines.push('');

  if (succeeded.length > 0) {
    lines.push(colorize('  ' + succeeded.length + ' ' + (succeeded.length === 1 ? 'branch' : 'branches') + ' deleted successfully.', COLORS.green));
  }
  if (failed.length > 0) {
    lines.push(colorize('  ' + failed.length + ' ' + (failed.length === 1 ? 'branch' : 'branches') + ' could not be deleted.', COLORS.red));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format error output for display.
 *
 * @param {string|Error} err
 * @returns {string}
 */
function formatError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return colorize('  Error: ' + msg, COLORS.red);
}

/**
 * Format a help message for the CLI.
 *
 * @returns {string}
 */
function formatHelp() {
  const b = s => colorize(s, COLORS.bold);
  const c = s => colorize(s, COLORS.cyan);
  const d = s => colorize(s, COLORS.dim);

  return [
    '',
    b('git-tidy') + ' — Clean up stale local git branches',
    '',
    b('USAGE'),
    '  git-tidy <command> [options]',
    '',
    b('COMMANDS'),
    '  ' + c('list') + '              List stale local branches',
    '  ' + c('clean') + '             Delete stale branches (interactive by default)',
    '  ' + c('status') + '            Show a quick summary of branch health',
    '',
    b('OPTIONS'),
    '  ' + c('--merged') + '           Only show/delete branches merged into base',
    '  ' + c('--older-than <n>') + '   Only show/delete branches older than N days',
    '  ' + c('--base <branch>') + '    Base branch for merge detection ' + d('(default: main/master)'),
    '  ' + c('--dry-run') + '          Preview deletions without deleting',
    '  ' + c('--force') + '            Skip confirmation prompt',
    '  ' + c('--json') + '             Output results as JSON',
    '  ' + c('--version') + '          Show version number',
    '  ' + c('--help') + '             Show this help message',
    '',
    b('EXAMPLES'),
    '  git-tidy list',
    '  git-tidy list --merged',
    '  git-tidy list --older-than 30',
    '  git-tidy clean --dry-run',
    '  git-tidy clean --force --merged',
    '  git-tidy clean --older-than 60 --base develop',
    '  git-tidy status',
    ''
  ].join('\n');
}

module.exports = {
  colorize,
  padEnd,
  formatAge,
  formatBranchRow,
  formatBranchTable,
  formatSummary,
  formatDryRun,
  formatDeleted,
  formatError,
  formatHelp
};
