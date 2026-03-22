'use strict';

const { execSync } = require('child_process');
const path = require('path');

/**
 * Execute a git command and return its stdout as a trimmed string.
 *
 * @param {string[]} args - Array of git arguments (e.g. ['branch', '--merged'])
 * @param {object}  [options] - Options passed to execSync
 * @param {string}  [options.cwd] - Working directory (defaults to process.cwd())
 * @returns {string} stdout of the command
 * @throws {Error} if the git command exits with a non-zero status
 */
function execGit(args, options = {}) {
  if (!Array.isArray(args)) {
    throw new TypeError('execGit: args must be an array');
  }
  const cwd = options.cwd || process.cwd();
  const cmd = 'git ' + args.map(a => {
    // Wrap arguments containing spaces in double-quotes for shell safety
    if (typeof a === 'string' && a.includes(' ')) {
      return '"' + a.replace(/"/g, '\\"') + '"';
    }
    return a;
  }).join(' ');

  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });
    return typeof result === 'string' ? result.trim() : '';
  } catch (err) {
    const stderr = (err.stderr || '').toString().trim();
    const message = stderr || err.message || 'git command failed';
    const error = new Error(message);
    error.exitCode = err.status || 1;
    error.cmd = cmd;
    throw error;
  }
}

/**
 * Get a list of all local branches with metadata.
 * Uses git's --format option to retrieve structured data.
 *
 * Format per line:  name|||iso8601-date|||upstream-track
 * Example:          feature/my-thing|||2024-01-15 10:23:44 +0000|||[gone]
 *
 * @param {object} [options]
 * @returns {string} raw multi-line output string
 */
function getBranchList(options = {}) {
  return execGit(
    [
      'branch',
      '--format=%(refname:short)|||%(committerdate:iso8601)|||%(upstream:track)'
    ],
    options
  );
}

/**
 * Get the names of all local branches that are fully merged into `base`.
 *
 * @param {string} base  - Branch name to check merges against (e.g. 'main')
 * @param {object} [options]
 * @returns {string[]} array of merged branch names
 */
function getMergedBranches(base, options = {}) {
  if (!base || typeof base !== 'string') {
    throw new TypeError('getMergedBranches: base must be a non-empty string');
  }
  const output = execGit(['branch', '--merged', base], options);
  if (!output) return [];
  return output
    .split('\n')
    .map(line => line.replace(/^\*?\s+/, '').trim())
    .filter(Boolean);
}

/**
 * Delete a local branch.
 *
 * @param {string}  name    - Branch name to delete
 * @param {boolean} [force] - If true, use -D (force delete) instead of -d
 * @param {object}  [options]
 * @returns {string} stdout message from git
 */
function deleteBranch(name, force = false, options = {}) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('deleteBranch: name must be a non-empty string');
  }
  const flag = force ? '-D' : '-d';
  return execGit(['branch', flag, name], options);
}

/**
 * Get the name of the currently checked-out branch.
 *
 * @param {object} [options]
 * @returns {string} current branch name, or empty string if in detached HEAD
 */
function getCurrentBranch(options = {}) {
  return execGit(['branch', '--show-current'], options);
}

/**
 * Check whether git is installed and accessible on PATH.
 *
 * @returns {boolean} true if git is available
 */
function checkGitAvailable() {
  try {
    execGit(['--version']);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Check whether the current working directory (or given path) is inside
 * a git repository.
 *
 * @param {object} [options]
 * @returns {boolean}
 */
function isInsideRepo(options = {}) {
  try {
    const result = execGit(['rev-parse', '--is-inside-work-tree'], options);
    return result === 'true';
  } catch (_) {
    return false;
  }
}

/**
 * Get the root directory of the git repository.
 *
 * @param {object} [options]
 * @returns {string} absolute path to repo root
 */
function getRepoRoot(options = {}) {
  return execGit(['rev-parse', '--show-toplevel'], options);
}

module.exports = {
  execGit,
  getBranchList,
  getMergedBranches,
  deleteBranch,
  getCurrentBranch,
  checkGitAvailable,
  isInsideRepo,
  getRepoRoot
};
