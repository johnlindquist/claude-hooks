#!/usr/bin/env node

import {execute} from '@oclif/core'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

// If no arguments provided, default to 'init' command
const args = process.argv.slice(2)
if (args.length === 0) {
  process.argv.push('init')
}

// Get the actual directory of this script
const __dirname = dirname(fileURLToPath(import.meta.url))

// Execute from the package root, not the current working directory
await execute({
  dir: dirname(__dirname),
  // Explicitly set production mode to avoid TypeScript checks
  development: false,
})
