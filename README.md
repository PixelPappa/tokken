# Tokken

Design tokens, extracted. Documentation, generated.

Tokken takes a Figma URL and generates a complete design system documentation site — colors, typography, components, icons, and a downloadable CSS framework. No AI, no LLM — fully deterministic.

## Quick Start

```bash
npm install -g tokken
tokken init
tokken extract
tokken generate
tokken dev
```

Or run everything at once:

```bash
tokken sync
```

## What You Get

- Token documentation (colors, typography, spacing, shadows, borders)
- Component pages with design specs and exported PNGs
- Searchable icon library with SVG exports
- Downloadable CSS framework with all design tokens
- AI-ready specification document

## How It Works

Tokken runs two scripts in sequence:

1. **Extract** — calls the Figma REST API to pull colors, typography, spacing, borders, effects, components, and icons from your design file. Outputs `design-tokens.json`, `manifest.json`, PNGs, and SVGs.

2. **Generate** — reads the extracted data and generates a complete VitePress site with interactive Vue components, a CSS framework, and documentation pages. Pure Node.js, zero dependencies.

Same Figma file in, same site out. Deterministic, no AI involved.

## Configuration

`tokken.config.json` (created by `tokken init`, safe to commit):

```json
{
  "figmaUrl": "https://www.figma.com/design/abc123/MyDesign",
  "brandColor": "#6164F0",
  "outputDir": "."
}
```

Your Figma token is stored in `.env` (auto-gitignored, never committed).
In CI/CD, set `FIGMA_ACCESS_TOKEN` as an environment variable instead.

## Commands

| Command            | Description                              |
|--------------------|------------------------------------------|
| `tokken init`      | Interactive setup wizard                 |
| `tokken extract`   | Extract design tokens from Figma         |
| `tokken generate`  | Generate VitePress documentation site    |
| `tokken dev`       | Start VitePress dev server               |
| `tokken build`     | Build static site for deployment         |
| `tokken sync`      | Extract + generate in one step           |

## Self-Hosting

Tokken generates a standard VitePress static site. Deploy anywhere:

```bash
tokken build
# Deploy the docs/.vitepress/dist/ directory to any static host
```

Works with Vercel, Netlify, GitHub Pages, or any static hosting.

## Figma Token

You need a Figma personal access token to extract designs:

1. Go to https://www.figma.com/settings
2. Scroll to "Personal Access Tokens"
3. Click "Generate new token"
4. Copy the token (starts with `figd_...`)

The `tokken init` wizard handles this setup.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
