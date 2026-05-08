# Tundra Docs

Documentation site for [Tundra](https://github.com/mralaminahamed/tundra) — built with [Astro Starlight](https://starlight.astro.build).

**Live:** [mralaminahamed.github.io/tundra](https://mralaminahamed.github.io/tundra)

---

## Development

```bash
pnpm install
pnpm dev          # http://localhost:4321/tundra
pnpm build        # production build → dist/
pnpm preview      # preview built site
```

## Structure

```
src/
  assets/               SVG logos (light + dark variants)
  content/docs/
    getting-started/    Install, first server, first site, upgrading
    guides/             Operator guides (sites, WordPress, DNS, mail, …)
    self-hosting/       Docker Compose, systemd, config, security
    plugins/            Plugin overview, using, building, MCP
    api/                REST, auth, errors, WebSocket
    contributing/       Architecture, local dev, testing, constraints
  styles/
    custom.css          Tundra brand tokens + dark mode overrides
public/
  favicon.svg
astro.config.mjs        Starlight config — sidebar, logo, themes
```

## Deployment

Automatically deployed to GitHub Pages on every push to `main` that touches `docs-site/**` via `.github/workflows/docs.yml`.

No manual steps — merge to main and the site updates.

## Adding a page

1. Create a `.md` or `.mdx` file in `src/content/docs/<section>/`
2. Add frontmatter: `title`, `description`, optional `sidebar.order`
3. Add the slug to the matching `sidebar` array in `astro.config.mjs`
4. Use `.mdx` if the page needs Starlight components (`Aside`, `Steps`, `Tabs`, `Card`)
