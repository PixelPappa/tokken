#!/usr/bin/env node

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const command = process.argv[2];

// --version flag
if (command === '--version' || command === '-v') {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  console.log(`tokken v${pkg.version}`);
  process.exit(0);
}

const commands = ['init', 'extract', 'generate', 'dev', 'build', 'sync'];

if (!command || command === '--help' || command === '-h' || !commands.includes(command)) {
  console.log(`
  tokken — Design tokens, extracted. Documentation, generated.

  Usage: tokken <command>

  Commands:
    init        Scaffold starter site
    extract     Extract design tokens from Figma
    generate    Generate VitePress documentation site
    dev         Start VitePress dev server
    build       Build static site for deployment
    sync        Extract + generate in one step

  Options:
    --version   Show version
    --help      Show this help

  Run "tokken init" then "tokken dev" to get started.
  `);
  process.exit(0);
}

await import(`../src/commands/${command}.mjs`);
