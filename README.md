# git-tidy

[![npm version](https://img.shields.io/npm/v/git-tidy.svg)](https://www.npmjs.com/package/git-tidy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](https://www.npmjs.com/package/git-tidy)
[![Node.js >=14](https://img.shields.io/badge/node-%3E%3D14.0.0-blue.svg)](https://nodejs.org/)

**Clean up stale local git branches. Zero dependencies. Works on Windows, macOS, and Linux.**

---

## The Problem

You clone a repo, start a sprint, and three months later:

```
$ git branch
  feature/auth-refactor
  feature/button-fix-v2
  feature/button-fix-v3-final
  fix/login-page
  hotfix/critical-bug-jan
  hotfix/critical-bug-jan-ACTUALLY-FIXED
  main
* feature/current-work
  release/1.2.0
  release/1.3.0
  wip/experiment-that-never-shipped
```

Most of those branches are dead. They were merged months ago, the remote was deleted, or they were abandoned experiments. But `git branch -d` requires you to know which ones are safe to delete — and doing it one by one is tedious.

`git-tidy` finds them all and cleans them up in one shot.

---

## Quick Demo

```
$ git-tidy status

  12 stale branches found out of 18 total (8 merged, 4 old)

  Run git-tidy list to see stale branches, or git-tidy clean to remove them.

$ git-tidy list

  BRANCH                                    LAST COMMIT         STATUS
  --------------------------------------------------------
  hotfix/critical-bug-jan                   1 year 35 days ago  merged
  release/1.2.0                             11 months ago       merged
  feature/auth-refactor                     8 months ago        merged
  fix/login-page                            7 months ago        merged
  feature/button-fix-v2                     6 months ago        merged
  feature/button-fix-v3-final              5 months ago        merged
  wip/experiment-that-never-shipped         4 months ago        old
  release/1.3.0                             3 months ago        merged

$ git-tidy clean --dry-run

  DRY RUN — the following branches would be deleted:

  - hotfix/critical-bug-jan                   1 year 35 days ago    [merged]
  - release/1.2.0                             11 months ago         [merged]
  - feature/auth-refactor                     8 months ago          [merged]
  ... (8 total)

  8 branches would be deleted.
  Run without --dry-run to delete them.

$ git-tidy clean --force

  ✓ Deleted hotfix/critical-bug-jan
  ✓ Deleted release/1.2.0
  ✓ Deleted feature/auth-refactor
  ... (8 total)

  8 branches deleted successfully.
```

---

## Install

```bash
# Global install (recommended for CLI use)
npm install -g git-tidy

# Or use without installing
npx git-tidy list
```

---

## CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `git-tidy list` | List stale branches |
| `git-tidy clean` | Delete stale branches (interactive prompt) |
| `git-tidy status` | Quick summary of branch health |
| `git-tidy --version` | Show version |
| `git-tidy --help` | Show help |

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--merged` | Only include branches merged into base | false |
| `--older-than <n>` | Only include branches older than N days | 90 |
| `--base <branch>` | Base branch for merge detection | auto (main/master) |
| `--dry-run` | Preview — show what would be deleted without deleting | false |
| `--force` | Skip the confirmation prompt | false |
| `--json` | Output results as JSON (list command) | false |

### Usage Examples

```bash
# List all stale branches (merged or older than 90 days)
git-tidy list

# List only merged branches
git-tidy list --merged

# List branches with last commit older than 30 days
git-tidy list --older-than 30

# Get JSON output for scripting
git-tidy list --json

# Preview what would be deleted (safe — does not delete anything)
git-tidy clean --dry-run

# Clean merged branches only, no prompt
git-tidy clean --force --merged

# Clean branches merged into 'develop' that are 60+ days old
git-tidy clean --base develop --older-than 60

# Quick health check
git-tidy status
```

---

## Programmatic API

Install as a library:

```bash
npm install git-tidy
```

```javascript
const gitTidy = require('git-tidy');

// Check if git is available on PATH
const available = await gitTidy.isGitAvailable();
// => true

// Get the currently checked-out branch
const current = await gitTidy.getCurrentBranch();
// => 'feature/my-branch'

// Get all local branches (annotated with age, merge status, etc.)
const branches = await gitTidy.getBranches();
// => [
//   { name: 'main', ageInDays: 0, isCurrent: true, ... },
//   { name: 'feature/old', ageInDays: 120, isCurrent: false, ... },
//   ...
// ]

// Get stale branches (merged or old), excluding protected ones
const stale = await gitTidy.getStaleBranches({
  olderThan: 30,       // branches with last commit > 30 days ago
  mergedInto: 'main',  // check merges against this branch
  exclude: ['release'] // additional branch names to protect
});

// Get stale merged branches only
const mergedOnly = await gitTidy.getStaleBranches({ mergedOnly: true });

// Get detailed info about a specific branch
const info = await gitTidy.getBranchInfo('feature/my-branch', { base: 'main' });
// => {
//   name: 'feature/my-branch',
//   lastCommit: Date,
//   ageInDays: 45,
//   upstreamGone: false,
//   isCurrent: false,
//   merged: true
// }

// Delete a single branch (returns result object, never throws)
const result = await gitTidy.deleteBranch('feature/old-thing');
// => { branch: 'feature/old-thing', deleted: true, error: null }

// Delete multiple branches
const results = await gitTidy.deleteBranches(['feature/a', 'feature/b']);
// => [
//   { branch: 'feature/a', deleted: true, error: null },
//   { branch: 'feature/b', deleted: false, error: Error('not merged') }
// ]
```

### API Reference

#### `isGitAvailable() → Promise<boolean>`
Returns `true` if git is installed and accessible on the system PATH.

#### `getCurrentBranch(options?) → Promise<string>`
Returns the name of the currently checked-out branch. Returns an empty string in detached HEAD state.

#### `getBranches(options?) → Promise<Branch[]>`
Returns all local branches, annotated with age and metadata.

**Options:**
- `olderThan` *(number)* — Days threshold for the `isOld` annotation (default: 90)
- `cwd` *(string)* — Working directory (default: `process.cwd()`)

#### `getStaleBranches(options?) → Promise<Branch[]>`
Returns branches that are stale (merged, old, or with deleted remote tracking). Protected and current branches are always excluded. Results are sorted oldest-first.

**Options:**
- `olderThan` *(number)* — Age threshold in days (default: 90)
- `mergedInto` *(string)* — Base branch for merge detection (default: auto-detects main/master)
- `exclude` *(string[])* — Additional branch names to protect from deletion
- `mergedOnly` *(boolean)* — If true, only return merged branches
- `cwd` *(string)* — Working directory

#### `getBranchInfo(branchName, options?) → Promise<BranchInfo>`
Returns detailed info about a single branch. Throws if the branch does not exist.

**Options:**
- `base` *(string)* — Base branch to check merge status against
- `cwd` *(string)* — Working directory

#### `deleteBranch(branchName, options?) → Promise<DeleteResult>`
Deletes a local branch. Returns a result object — never throws. Protected and current branches return `{ deleted: false, error: ... }`.

**Options:**
- `force` *(boolean)* — Use `-D` (force delete) instead of `-d` (default: false)
- `cwd` *(string)* — Working directory

#### `deleteBranches(branchNames[], options?) → Promise<DeleteResult[]>`
Deletes multiple branches and returns results for each. Throws `TypeError` if input is not an array.

### Branch Object Shape

```typescript
{
  name: string;          // branch name
  lastCommit: Date|null; // date of last commit
  ageInDays: number;     // days since last commit (Infinity if unknown)
  upstreamGone: boolean; // true if remote tracking branch was deleted
  isCurrent: boolean;    // true if currently checked out
  merged: boolean;       // true if merged into base branch
  isOld: boolean;        // true if ageInDays > olderThan threshold
}
```

---

## Configuration

### Protected Branches

The following branches are **always** protected and will never be deleted, regardless of age or merge status:

```
main, master, develop, dev, staging, production, release
```

To protect additional branches when using the API, pass them in the `exclude` option:

```javascript
const stale = await gitTidy.getStaleBranches({
  exclude: ['my-long-running-branch', 'qa']
});
```

### Default Options

| Option | Default | Description |
|--------|---------|-------------|
| `olderThan` | `90` | Branches older than 90 days are considered stale |
| `base` | `null` | Auto-detects `main` or `master` |
| `json` | `false` | Plain text output |
| `dryRun` | `false` | Actually deletes |
| `force` | `false` | Asks for confirmation |

---

## How It Works

1. Runs `git branch --format='...'` to get all local branches with metadata
2. Filters out protected branches (main, master, develop, etc.) and the current branch
3. Runs `git branch --merged <base>` to find merged branches
4. Identifies old branches by comparing last commit date to the threshold
5. Identifies branches with deleted remote tracking (`[gone]` in upstream status)
6. Deletes with `git branch -d` (merged) or `git branch -D` (unmerged old branches)

---

## Platform Support

git-tidy uses only Node.js built-ins (`child_process`, `readline`, `os`, `path`, `fs`) and has zero runtime dependencies. It works on:

- macOS
- Linux
- Windows (PowerShell, CMD, Git Bash)

---

## Sponsorship

If git-tidy saves you time, consider sponsoring its development:

[https://github.com/sponsors/axiom-agent](https://github.com/sponsors/axiom-agent)

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-improvement`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Submit a pull request

### Development

```bash
git clone https://github.com/axiom-agent/git-tidy.git
cd git-tidy
npm install
npm test
```

### Running Tests

```bash
npm test              # run all tests with coverage
npm run test:watch    # watch mode for development
```

---

## Links

- [npm package](https://www.npmjs.com/package/git-tidy)
- [GitHub repository](https://github.com/axiom-agent/git-tidy)
- [Issue tracker](https://github.com/axiom-agent/git-tidy/issues)

---

## License

MIT © axiom-agent

```
MIT License

Copyright (c) 2024 axiom-agent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
