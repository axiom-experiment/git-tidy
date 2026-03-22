'use strict';

/**
 * Parse a single line of git branch --format output.
 *
 * Expected format:
 *   name|||iso8601-date|||upstream-track
 *
 * Examples:
 *   feature/my-thing|||2024-01-15 10:23:44 +0000|||
 *   old-branch|||2023-06-01 08:00:00 +0000|||[gone]
 *   local-only|||2024-03-10 12:00:00 +0000|||
 *
 * Returns an object:
 * {
 *   name:          string   — branch name
 *   lastCommit:    Date     — date of last commit (or null if unparseable)
 *   upstreamGone:  boolean  — true if remote tracking branch has been deleted
 *   raw:           string   — original line
 * }
 *
 * @param {string} line
 * @returns {{ name: string, lastCommit: Date|null, upstreamGone: boolean, raw: string }|null}
 */
function parseBranchLine(line) {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('|||');
  const name = (parts[0] || '').trim();
  const dateStr = (parts[1] || '').trim();
  const upstream = (parts[2] || '').trim();

  if (!name) return null;

  let lastCommit = null;
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      lastCommit = parsed;
    }
  }

  const upstreamGone = upstream.includes('[gone]');

  return { name, lastCommit, upstreamGone, raw: line };
}

/**
 * Check whether a branch name is in the protected list.
 * Comparison is case-insensitive.
 *
 * @param {string}   name          - Branch name to check
 * @param {string[]} protectedList - List of protected branch names
 * @returns {boolean}
 */
function isProtected(name, protectedList) {
  if (!name || !Array.isArray(protectedList)) return false;
  const lower = name.toLowerCase();
  return protectedList.some(p => p.toLowerCase() === lower);
}

/**
 * Calculate the number of whole days between a date string (or Date) and now.
 *
 * @param {string|Date} dateStr - ISO 8601 string or Date object
 * @returns {number} number of days since the date (0 = today, negative = future)
 */
function getDaysSince(dateStr) {
  if (!dateStr) return Infinity;
  const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(date.getTime())) return Infinity;
  const now = Date.now();
  const diff = now - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Filter an array of parsed branch objects to only those whose last commit
 * is older than `maxDays` days ago.
 *
 * @param {Array}  branches  - Array of branch objects (must have .lastCommit)
 * @param {number} maxDays   - Threshold in days
 * @returns {Array}
 */
function filterByAge(branches, maxDays) {
  if (!Array.isArray(branches)) return [];
  if (typeof maxDays !== 'number' || maxDays < 0) return branches.slice();
  return branches.filter(b => {
    const days = getDaysSince(b.lastCommit);
    return days > maxDays;
  });
}

/**
 * Filter an array of branch objects to only those whose names appear in
 * the `mergedNames` set.
 *
 * @param {Array}    branches    - Array of branch objects (must have .name)
 * @param {string[]} mergedNames - Names of branches known to be merged
 * @returns {Array}
 */
function filterByMerged(branches, mergedNames) {
  if (!Array.isArray(branches)) return [];
  if (!Array.isArray(mergedNames) || mergedNames.length === 0) return [];
  const mergedSet = new Set(mergedNames.map(n => n.toLowerCase()));
  return branches.filter(b => mergedSet.has(b.name.toLowerCase()));
}

/**
 * Sort an array of branch objects oldest-first by their lastCommit date.
 * Branches with no date are sorted to the end.
 *
 * @param {Array} branches
 * @returns {Array} new sorted array (does not mutate input)
 */
function sortByAge(branches) {
  if (!Array.isArray(branches)) return [];
  return branches.slice().sort((a, b) => {
    const aTime = a.lastCommit ? a.lastCommit.getTime() : Infinity;
    const bTime = b.lastCommit ? b.lastCommit.getTime() : Infinity;
    return aTime - bTime; // ascending: oldest first
  });
}

/**
 * Parse the full output of `git branch --format=...` into an array of
 * branch objects. Skips blank lines.
 *
 * @param {string} output - Raw stdout from getBranchList()
 * @returns {Array}
 */
function parseBranchOutput(output) {
  if (!output || typeof output !== 'string') return [];
  return output
    .split('\n')
    .map(line => parseBranchLine(line))
    .filter(Boolean);
}

/**
 * Given an array of parsed branches, mark each one with its age in days
 * and whether it qualifies as "stale" given a threshold.
 *
 * @param {Array}  branches
 * @param {number} olderThan - stale threshold in days
 * @returns {Array} branches annotated with .ageInDays and .isOld
 */
function annotateBranches(branches, olderThan = 90) {
  if (!Array.isArray(branches)) return [];
  return branches.map(b => {
    const ageInDays = getDaysSince(b.lastCommit);
    return {
      ...b,
      ageInDays,
      isOld: ageInDays > olderThan
    };
  });
}

module.exports = {
  parseBranchLine,
  parseBranchOutput,
  isProtected,
  getDaysSince,
  filterByAge,
  filterByMerged,
  sortByAge,
  annotateBranches
};
