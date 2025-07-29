# Git Hooks

This directory contains Git hooks for the project.

## Setup

To use these hooks, configure Git to use this directory:

```bash
git config core.hooksPath .githooks
```

## Available Hooks

### pre-push

Runs before pushing to ensure:
- All lint checks pass
- All tests pass (using Bun)

## Bypass Hooks

If you need to bypass the hooks temporarily (not recommended):

```bash
git push --no-verify
```