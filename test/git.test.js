'use strict';

/**
 * Tests for lib/git.js — uses a child_process factory mock so that
 * git.js's destructured execSync binding always points to the mock fn.
 *
 * Kept in a separate file from git-tidy.test.js to avoid hoisting
 * conflicts between jest.mock('child_process') and jest.mock('../lib/git').
 */

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

describe('lib/git.js — execGit', () => {
  const cp        = require('child_process');
  const gitModule = require('../lib/git');

  beforeEach(() => {
    cp.execSync.mockReset();
  });

  test('throws TypeError when args is not an array', () => {
    expect(() => gitModule.execGit('git branch')).toThrow(TypeError);
  });

  test('returns trimmed stdout string', () => {
    cp.execSync.mockReturnValue('  main\n  feature/a\n');
    const result = gitModule.execGit(['branch']);
    expect(result).toBe('main\n  feature/a');
  });

  test('throws Error on non-zero exit', () => {
    const err = new Error('fatal: not a git repo');
    err.status = 128;
    err.stderr = Buffer.from('fatal: not a git repo');
    cp.execSync.mockImplementation(() => { throw err; });
    expect(() => gitModule.execGit(['status'])).toThrow('fatal: not a git repo');
  });

  test('thrown error has exitCode property', () => {
    const err = new Error('custom error');
    err.status = 1;
    err.stderr = Buffer.from('custom error');
    cp.execSync.mockImplementation(() => { throw err; });
    let caught;
    try {
      gitModule.execGit(['branch', '-d', 'nonexistent']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.exitCode).toBe(1);
  });
});

describe('lib/git.js — getBranchList', () => {
  const cp        = require('child_process');
  const gitModule = require('../lib/git');

  beforeEach(() => {
    cp.execSync.mockReset();
  });

  test('returns raw output string', () => {
    const raw = 'main|||2024-01-01 00:00:00 +0000|||\nfeature/a|||2024-02-01 00:00:00 +0000|||';
    cp.execSync.mockReturnValue(raw);
    const result = gitModule.getBranchList();
    expect(typeof result).toBe('string');
    expect(result).toContain('main');
  });

  test('calls git branch --format', () => {
    cp.execSync.mockReturnValue('');
    gitModule.getBranchList();
    expect(cp.execSync).toHaveBeenCalledTimes(1);
    const cmd = cp.execSync.mock.calls[0][0];
    expect(cmd).toContain('branch');
    expect(cmd).toContain('--format');
  });
});

describe('lib/git.js — getMergedBranches', () => {
  const cp        = require('child_process');
  const gitModule = require('../lib/git');

  beforeEach(() => {
    cp.execSync.mockReset();
  });

  test('returns array of merged branch names', () => {
    cp.execSync.mockReturnValue('  feature/a\n  feature/b\n* main');
    const result = gitModule.getMergedBranches('main');
    expect(result).toContain('feature/a');
    expect(result).toContain('feature/b');
  });

  test('throws TypeError for missing base', () => {
    expect(() => gitModule.getMergedBranches()).toThrow(TypeError);
  });

  test('returns empty array for empty output', () => {
    cp.execSync.mockReturnValue('');
    const result = gitModule.getMergedBranches('main');
    expect(result).toEqual([]);
  });
});

describe('lib/git.js — getCurrentBranch', () => {
  const cp        = require('child_process');
  const gitModule = require('../lib/git');

  beforeEach(() => {
    cp.execSync.mockReset();
  });

  test('returns current branch name', () => {
    cp.execSync.mockReturnValue('feature/my-branch\n');
    const result = gitModule.getCurrentBranch();
    expect(result).toBe('feature/my-branch');
  });

  test('returns empty string in detached HEAD', () => {
    cp.execSync.mockReturnValue('');
    const result = gitModule.getCurrentBranch();
    expect(result).toBe('');
  });
});

describe('lib/git.js — checkGitAvailable', () => {
  const cp        = require('child_process');
  const gitModule = require('../lib/git');

  beforeEach(() => {
    cp.execSync.mockReset();
  });

  test('returns true when git is available', () => {
    cp.execSync.mockReturnValue('git version 2.40.0\n');
    expect(gitModule.checkGitAvailable()).toBe(true);
  });

  test('returns false when git is not available', () => {
    cp.execSync.mockImplementation(() => { throw new Error('not found'); });
    expect(gitModule.checkGitAvailable()).toBe(false);
  });
});

describe('lib/git.js — deleteBranch', () => {
  const cp        = require('child_process');
  const gitModule = require('../lib/git');

  beforeEach(() => {
    cp.execSync.mockReset();
  });

  test('calls git branch -d for normal delete', () => {
    cp.execSync.mockReturnValue('Deleted branch feature/a (was abc1234).\n');
    gitModule.deleteBranch('feature/a', false);
    const cmd = cp.execSync.mock.calls[0][0];
    expect(cmd).toContain('-d');
    expect(cmd).toContain('feature/a');
  });

  test('calls git branch -D for force delete', () => {
    cp.execSync.mockReturnValue('Deleted branch feature/b (was def5678).\n');
    gitModule.deleteBranch('feature/b', true);
    const cmd = cp.execSync.mock.calls[0][0];
    expect(cmd).toContain('-D');
  });

  test('throws TypeError for empty name', () => {
    expect(() => gitModule.deleteBranch('')).toThrow(TypeError);
  });

  test('throws on git error', () => {
    const err = new Error('error: The branch is not fully merged');
    err.status = 1;
    err.stderr = Buffer.from('error: The branch is not fully merged');
    cp.execSync.mockImplementation(() => { throw err; });
    expect(() => gitModule.deleteBranch('feature/c')).toThrow();
  });
});
