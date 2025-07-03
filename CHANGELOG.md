# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive test suite with Mocha
- Test coverage configuration with NYC
- CONTRIBUTING.md guide
- LICENSE file (MIT)
- Cleanup scripts for test artifacts
- GitHub Actions workflow for CI/CD

## [1.0.0] - 2024-07-03

### Added
- Interactive CLI wizard using @inquirer/prompts
- Customizable security features and hook templates
- Support for multiple hook types (PreToolUse, PostToolUse, Notification, Stop)
- Multiple storage options (JSON, SQLite, PostgreSQL)
- Non-interactive mode with `--yes` flag
- Force overwrite with `--force` flag
- Bun runtime requirement warnings
- Comprehensive documentation
- Pre-configured security patterns:
  - Block dangerous file operations
  - Prevent secrets exposure
  - Production safeguards
  - Network security options

### Features
- Generates minimal, focused code based on user selections
- Project type detection (Node.js, Python, Ruby, Go, Other)
- Session data tracking and storage
- Git-friendly with .gitignore for sessions
- Professional CLI experience with oclif framework

[Unreleased]: https://github.com/anthropics/claude-hooks/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/anthropics/claude-hooks/releases/tag/v1.0.0