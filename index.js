'use strict';

/**
 * git-tidy — Programmatic API
 *
 * All functions are async and resolve to plain data objects.
 * They throw errors on git failures (e.g., not in a repo).
 */

const git = require('./lib/git');
const {
  parseBranchOutput,
  isProtected,
  getDaysSince,
  filterByAge,
  filterByMerged,
  sortByAge,
  annotateBranches
} = require('./lib/branches');
const { DEFAULT_PROTECTED, DEFAULT_OPTIONS } = require('./lib/config');

/**
 * Check whether git is installed and accessible.
 *
 * @returns {Promise<boolean>}
 */
async function isGitAvailable() {
  return git.checkGitAvailable();
}

/**
 * Get the currently checked-out branch name.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - working directory
 * @returns {Promise<string>} branch name, or empty string in detached HEAD
 */
async function getCurrentBranch(options = {}) {
  return git.getCurrentBranch(options);
}

/**
 * Get all local branches as annotated objects.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]      - working directory
 * @param {number} [options.olderThan] - annotate isOld flag against this threshold
 * @returns {Promise<Array>} array of branch objects
 */
async function getBranches(options = {}) {
  const olderThan = typeof options.olderThan === 'number' ? options.olderThan : DEFAULT_OPTIONS.olderThan;
  const rawOutput = git.getBranchList(options);
  const branches  = parseBranchOutput(rawOutput);
  const current   = git.getCurrentBranch(options);

  return annotateBranches(branches, olderThan).map(b => ({
    ...b,
    isCurrent: b.name === current
  }));
}

/**
 * Get stale branches — those that are merged and/or older than a threshold,
 * excluding protected and current branches.
 *
 * @param {object}   [options]
 * @param {number}   [options.olderThan=90]   - age threshold in days
 * @param {string}   [options.mergedInto]     - base branch for merge check
 * @param {string[]} [options.exclude]        - additional protected branch names
 * @param {boolean}  [options.mergedOnly]     - only return merged branches
 * @param {string}   [options.cwd]            - working directory
 * @returns {Promise<Array>}
 */
async function getStaleBranches(options = {}) {
  const {
    olderThan   = DEFAULT_OPTIONS.olderThan,
    mergedInto  = null,
    exclude     = [],
    mergedOnly  = false,
    cwd
  } = options;

  const gitOpts = cwd ? { cwd } : {};

  // Get all branches
  const rawOutput = git.getBranchList(gitOpts);
  const allBranches = parseBranchOutput(rawOutput);
  const currentBranch = git.getCurrentBranch(gitOpts);

  // Build protected set
  const protectedList = [...DEFAULT_PROTECTED, ...exclude];

  // Remove protected and current branches
  const candidates = allBranches.filter(b =>
    !isProtected(b.name, protectedList) && b.name !== currentBranch
  );

  // Determine base branch for merge checking
  let base = mergedInto;
  if (!base) {
    // Auto-detect: try 'main' then 'master'
    const allNames = allBranches.map(b => b.name);
    if (allNames.includes('main'))   base = 'main';
    else if (allNames.includes('master')) base = 'master';
  }

  // Get merged branch names
  let mergedNames = [];
  if (base) {
    try {
      mergedNames = git.getMergedBranches(base, gitOpts);
    } catch (_) {
      // If base doesn't exist, skip merge checking
    }
  }

  // Annotate with age and merge status
  const annotated = annotateBranches(candidates, olderThan).map(b => ({
    ...b,
    merged:    mergedNames.includes(b.name),
    isCurrent: false
  }));

  // Filter based on options
  if (mergedOnly) {
    return sortByAge(annotated.filter(b => b.merged));
  }

  // Default: return branches that are merged OR old
  const stale = annotated.filter(b => b.merged || b.isOld || b.upstreamGone);
  return sortByAge(stale);
}

/**
 * Get detailed info about a single branch.
 *
 * @param {string} branchName
 * @param {object} [options]
 * @returns {Promise<{ name, lastCommit, ageInDays, upstreamGone, isCurrent, merged }>}
 */
async function getBranchInfo(branchName, options = {}) {
  if (!branchName) throw new TypeError('getBranchInfo: branchName is required');

  const gitOpts = options.cwd ? { cwd: options.cwd } : {};
  const rawOutput = git.getBranchList(gitOpts);
  const allBranches = parseBranchOutput(rawOutput);

  const branch = allBranches.find(b => b.name === branchName);
  if (!branch) {
    throw new Error('Branch not found: ' + branchName);
  }

  const currentBranch = git.getCurrentBranch(gitOpts);
  const ageInDays = getDaysSince(branch.lastCommit);

  // Try to determine if merged
  let merged = false;
  if (options.base) {
    try {
      const mergedNames = git.getMergedBranches(options.base, gitOpts);
      merged = mergedNames.includes(branchName);
    } catch (_) {}
  }

  return {
    name:         branch.name,
    lastCommit:   branch.lastCommit,
    ageInDays,
    upstreamGone: branch.upstreamGone,
    isCurrent:    branch.name === currentBranch,
    merged
  };
}

/**
 * Delete a local branch.
 *
 * @param {string}  branchName
 * @param {object}  [options]
 * @param {boolean} [options.force=false] - force delete with -D
 * @param {string}  [options.cwd]
 * @returns {Promise<{ branch: string, deleted: boolean, error: Error|null }>}
 */
async function deleteBranch(branchName, options = {}) {
  if (!branchName) throw new TypeError('deleteBranch: branchName is required');

  const gitOpts = options.cwd ? { cwd: options.cwd } : {};
  const force   = options.force === true;

  // Safety: refuse to delete protected branches
  if (isProtected(branchName, DEFAULT_PROTECTED)) {
    return {
      branch:  branchName,
      deleted: false,
      error:   new Error('Cannot delete protected branch: ' + branchName)
    };
  }

  // Safety: refuse to delete current branch
  const current = git.getCurrentBranch(gitOpts);
  if (branchName === current) {
    return {
      branch:  branchName,
      deleted: false,
      error:   new Error('Cannot delete the currently checked-out branch: ' + branchName)
    };
  }

  try {
    git.deleteBranch(branchName, force, gitOpts);
    return { branch: branchName, deleted: true, error: null };
  } catch (err) {
    return { branch: branchName, deleted: false, error: err };
  }
}

/**
 * Delete multiple branches, returning results for each.
 *
 * @param {string[]} branchNames
 * @param {object}   [options]
 * @returns {Promise<Array<{ branch, deleted, error }>>}
 */
async function deleteBranches(branchNames, options = {}) {
  if (!Array.isArray(branchNames)) throw new TypeError('deleteBranches: branchNames must be an array');
  const results = [];
  for (const name of branchNames) {
    results.push(await deleteBranch(name, options));
  }
  return results;
}

module.exports = {
  isGitAvailable,
  getCurrentBranch,
  getBranches,
  getStaleBranches,
  getBranchInfo,
  deleteBranch,
  deleteBranches
};
