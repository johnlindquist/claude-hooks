#!/usr/bin/env node

// Set production mode before importing to prevent TypeScript detection
process.env.NODE_ENV = 'production'

import {execute} from '@oclif/core'

// If no arguments provided, default to 'init' command
const args = process.argv.slice(2)
if (args.length === 0) {
  process.argv.push('init')
}

await execute({dir: import.meta.url})
