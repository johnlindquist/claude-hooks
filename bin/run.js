#!/usr/bin/env node

// Suppress oclif TypeScript warning for production usage
process.env.OCLIF_TS_NODE = '0'

import {execute} from '@oclif/core'

// If no arguments provided, default to 'init' command
const args = process.argv.slice(2)
if (args.length === 0) {
  process.argv.push('init')
}

await execute({dir: import.meta.url})
