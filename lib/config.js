'use strict';

/**
 * Default list of branch names that should never be deleted.
 * These are common "permanent" branch names used in most workflows.
 */
const DEFAULT_PROTECTED = [
  'main',
  'master',
  'develop',
  'dev',
  'staging',
  'production',
  'release'
];

/**
 * Default option values for git-tidy operations.
 */
const DEFAULT_OPTIONS = {
  olderThan: 90,   // days — branches older than this are considered stale
  base: null,      // base branch for merge checking (null = auto-detect main/master)
  json: false,     // output as JSON
  dryRun: false,   // preview only, no deletions
  force: false     // skip confirmation prompts
};

/**
 * ANSI color codes for terminal output.
 * Set NO_COLOR env var or non-TTY to disable.
 */
const COLORS = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m'
};

/**
 * Returns true if color output should be used.
 * Always returns a boolean (never undefined/null).
 */
function useColor() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb');
}

module.exports = {
  DEFAULT_PROTECTED,
  DEFAULT_OPTIONS,
  COLORS,
  useColor
};
