# Contributing to Tokken

Thanks for your interest in contributing to Tokken.

## Getting Started

1. Fork the repo
2. Clone your fork
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b my-feature`

## Development

The core pipeline consists of two files:

- `src/figma-extractor.ts` — Figma API extraction engine
- `src/generate-site.mjs` — VitePress site generator (zero dependencies)

Vue component templates live in `templates/`.

## Testing Changes

```bash
# Extract from a Figma file
node bin/cli.mjs extract <figma-url> --token <token> --output /tmp/test

# Generate site from extracted data
node bin/cli.mjs generate --input /tmp/test --output /tmp/test

# Build to verify
cd /tmp/test && npm install && npx vitepress build docs
```

## Pull Requests

1. Keep changes focused — one feature or fix per PR
2. Test with at least one Figma file extraction
3. Ensure `vitepress build docs` passes on the generated output

## Reporting Issues

Open an issue on GitHub with:

- What you expected
- What happened
- Steps to reproduce
- Figma URL (if applicable and not private)

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.
