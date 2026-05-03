# Tundra — Frontend UI Technical Specification

> **The complete frontend architecture for `tundra-ui` — the React 19 single-page application served by `tundrad`.**
> Vite 8 + Tailwind v4 + shadcn/ui + TanStack Router + TanStack Query + Zustand + React Hook Form + Formik.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-technical-implementation-plan-v2.md`, `tundra-brand-guidelines-v1.md`
**Status:** Implementation-Ready Specification

---

## 1. Executive Summary

### 1.1 Scope

This document specifies the complete frontend implementation of `tundra-ui` — the React 19 single-page application served by `tundrad` from `/_app/`. It covers project structure, routing, state, data fetching, forms, accessibility, performance, testing, and the page-by-page wireframe spec.

The frontend is delivered as **static assets** by `tundrad` over HTTPS, with all API traffic flowing back to the same origin. No CORS. No separate deployment. The frontend ships with the panel binary and is versioned in lockstep with it.

### 1.2 Core Stack (May 2026)

| Layer | Technology | Version | Why |
|-------|------------|---------|-----|
| Language | TypeScript | 5.7+ (strict) | Compile-time safety, mature React 19 types |
| Framework | React | 19 | Concurrent rendering, Server Components opt-out (we use SPA), use() hook, ref-as-prop |
| Build | Vite | 8.0.10 | Rolldown-based, 10-30× faster builds than Vite 7, single bundler |
| Package manager | pnpm | 10+ | Strict dependency hoisting, fast |
| Styling | Tailwind CSS | v4 | OKLCH colors, `@theme` directive, no postcss config |
| Component library | shadcn/ui | CLI v4 | Owned components, Radix primitives, install-not-import |
| Routing | TanStack Router | 1.x | Type-safe routes, file-based or code-based, modern data loading |
| Server state | TanStack Query | 5.x | The de facto standard for async data, caching, mutations |
| Client state | Zustand | 5.x | Minimal, hook-based, no boilerplate |
| Forms (simple) | React Hook Form + Zod | latest | Tiny, fast, schema-driven validation |
| Forms (complex/wizards) | Formik + Yup | latest | Maturity for multi-step flows, field-level orchestration |
| Real-time | Native WebSocket | — | Tundra's panel forwards events on `/api/v1/events` |
| Icons | Lucide React | latest | Consistent icon set; Tundra brand uses Lucide naming for diagrams |
| Charts | Recharts | latest | Recharts pairs cleanly with shadcn/ui |
| Testing — unit | Vitest 3 | latest | Vite-native test runner |
| Testing — component | React Testing Library | latest | User-centric component tests |
| Testing — E2E | Playwright | latest | Headless multi-browser |
| Linting | ESLint 9 (flat config) + typescript-eslint | latest | The 2026 standard |
| Formatting | Prettier 3 | latest | With `prettier-plugin-tailwindcss` for class sorting |
| Accessibility audit | axe-core (via Playwright) | latest | Automated WCAG 2.1 AA verification |

### 1.3 Design Goals

1. **Stays out of the operator's way.** The fastest path from intent ("deploy this") to result is a single click or single command. The UI follows; it does not lead.
2. **Type-safe end to end.** Every API call, route, form, and state slice is typed. The compiler catches what humans miss.
3. **Real-time without ceremony.** Deploys, logs, metrics, alerts stream over WebSocket and update the UI without polling, without operator action.
4. **Boring where boring helps.** Forms are predictable. Tables sort and filter the same way everywhere. Empty states are obvious. The brand is in the polish, not in inventiveness.
5. **Accessible by default.** WCAG 2.1 AA across the panel. Not an afterthought; a prerequisite.
6. **Performant on a 1 vCPU server.** The panel is served from `tundrad` itself. Initial load < 1 s on the same hardware that runs the operator's workloads.

---

## 2. Repository & Project Structure

### 2.1 Location in the Tundra Monorepo

The frontend lives at `tundra/ui/` in the main Tundra repository. It is a Cargo-workspace-adjacent pnpm project — the Rust workspace (`Cargo.toml`) and the frontend project (`ui/package.json`) coexist in the same git repository but are managed by their respective tools.

```
tundra/
├── Cargo.toml                       # Rust workspace
├── crates/                          # Rust crates (tundrad, tundra-agent, ...)
├── proto/                           # Shared protobuf + WIT definitions
├── migrations/                      # SQLx migrations
└── ui/                              # ← This document's scope
    ├── package.json
    ├── pnpm-lock.yaml
    ├── tsconfig.json
    ├── vite.config.ts
    ├── eslint.config.js
    ├── components.json              # shadcn/ui config
    └── src/
```

### 2.2 The `ui/` Internal Layout

```
ui/
├── public/
│   ├── favicon.svg                  # from /brand/favicon/
│   ├── apple-touch-icon.png
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png
│   └── site.webmanifest
├── src/
│   ├── main.tsx                     # Entry point — renders <App />
│   ├── App.tsx                      # Root: providers, router, error boundary
│   ├── routes/                      # TanStack Router file-based routes
│   │   ├── __root.tsx               # Root layout (sidebar, header)
│   │   ├── _auth.tsx                # Auth-required layout group
│   │   ├── _auth.dashboard.tsx
│   │   ├── _auth.servers.index.tsx
│   │   ├── _auth.servers.$serverId.tsx
│   │   ├── _auth.sites.index.tsx
│   │   ├── _auth.sites.$siteId.tsx
│   │   ├── _auth.sites.$siteId.deployments.tsx
│   │   ├── _auth.sites.$siteId.logs.tsx
│   │   ├── _auth.domains.index.tsx
│   │   ├── _auth.databases.index.tsx
│   │   ├── _auth.mail.index.tsx
│   │   ├── _auth.backups.index.tsx
│   │   ├── _auth.plugins.index.tsx
│   │   ├── _auth.plugins.$pluginId.tsx
│   │   ├── _auth.migrations.index.tsx
│   │   ├── _auth.settings.index.tsx
│   │   ├── login.tsx
│   │   └── setup.tsx                # Initial owner bootstrap
│   ├── components/
│   │   ├── ui/                      # shadcn/ui primitives — owned, customized
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── ...
│   │   ├── layout/                  # App-level layout pieces
│   │   │   ├── app-shell.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   ├── operator-menu.tsx
│   │   │   └── command-palette.tsx
│   │   ├── tundra/                  # Tundra-specific compound components
│   │   │   ├── server-status-pill.tsx
│   │   │   ├── deployment-timeline.tsx
│   │   │   ├── log-stream.tsx
│   │   │   ├── metrics-chart.tsx
│   │   │   ├── site-health-card.tsx
│   │   │   ├── certificate-expiry-badge.tsx
│   │   │   ├── tundra-mark.tsx       # The north-star mark, as a React component
│   │   │   └── ...
│   │   └── forms/                   # Form components (mixed RHF + Formik)
│   │       ├── rhf/                 # React Hook Form forms (simple, single-screen)
│   │       │   ├── login-form.tsx
│   │       │   ├── env-var-form.tsx
│   │       │   ├── dns-record-form.tsx
│   │       │   └── ...
│   │       └── formik/              # Formik wizards (multi-step, complex)
│   │           ├── site-create-wizard.tsx
│   │           ├── server-add-wizard.tsx
│   │           ├── plesk-migration-wizard.tsx
│   │           └── ...
│   ├── lib/
│   │   ├── api/                     # Generated API client + hooks
│   │   │   ├── client.ts            # ofetch instance with auth + interceptors
│   │   │   ├── types.ts             # Generated from OpenAPI
│   │   │   ├── queries.ts           # TanStack Query hooks (useSites, useServer, ...)
│   │   │   └── mutations.ts         # TanStack Query mutation hooks
│   │   ├── ws/                      # WebSocket connection + event bus
│   │   │   ├── client.ts            # Single shared ws connection
│   │   │   ├── hooks.ts             # useEvent, useLogStream, useDeployStream
│   │   │   └── types.ts
│   │   ├── auth/
│   │   │   ├── store.ts             # Zustand auth store
│   │   │   ├── hooks.ts             # useOperator, useRequireAuth
│   │   │   └── guards.ts            # Route guards
│   │   ├── theme/
│   │   │   ├── store.ts             # Zustand theme store (dark/light/system)
│   │   │   └── provider.tsx         # ThemeProvider component
│   │   ├── ui/
│   │   │   ├── toast.ts             # Toast helpers (sonner wrapper)
│   │   │   ├── confirm.tsx          # Confirmation dialog helper
│   │   │   └── command.ts           # Command palette registry
│   │   ├── format/
│   │   │   ├── bytes.ts             # 1.5 GiB
│   │   │   ├── duration.ts          # 3m 14s
│   │   │   ├── relative-time.ts     # "2 minutes ago"
│   │   │   └── domain.ts            # Punycode-aware domain rendering
│   │   ├── utils.ts                 # cn() helper for Tailwind class merging
│   │   └── validators/              # Zod & Yup schemas, paired with their forms
│   ├── styles/
│   │   ├── globals.css              # Tailwind v4 entry + Tundra @theme block
│   │   └── tundra-overrides.css     # The few hand-tuned global rules
│   └── test/
│       ├── setup.ts                 # Vitest setup
│       ├── msw/                     # Mock Service Worker handlers
│       └── factories/               # Test data factories
├── e2e/                             # Playwright tests
│   ├── fixtures/
│   ├── auth.spec.ts
│   ├── site-create.spec.ts
│   ├── deploy.spec.ts
│   └── ...
└── README.md
```

### 2.3 The Aliasing Convention

`tsconfig.json` defines a single `@/*` alias mapping to `./src/*`. Every internal import uses `@/`:

```ts
import { Button } from "@/components/ui/button";
import { useSites } from "@/lib/api/queries";
```

This is the shadcn/ui default and matches the `components.json` registered aliases. No deeper aliasing (`@/components/*`, `@/lib/*` etc.) — flat is preferable.

---

## 3. Bootstrap & Configuration

### 3.1 Project Initialization

The frontend is initialized with the modern shadcn/ui CLI, which now scaffolds full Vite + React + Tailwind v4 projects:

```bash
cd tundra/
pnpm dlx shadcn@latest init
# When prompted, choose:
# - Framework: Vite
# - TypeScript: yes
# - Style: new-york
# - Base color: neutral (we override with Tundra palette below)
# - CSS variables: yes
```

This produces a working project with Tailwind v4, the `cn()` utility, the `components.json` config, and the basic file layout. We then immediately:

1. Replace the generated palette in `src/styles/globals.css` with the Tundra `@theme` block (see §4.2).
2. Replace the generated favicon set with the assets from `brand/favicon/`.
3. Install our additional dependencies (router, query, state, forms — see §3.3).
4. Restructure `src/` to the layout in §2.2.

### 3.2 `package.json` Reference

```json
{
  "name": "tundra-ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "shadcn": "pnpm dlx shadcn@latest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",

    "@tanstack/react-router": "^1.95.0",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-query-devtools": "^5.62.0",

    "zustand": "^5.0.0",

    "react-hook-form": "^7.54.0",
    "@hookform/resolvers": "^3.10.0",
    "zod": "^3.24.0",

    "formik": "^2.4.6",
    "yup": "^1.6.0",

    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-checkbox": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-avatar": "^1.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-scroll-area": "^1.2.0",

    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",
    "tw-animate-css": "^1.2.0",

    "lucide-react": "^0.468.0",
    "sonner": "^1.7.0",
    "cmdk": "^1.0.0",
    "vaul": "^1.1.0",

    "recharts": "^2.15.0",
    "date-fns": "^4.1.0",
    "ofetch": "^1.4.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^8.0.10",

    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",

    "typescript": "^5.7.0",
    "typescript-eslint": "^8.18.0",
    "eslint": "^9.17.0",
    "@eslint/js": "^9.17.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^5.1.0",
    "eslint-plugin-jsx-a11y": "^6.10.0",

    "prettier": "^3.4.0",
    "prettier-plugin-tailwindcss": "^0.6.0",

    "vitest": "^3.0.0",
    "@vitest/ui": "^3.0.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.0",
    "@testing-library/jest-dom": "^6.6.0",
    "msw": "^2.7.0",
    "happy-dom": "^15.11.0",

    "@playwright/test": "^1.49.0",
    "axe-core": "^4.10.0",
    "@axe-core/playwright": "^4.10.0",

    "@tanstack/router-plugin": "^1.95.0",
    "@tanstack/router-devtools": "^1.95.0"
  }
}
```

### 3.3 `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    // Router plugin must come before the React plugin
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // During development, proxy /api and /ws to the local tundrad
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7400",
        changeOrigin: false,
      },
      "/ws": {
        target: "ws://127.0.0.1:7400",
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: {
    target: "baseline-widely-available", // Vite 8 default
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy libraries into their own chunks for better caching
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-forms": ["formik", "yup"],
        },
      },
    },
  },
});
```

### 3.4 `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",

    "strict": true,
    "noImplicitAny": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,           // Critical for safety
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,

    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "allowJs": false,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts", "playwright.config.ts"],
  "exclude": ["node_modules", "dist", "e2e"]
}
```

### 3.5 `eslint.config.js` (Flat Config)

```js
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.strict.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
    settings: { react: { version: "detect" } },
  },
);
```

---

## 4. Styling System

### 4.1 The Tailwind v4 Approach

Tailwind v4 changes the integration story significantly. There is **no `tailwind.config.js`**. The configuration lives in CSS using the `@theme` directive. This aligns with the design tokens from `brand/tokens/tundra-tokens.tailwind.css` — we drop that file directly into `src/styles/globals.css` with one additional import line.

### 4.2 `src/styles/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";

/* Tundra design tokens — the canonical visual language.
   Source: /brand/tokens/tundra-tokens.tailwind.css */
@theme {
  /* ============================================================
   * COLOR — STRUCTURAL
   * ============================================================ */
  --color-tundra-ink: #1c1f1a;
  --color-tundra-stone: #3a3d38;
  --color-tundra-slate: #6b6f66;
  --color-tundra-lichen: #a8ac9f;
  --color-tundra-frost: #e8e5dc;
  --color-tundra-paper: #f5f2e9;
  --color-tundra-bone: #fbf9f2;

  /* ACCENT */
  --color-tundra-lichen-accent: #7a8a5c;
  --color-tundra-rust: #b5613a;
  --color-tundra-aurora: #5b7a8c;
  --color-tundra-lichen-soft: #e8ecdd;
  --color-tundra-rust-soft: #f2ddd0;
  --color-tundra-aurora-soft: #dee5ea;
  --color-tundra-lichen-deep: #5a6943;
  --color-tundra-rust-deep: #8a4626;
  --color-tundra-aurora-deep: #3f5c6e;

  /* ============================================================
   * SHADCN SEMANTIC ALIASES — what shadcn/ui components consume.
   * These map the Tundra palette onto shadcn's expected tokens.
   * ============================================================ */
  --color-background: var(--color-tundra-paper);
  --color-foreground: var(--color-tundra-ink);

  --color-card: var(--color-tundra-bone);
  --color-card-foreground: var(--color-tundra-ink);

  --color-popover: var(--color-tundra-bone);
  --color-popover-foreground: var(--color-tundra-ink);

  --color-primary: var(--color-tundra-ink);
  --color-primary-foreground: var(--color-tundra-paper);

  --color-secondary: var(--color-tundra-frost);
  --color-secondary-foreground: var(--color-tundra-ink);

  --color-muted: var(--color-tundra-frost);
  --color-muted-foreground: var(--color-tundra-slate);

  --color-accent: var(--color-tundra-lichen-accent);
  --color-accent-foreground: var(--color-tundra-paper);

  --color-destructive: var(--color-tundra-rust);
  --color-destructive-foreground: var(--color-tundra-paper);

  --color-border: var(--color-tundra-frost);
  --color-input: var(--color-tundra-frost);
  --color-ring: var(--color-tundra-lichen-accent);

  /* TYPOGRAPHY */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: "Inter Display", "Inter", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* TYPE SCALE — paired text/line-height */
  --text-2xs: 11px;
  --text-2xs--line-height: 16px;
  --text-xs: 12px;
  --text-xs--line-height: 18px;
  --text-sm: 14px;
  --text-sm--line-height: 20px;
  --text-base: 16px;
  --text-base--line-height: 24px;
  --text-md: 18px;
  --text-md--line-height: 28px;
  --text-lg: 22px;
  --text-lg--line-height: 30px;
  --text-xl: 28px;
  --text-xl--line-height: 36px;
  --text-2xl: 36px;
  --text-2xl--line-height: 44px;
  --text-3xl: 48px;
  --text-3xl--line-height: 56px;
  --text-4xl: 64px;
  --text-4xl--line-height: 72px;

  /* RADIUS */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-xl: 16px;

  /* SHADOWS */
  --shadow-xs: 0 1px 2px 0 rgba(28, 31, 26, 0.04);
  --shadow-sm: 0 1px 3px 0 rgba(28, 31, 26, 0.06), 0 1px 2px 0 rgba(28, 31, 26, 0.04);
  --shadow-md: 0 4px 8px -2px rgba(28, 31, 26, 0.08), 0 2px 4px -2px rgba(28, 31, 26, 0.04);
  --shadow-lg: 0 10px 20px -4px rgba(28, 31, 26, 0.10), 0 4px 8px -4px rgba(28, 31, 26, 0.04);
}

/* ============================================================
 * DARK THEME — applied via `[data-theme="dark"]`
 * ============================================================ */
@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

[data-theme="dark"] {
  --color-background: #1c1f1a;
  --color-foreground: #f5f2e9;
  --color-card: #262924;
  --color-card-foreground: #f5f2e9;
  --color-popover: #262924;
  --color-popover-foreground: #f5f2e9;
  --color-primary: #f5f2e9;
  --color-primary-foreground: #1c1f1a;
  --color-secondary: #2e312c;
  --color-secondary-foreground: #f5f2e9;
  --color-muted: #2e312c;
  --color-muted-foreground: #a8ac9f;
  --color-accent: #94a472;
  --color-accent-foreground: #1c1f1a;
  --color-destructive: #c97a55;
  --color-destructive-foreground: #f5f2e9;
  --color-border: #2e312c;
  --color-input: #2e312c;
  --color-ring: #94a472;
}

/* Font loading */
@font-face {
  font-family: "Inter";
  src: url("/fonts/Inter.var.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "Inter Display";
  src: url("/fonts/InterDisplay.var.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/JetBrainsMono.var.woff2") format("woff2-variations");
  font-weight: 100 800;
  font-display: swap;
}

/* Application base styles */
html, body, #root { height: 100%; }
body {
  font-family: var(--font-sans);
  font-feature-settings: "cv02", "cv03", "cv04", "cv11"; /* Inter stylistic alternates */
  background: var(--color-background);
  color: var(--color-foreground);
  -webkit-font-smoothing: antialiased;
}
```

### 4.3 The `cn()` Utility

`src/lib/utils.ts` is the standard shadcn/ui helper, used by every component for class composition:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 4.4 The `components.json` Config

```jsonc
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/lib"
  },
  "iconLibrary": "lucide"
}
```

---

## 5. The shadcn/ui Component Catalog

Every primitive used in the panel, with the install command, the role it plays, and where it appears.

### 5.1 Installation Pattern

shadcn/ui components are **owned**, not imported from a package. Adding a component runs:

```bash
pnpm shadcn add button
# Adds src/components/ui/button.tsx — yours to edit, version, restyle.
```

### 5.2 Bulk Install for v1.0

The full primitive set is added at project init with one command:

```bash
pnpm shadcn add button card dialog dropdown-menu form input label select \
  separator sheet sonner table tabs tooltip popover checkbox switch \
  textarea badge avatar scroll-area accordion alert alert-dialog \
  command navigation-menu progress radio-group skeleton breadcrumb \
  pagination calendar date-picker toggle toggle-group context-menu \
  hover-card collapsible chart sidebar
```

### 5.3 Component → Use Site Mapping

| Primitive | Where used |
|-----------|-----------|
| `button` | Everywhere — primary action, secondary, destructive variants |
| `card` | Site cards, server cards, dashboard tiles, plugin cards |
| `dialog` | Confirmation modals, full-screen create flows |
| `dropdown-menu` | Operator menu, row actions on tables |
| `form` | Wraps every form (RHF integration) |
| `input` / `label` / `textarea` | Form fields throughout |
| `select` | Runtime version pickers, server pickers, region pickers |
| `separator` | Visual dividers in dense layouts |
| `sheet` | Right-side detail drawers (site detail, deployment detail) |
| `sonner` | Toast notifications (replaces deprecated `toast`) |
| `table` | Sites list, servers list, deployments, audit log, every list view |
| `tabs` | Site detail (Overview / Deploys / Logs / Settings), server detail |
| `tooltip` | Compact icon buttons, abbreviated labels |
| `popover` | DNS record editor, quick actions, color pickers |
| `checkbox` / `radio-group` / `switch` | Settings toggles, multi-select filters |
| `badge` | Status pills (running, failed, pending), version badges |
| `avatar` | Operator avatars (header), GitHub repo avatars |
| `scroll-area` | Long lists, sidebars, log streams |
| `accordion` | Settings sections, plugin capabilities review |
| `alert` | Inline notices, deprecation warnings, info banners |
| `alert-dialog` | Destructive confirmations ("Delete this site?") |
| `command` | The global command palette (⌘K / Ctrl+K) |
| `navigation-menu` | Top-level navigation in compact layouts |
| `progress` | Deploy progress, backup progress, file upload |
| `skeleton` | Loading states for cards, tables, charts |
| `breadcrumb` | Page hierarchy (Sites › example.com › Logs) |
| `pagination` | Long table results |
| `calendar` / `date-picker` | Backup scheduling, log time range |
| `toggle` / `toggle-group` | View switchers (grid/list, hour/day/week) |
| `context-menu` | Right-click on tables (power-user shortcut) |
| `hover-card` | Inline previews for sites, servers, deployments |
| `collapsible` | Expandable rows, nested settings |
| `chart` | Recharts wrapper for metrics, deploy histograms |
| `sidebar` | The primary nav sidebar (with collapse, mobile drawer) |

### 5.4 Tundra-Specific Compound Components

Components in `src/components/tundra/` are not generic primitives — they are domain-shaped. A few are specified here; the full set is in §10.

**`<TundraMark>`** — the brand mark, as a React component, sized by prop:

```tsx
// src/components/tundra/tundra-mark.tsx
import { cn } from "@/lib/utils";

interface TundraMarkProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  variant?: "default" | "compact";
}

export function TundraMark({
  size = 24,
  variant = "default",
  className,
  ...props
}: TundraMarkProps) {
  const path =
    variant === "compact"
      ? "M 120 18 L 142 102 L 178 120 L 142 138 L 120 222 L 98 138 L 62 120 L 98 102 Z"
      : "M 120 12 L 137 102 L 172 120 L 137 138 L 120 228 L 103 138 L 68 120 L 103 102 Z";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 240"
      width={size}
      height={size}
      role="img"
      aria-label="Tundra"
      className={cn("text-foreground", className)}
      {...props}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
```

**`<ServerStatusPill>`** — a status badge that subscribes to live server health updates:

```tsx
// src/components/tundra/server-status-pill.tsx
import { Badge } from "@/components/ui/badge";
import { useServer } from "@/lib/api/queries";
import { useServerEvents } from "@/lib/ws/hooks";

const statusVariant = {
  active: "default",        // Lichen accent
  provisioning: "secondary",
  degraded: "outline",      // Aurora
  offline: "destructive",   // Rust
  disabled: "secondary",
} as const;

export function ServerStatusPill({ serverId }: { serverId: string }) {
  const { data: server } = useServer(serverId);
  useServerEvents(serverId); // Subscribes; query auto-refreshes on event

  if (!server) return null;
  return (
    <Badge variant={statusVariant[server.status]}>
      {server.status}
    </Badge>
  );
}
```

The full Tundra component catalog is documented in §10 with each component's purpose, props, and styling rules.

---

## 6. Routing — TanStack Router

### 6.1 Why TanStack Router

TanStack Router is **type-safe end to end**: route paths, search params, route data are all typed; the compiler catches a typo in a `to="/sites/:siteId"` link. It supports both file-based and code-based route definitions; we use **file-based** with the Vite plugin for ergonomics.

The router also supports modern data loading semantics — `loader` functions, parallel data fetching, deferred data — which we use sparingly because TanStack Query handles most fetching.

### 6.2 The Route Tree

The route tree mirrors the file structure under `src/routes/`. The `_auth` prefix denotes a layout group requiring authentication. The `__root` is the top-level layout (sidebar, header, providers).

```
__root
└── _auth (layout: app shell)
    ├── /                           → /dashboard (redirect)
    ├── /dashboard                  → DashboardPage
    ├── /servers                    → ServersListPage
    ├── /servers/:serverId          → ServerDetailPage (tabs: overview, services, packages, firewall, settings)
    ├── /sites                      → SitesListPage
    ├── /sites/:siteId              → SiteDetailPage (tabs: overview, deploys, logs, env, scheduled tasks, settings)
    ├── /sites/:siteId/deployments  → DeploymentsListPage
    ├── /sites/:siteId/logs         → LogsPage (live stream)
    ├── /domains                    → DomainsListPage
    ├── /databases                  → DatabasesListPage
    ├── /mail                       → MailPage
    ├── /backups                    → BackupsPage
    ├── /plugins                    → PluginsListPage
    ├── /plugins/:pluginId          → PluginDetailPage
    ├── /migrations                 → MigrationsPage
    └── /settings                   → SettingsPage (operators, MCP, notifications, theme)
└── /login                          → LoginPage (no app shell)
└── /setup                          → InitialSetupPage (no app shell)
```

### 6.3 Reference Implementation — Auth-Guarded Layout

The `_auth.tsx` layout enforces authentication at the route level:

```tsx
// src/routes/_auth.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { authStore } from "@/lib/auth/store";

export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ location }) => {
    const operator = authStore.getState().operator;
    if (!operator) {
      throw redirect({
        to: "/login",
        search: { redirectTo: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
```

### 6.4 Reference Implementation — Site Detail Route with Loader

```tsx
// src/routes/_auth.sites.$siteId.tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { sitesQueryOptions, siteQueryOptions } from "@/lib/api/queries";
import { SiteHeader } from "@/components/tundra/site-header";

export const Route = createFileRoute("/_auth/sites/$siteId")({
  // Pre-fetch the site data — TanStack Query handles caching
  loader: async ({ context: { queryClient }, params: { siteId } }) => {
    await queryClient.ensureQueryData(siteQueryOptions(siteId));
  },
  component: SiteDetailLayout,
});

function SiteDetailLayout() {
  const { siteId } = Route.useParams();
  return (
    <>
      <SiteHeader siteId={siteId} />
      <Outlet />
    </>
  );
}
```

### 6.5 Search Params with Validation

TanStack Router validates search params via a Zod schema. The Logs page is a good example — log time range, log level, and search query all in URL:

```tsx
// src/routes/_auth.sites.$siteId.logs.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LogStream } from "@/components/tundra/log-stream";

const logsSearchSchema = z.object({
  level: z.enum(["all", "error", "warn", "info", "debug"]).default("all"),
  since: z.coerce.date().optional(),
  query: z.string().optional(),
  follow: z.boolean().default(true),
});

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
  validateSearch: logsSearchSchema,
  component: LogsPage,
});

function LogsPage() {
  const { siteId } = Route.useParams();
  const { level, since, query, follow } = Route.useSearch();
  return <LogStream siteId={siteId} level={level} since={since} query={query} follow={follow} />;
}
```

The URL is now the source of truth for the log view state. Operators can deep-link to `/sites/abc/logs?level=error&follow=false` and share it.

---

## 7. Data Layer — TanStack Query

### 7.1 Why TanStack Query (Not Redux Toolkit Query, Not SWR)

TanStack Query is the de facto standard for server state in React 19 — caching, deduplication, background refetching, optimistic updates, infinite queries, mutations. It does not replace client state; we use Zustand for that. The two coexist clearly: server data goes in Query, UI state goes in Zustand.

### 7.2 The Query Client

`src/lib/api/client.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,                    // 30s — most panel data is short-lived
      gcTime: 5 * 60_000,                   // 5min — keep in cache for back navigation
      refetchOnWindowFocus: true,           // Re-check on tab return
      refetchOnReconnect: true,
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx; auth/validation errors are not transient
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,                         // Mutations are operator-initiated; no auto-retry
    },
  },
});
```

### 7.3 The HTTP Client

We use **ofetch** (the modern fetch wrapper from the unjs collective) for the HTTP layer. It is small, isomorphic, with hooks for interceptors:

```ts
// src/lib/api/fetch.ts
import { ofetch } from "ofetch";
import { authStore } from "@/lib/auth/store";

export const api = ofetch.create({
  baseURL: "/api/v1",
  retry: 0,                                  // TanStack Query owns retry logic
  onRequest({ options }) {
    // Attach auth header for any session-bearing request
    const token = authStore.getState().sessionToken;
    if (token) {
      options.headers = new Headers(options.headers);
      options.headers.set("Authorization", `Bearer ${token}`);
    }
  },
  onResponseError({ response }) {
    // 401 = session expired; clear and redirect to /login
    if (response.status === 401) {
      authStore.getState().clearSession();
      window.location.href = "/login";
    }
  },
});
```

### 7.4 Query Hooks — Conventions

Every API resource gets paired query and mutation hooks. The naming is strict:

- **`useThing(id)`** — single resource by ID
- **`useThings(filter?)`** — list resource with optional filter
- **`useCreateThing()`** — mutation: create
- **`useUpdateThing()`** — mutation: update
- **`useDeleteThing()`** — mutation: delete
- **`useThingAction(id)`** — non-CRUD mutation (e.g., `useDeploySite`, `useRestartService`)

### 7.5 Reference Implementation — Sites Queries

```ts
// src/lib/api/queries.ts
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./fetch";
import type { Site, SiteListFilter } from "./types";

// Query options factory — usable from both hooks and route loaders
export const sitesQueryOptions = (filter?: SiteListFilter) =>
  queryOptions({
    queryKey: ["sites", filter],
    queryFn: () => api<Site[]>("/sites", { query: filter }),
  });

export const siteQueryOptions = (siteId: string) =>
  queryOptions({
    queryKey: ["sites", siteId],
    queryFn: () => api<Site>(`/sites/${siteId}`),
  });

// Hook wrappers
export const useSites = (filter?: SiteListFilter) => useQuery(sitesQueryOptions(filter));
export const useSite = (siteId: string) => useQuery(siteQueryOptions(siteId));
```

### 7.6 Reference Implementation — Deploy Mutation with Optimistic Updates

```ts
// src/lib/api/mutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./fetch";
import { toast } from "@/lib/ui/toast";
import type { Deployment, DeployRequest } from "./types";

export function useDeploySite(siteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeployRequest) =>
      api<Deployment>(`/sites/${siteId}/deployments`, {
        method: "POST",
        body: input,
      }),

    onMutate: async () => {
      // Cancel in-flight queries that would overwrite our optimistic data
      await queryClient.cancelQueries({ queryKey: ["sites", siteId, "deployments"] });

      const previousDeployments = queryClient.getQueryData(["sites", siteId, "deployments"]);

      // Optimistically add a "pending" deployment
      queryClient.setQueryData(["sites", siteId, "deployments"], (old: Deployment[] = []) => [
        {
          id: `optimistic-${Date.now()}`,
          status: "queued",
          triggered_by: "manual",
          started_at: null,
          finished_at: null,
          created_at: new Date().toISOString(),
        },
        ...old,
      ]);

      return { previousDeployments };
    },

    onError: (err, _input, context) => {
      // Roll back on failure
      if (context?.previousDeployments) {
        queryClient.setQueryData(
          ["sites", siteId, "deployments"],
          context.previousDeployments,
        );
      }
      toast.error("Deploy failed", { description: err.message });
    },

    onSuccess: (deployment) => {
      toast.success("Deploy queued", {
        description: `Deployment ${deployment.id.slice(0, 7)} starting`,
      });
    },

    onSettled: () => {
      // Re-fetch the canonical list — replaces optimistic with real
      queryClient.invalidateQueries({ queryKey: ["sites", siteId, "deployments"] });
    },
  });
}
```

### 7.7 OpenAPI-Generated Types

Tundra's API is documented as OpenAPI 3.1. The frontend generates `src/lib/api/types.ts` from the spec at build time:

```bash
pnpm openapi-typescript ../proto/openapi.yaml -o src/lib/api/types.ts
```

This is a `prebuild` step in `package.json` so the types stay in sync with the API.

---

## 8. Real-Time — WebSocket Layer

### 8.1 The Channel

Tundra exposes a single authenticated WebSocket endpoint at `/ws/v1/events`. The frontend opens **one connection**, then multiplexes subscriptions over it. This avoids the connection-explosion problem some panels suffer from.

### 8.2 Event Shape

```ts
// src/lib/ws/types.ts
export type TundraEvent =
  | { type: "deploy.started"; site_id: string; deployment_id: string }
  | { type: "deploy.progress"; deployment_id: string; progress: number; line: string }
  | { type: "deploy.succeeded"; deployment_id: string; site_id: string }
  | { type: "deploy.failed"; deployment_id: string; site_id: string; error: string }
  | { type: "site.health.changed"; site_id: string; status: SiteStatus }
  | { type: "server.metrics"; server_id: string; metrics: ServerMetrics }
  | { type: "log.line"; site_id: string; line: string; level: LogLevel; ts: string }
  | { type: "alert.fired"; alert_id: string; severity: AlertSeverity; summary: string };
```

### 8.3 The Client

```ts
// src/lib/ws/client.ts
import { authStore } from "@/lib/auth/store";
import type { TundraEvent } from "./types";

type Listener = (event: TundraEvent) => void;

class TundraWebSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    const token = authStore.getState().sessionToken;
    if (!token) return;

    const url = new URL("/ws/v1/events", window.location.href);
    url.protocol = url.protocol.replace("http", "ws");
    url.searchParams.set("token", token);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as TundraEvent;
        this.listeners.forEach((l) => l(event));
      } catch {
        // Ignore malformed
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => this.ws?.close();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

export const tundraWs = new TundraWebSocket();
```

### 8.4 Hooks for Components

Components subscribe via small, focused hooks that filter the global event stream:

```ts
// src/lib/ws/hooks.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tundraWs } from "./client";
import type { TundraEvent } from "./types";

export function useEvent<T extends TundraEvent["type"]>(
  type: T,
  handler: (event: Extract<TundraEvent, { type: T }>) => void,
) {
  useEffect(() => {
    return tundraWs.subscribe((event) => {
      if (event.type === type) handler(event as Extract<TundraEvent, { type: T }>);
    });
  }, [type, handler]);
}

/** When the deployment for a site completes, invalidate that site's queries. */
export function useDeploymentCompletion(siteId: string) {
  const queryClient = useQueryClient();
  useEvent("deploy.succeeded", (event) => {
    if (event.site_id === siteId) {
      void queryClient.invalidateQueries({ queryKey: ["sites", siteId] });
    }
  });
  useEvent("deploy.failed", (event) => {
    if (event.site_id === siteId) {
      void queryClient.invalidateQueries({ queryKey: ["sites", siteId] });
    }
  });
}

/** Live log line stream for a site. */
export function useLogStream(siteId: string, onLine: (line: string, level: string, ts: string) => void) {
  useEvent("log.line", (event) => {
    if (event.site_id === siteId) onLine(event.line, event.level, event.ts);
  });
  useEffect(() => {
    tundraWs.send({ subscribe: { logs: siteId } });
    return () => tundraWs.send({ unsubscribe: { logs: siteId } });
  }, [siteId]);
}
```

The pattern is consistent: opening the panel, the websocket connects once; views subscribe and unsubscribe to relevant event slices via hooks; TanStack Query's cache is the place where data lives, and event handlers invalidate the right queries to trigger re-renders.

---

## 9. State Management — Zustand

### 9.1 Where Zustand Lives, vs. TanStack Query

**TanStack Query owns server state.** Sites, deployments, mail, backups — anything that lives on the server. Don't put server data in Zustand.

**Zustand owns client state.** Auth session, theme preference, sidebar collapsed state, command palette open/closed, transient UI flags. The kind of state that has no server-side counterpart.

### 9.2 Reference Implementation — Auth Store

```ts
// src/lib/auth/store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Operator {
  id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "operator" | "readonly";
  avatar_url?: string;
}

interface AuthState {
  operator: Operator | null;
  sessionToken: string | null;
  setSession: (operator: Operator, token: string) => void;
  clearSession: () => void;
}

export const authStore = create<AuthState>()(
  persist(
    (set) => ({
      operator: null,
      sessionToken: null,
      setSession: (operator, token) => set({ operator, sessionToken: token }),
      clearSession: () => set({ operator: null, sessionToken: null }),
    }),
    { name: "tundra-auth" },
  ),
);

// Convenience hooks
export const useOperator = () => authStore((s) => s.operator);
export const useSessionToken = () => authStore((s) => s.sessionToken);
```

### 9.3 Reference Implementation — Theme Store

```ts
// src/lib/theme/store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark"; // After "system" resolution
  setTheme: (theme: Theme) => void;
}

export const themeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      resolvedTheme: "light",
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    { name: "tundra-theme" },
  ),
);

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
  themeStore.setState({ resolvedTheme: resolved });
}

// On load + on system change
applyTheme(themeStore.getState().theme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (themeStore.getState().theme === "system") applyTheme("system");
});
```

### 9.4 Other Stores

The full Zustand store list:

| Store | File | Purpose |
|-------|------|---------|
| `authStore` | `lib/auth/store.ts` | Operator session |
| `themeStore` | `lib/theme/store.ts` | Light/dark/system + resolved |
| `sidebarStore` | `lib/ui/sidebar.ts` | Sidebar collapsed state, mobile drawer |
| `commandStore` | `lib/ui/command.ts` | Command palette open/close, registered commands |

That's it. Four stores. If a fifth feels needed, the answer is almost always "use TanStack Query."

---

## 10. Forms — RHF/Zod for Simple, Formik/Yup for Complex

### 10.1 The Two-Library Justification

This is a deliberate split, not indecision:

- **React Hook Form + Zod** for single-screen forms: login, env var add, DNS record edit, scheduled task create. RHF is fast, tiny, schema-driven; Zod gives runtime + compile-time types.

- **Formik + Yup** for multi-step wizards: site creation (4 steps), server provisioning (5 steps), Plesk migration setup (6 steps), plugin install with capability review. Formik's field-level orchestration, `FieldArray`, and step-state management are battle-tested for these flows; doing the same in RHF works but feels grafted.

The split is enforced by directory: `src/components/forms/rhf/` vs. `src/components/forms/formik/`. Reviewers can immediately see which tool is in play.

### 10.2 Reference Implementation — RHF + Zod (Simple Form)

```tsx
// src/components/forms/rhf/env-var-form.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateEnvVar } from "@/lib/api/mutations";

const schema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE"),
  value: z.string().min(1, "Value is required"),
  isSecret: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

interface EnvVarFormProps {
  applicationId: string;
  onSuccess?: () => void;
}

export function EnvVarForm({ applicationId, onSuccess }: EnvVarFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: "", value: "", isSecret: true },
  });

  const createEnvVar = useCreateEnvVar(applicationId);

  async function onSubmit(values: FormValues) {
    await createEnvVar.mutateAsync(values);
    form.reset();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Key</FormLabel>
              <FormControl>
                <Input
                  placeholder="DATABASE_URL"
                  autoComplete="off"
                  spellCheck={false}
                  {...field}
                />
              </FormControl>
              <FormDescription>UPPER_SNAKE_CASE conventionally.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Value</FormLabel>
              <FormControl>
                <Input
                  type={form.watch("isSecret") ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isSecret"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
              <div className="space-y-0.5">
                <FormLabel>Treat as secret</FormLabel>
                <FormDescription>
                  Hide the value in the UI and redact it from logs.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={createEnvVar.isPending}>
          {createEnvVar.isPending ? "Saving…" : "Add variable"}
        </Button>
      </form>
    </Form>
  );
}
```

### 10.3 Reference Implementation — Formik + Yup (Multi-Step Wizard)

The site creation wizard demonstrates the Formik pattern. Four steps: source → application → domain → confirm.

```tsx
// src/components/forms/formik/site-create-wizard.tsx
import { Formik, Form, FormikHelpers } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCreateSite } from "@/lib/api/mutations";
import { SourceStep } from "./site-create/source-step";
import { ApplicationStep } from "./site-create/application-step";
import { DomainStep } from "./site-create/domain-step";
import { ConfirmStep } from "./site-create/confirm-step";

export interface SiteCreateValues {
  // Step 1 — Source
  sourceKind: "github" | "gitlab" | "blank" | "template";
  repository?: { fullName: string; defaultBranch: string };
  branch?: string;
  templateSlug?: string;

  // Step 2 — Application
  applicationType: "static" | "php" | "laravel" | "nodejs" | "python" | "go" | "rust" | "docker";
  runtimeVersion: string;
  buildCommand?: string;
  startCommand?: string;

  // Step 3 — Domain
  domain: string;
  serverId: string;
  enableTls: boolean;

  // Step 4 — Confirm; nothing additional
}

const stepSchemas = [
  // Step 1 — Source
  Yup.object({
    sourceKind: Yup.string().oneOf(["github", "gitlab", "blank", "template"]).required(),
    repository: Yup.object().when("sourceKind", {
      is: "github",
      then: (s) => s.required("Pick a repository"),
    }),
    branch: Yup.string().when("sourceKind", {
      is: "github",
      then: (s) => s.required("Pick a branch"),
    }),
  }),

  // Step 2 — Application
  Yup.object({
    applicationType: Yup.string().required(),
    runtimeVersion: Yup.string().required(),
    buildCommand: Yup.string().when("applicationType", {
      is: (t: string) => ["nodejs", "python", "go", "rust"].includes(t),
      then: (s) => s.required("Build command required for compiled/built runtimes"),
    }),
    startCommand: Yup.string().when("applicationType", {
      is: (t: string) => ["nodejs", "python", "go", "rust", "docker"].includes(t),
      then: (s) => s.required(),
    }),
  }),

  // Step 3 — Domain
  Yup.object({
    domain: Yup.string()
      .required("Domain is required")
      .matches(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Invalid domain"),
    serverId: Yup.string().required("Pick a server"),
    enableTls: Yup.boolean().required(),
  }),

  // Step 4 — Confirm
  Yup.object({}),
];

const STEPS = [
  { key: "source", title: "Source", component: SourceStep },
  { key: "application", title: "Application", component: ApplicationStep },
  { key: "domain", title: "Domain", component: DomainStep },
  { key: "confirm", title: "Confirm", component: ConfirmStep },
];

export function SiteCreateWizard({ onComplete }: { onComplete: (siteId: string) => void }) {
  const [step, setStep] = useState(0);
  const createSite = useCreateSite();
  const StepComponent = STEPS[step].component;

  const initialValues: SiteCreateValues = {
    sourceKind: "github",
    applicationType: "laravel",
    runtimeVersion: "8.4",
    domain: "",
    serverId: "",
    enableTls: true,
  };

  async function handleSubmit(values: SiteCreateValues, helpers: FormikHelpers<SiteCreateValues>) {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      helpers.setTouched({});
      helpers.setSubmitting(false);
      return;
    }
    // Final step — actually create the site
    const site = await createSite.mutateAsync(values);
    helpers.setSubmitting(false);
    onComplete(site.id);
  }

  return (
    <Formik
      initialValues={initialValues}
      validationSchema={stepSchemas[step]}
      onSubmit={handleSubmit}
      validateOnMount
    >
      {(formik) => (
        <Form>
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Step {step + 1} of {STEPS.length}
              </span>
              <span>{STEPS[step].title}</span>
            </div>
            <Progress value={((step + 1) / STEPS.length) * 100} />
          </div>

          <StepComponent />

          <div className="mt-8 flex justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
            <Button type="submit" disabled={!formik.isValid || formik.isSubmitting}>
              {step === STEPS.length - 1
                ? formik.isSubmitting
                  ? "Creating site…"
                  : "Create site"
                : "Continue"}
            </Button>
          </div>
        </Form>
      )}
    </Formik>
  );
}
```

The individual step components (`SourceStep`, `ApplicationStep`, etc.) consume Formik via `useFormikContext<SiteCreateValues>()` and use the shadcn/ui primitives for fields. They are simple read-and-update components; the orchestration lives in the parent.

### 10.4 Form Library Decision Matrix

When in doubt, this matrix:

| Form has… | Library |
|-----------|---------|
| ≤ 8 fields, single screen, no conditional logic | RHF + Zod |
| Conditional fields based on user choices | RHF + Zod |
| One field validates against another (e.g., password match) | RHF + Zod |
| Multi-step / wizard pattern | Formik + Yup |
| Dynamic field arrays (rules, env vars, FieldArray-heavy) | Formik + Yup |
| Server-rendered initial values that change between steps | Formik + Yup |
| Plugin-defined dynamic fields | Formik + Yup |

---

## 11. Authentication — Reference Implementation

The full auth flow, end to end. This is the canonical example for the patterns above (RHF, Zustand, TanStack Query, route guards).

### 11.1 Login Page

```tsx
// src/routes/login.tsx
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TundraMark } from "@/components/tundra/tundra-mark";
import { authStore } from "@/lib/auth/store";
import { api } from "@/lib/api/fetch";
import { tundraWs } from "@/lib/ws/client";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  totp: z.string().optional(),
});

const loginSearchSchema = z.object({
  redirectTo: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirectTo } = useSearch({ from: "/login" });
  const [needsTotp, setNeedsTotp] = useState(false);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", totp: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      const response = await api<{ operator: any; token: string }>("/auth/login", {
        method: "POST",
        body: values,
      });
      authStore.getState().setSession(response.operator, response.token);
      tundraWs.connect(); // Open the websocket once authed
      void navigate({ to: redirectTo ?? "/dashboard" });
    } catch (err: any) {
      if (err.data?.error === "totp_required") {
        setNeedsTotp(true);
        form.setFocus("totp");
        return;
      }
      form.setError("password", { message: err.data?.message ?? "Login failed" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <TundraMark size={40} className="mx-auto" />
          <CardTitle className="font-display text-2xl">Sign in to Tundra</CardTitle>
          <CardDescription>The control plane awaits.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {needsTotp && (
                <FormField
                  control={form.control}
                  name="totp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authentication code</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="123 456"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
```

This single page demonstrates almost every pattern in this document: TanStack Router with validated search params, Zustand store mutation, RHF + Zod form, shadcn/ui primitives, the brand mark component, error handling for the 2FA-required flow, and ofetch for the API call.

---

## 12. Page-by-Page Wireframe Spec

This section specifies every page in the panel — what it shows, how it's laid out, what shadcn/ui primitives compose it. Every page is described as a wireframe, not as code.

### 12.1 Dashboard (`/dashboard`)

The home view. Operator lands here after login.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Sidebar │  Page header: "Dashboard"                          ⌘K     │
│         │                                                            │
│         │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│         │  │ Servers  │ │  Sites   │ │ Deploys  │ │  Alerts  │    │
│         │  │   12     │ │   34     │ │  today 8 │ │    1     │    │
│         │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│         │                                                            │
│         │  Recent activity                                           │
│         │  ┌──────────────────────────────────────────────────┐   │
│         │  │ ● 2m ago   site api.example.com — deploy succeeded│   │
│         │  │ ● 14m ago  site shop.example.com — TLS renewed   │   │
│         │  │ ● 31m ago  server vps-blr-01 — package update    │   │
│         │  │ ● 47m ago  alert — disk usage > 85% on vps-fra-01│   │
│         │  └──────────────────────────────────────────────────┘   │
│         │                                                            │
│         │  Server health (compact strip)                             │
│         │  vps-blr-01  ████████░░  vps-fra-01 ███████████          │
└─────────────────────────────────────────────────────────────────────┘
```

**Composition:** four `Card` tiles top, `ScrollArea` for activity, mini metric bars beneath using the `Chart` primitive. Live-updating via `useEvent` hooks for `deploy.succeeded`, `alert.fired`, `server.metrics`.

### 12.2 Sites — List (`/sites`)

Primary working surface for most operators.

- **Top bar:** title, search input, filter dropdown (status, type, server), `+ Create site` button (right-aligned, primary).
- **Body:** `Table` with columns: Domain, Type, Server, Status, Last deploy, Actions (dropdown). Sortable, paginated.
- **Empty state:** illustration (the brand horizon mark, large), title "No sites yet", primary CTA "Create your first site", secondary CTA "Or import from Plesk".
- **Row right-click:** context menu (open, deploy, settings, delete).

### 12.3 Sites — Detail (`/sites/:siteId`)

- **Header strip:** site mark icon (based on application type), domain name (large), status badge, primary action button "Deploy", overflow menu (rename, archive, delete).
- **Tabs:** Overview · Deploys · Logs · Environment · Scheduled tasks · Settings.

#### Overview tab

Two-column layout. Left column: recent deployments (last 10), live deploy progress card if a deploy is running. Right column: site metadata (server, runtime version, document root, base path), TLS info (issuer, expiry, auto-renew toggle), DNS quickview (A/AAAA records with values).

#### Deploys tab

Full `Table` of deployments with columns: SHA, message, triggered by, status, duration, actions. Each row click opens a `Sheet` (right drawer) with the full build log.

#### Logs tab

A `LogStream` component (Tundra-specific). Live tail by default; the search params control level filter, since-time, query. Dark mode background even in light mode (logs read better on dark). The toolbar above has follow toggle, level filter, search, time-range picker.

#### Environment tab

`Table` of env vars with columns: Key, Value (masked for secrets, "Show" button reveals temporarily), Updated. `+ Add variable` button opens a `Dialog` with the RHF env-var form.

#### Scheduled tasks tab

`Table` with cron expression, command, last run, exit code, run-now action. `+ Add task` opens a `Dialog`.

#### Settings tab

`Accordion` of sections: Domain & aliases · TLS · Application config · Health checks · Build & deploy · Resources & quotas · Danger zone (delete site).

### 12.4 Servers — List (`/servers`)

Card grid (not table — server cards benefit from spatial layout). Each card shows:

- Server name, region, IP
- Live status pill (`ServerStatusPill`)
- 24-hour CPU/memory sparkline (`Chart` primitive)
- Site count, deploy count this week
- Last seen time

`+ Add server` button top-right opens the multi-step Formik wizard.

### 12.5 Servers — Detail (`/servers/:serverId`)

- **Header:** server name, IP, region, status pill, primary action "Open SSH" (copies a `tundra ssh <id>` command), overflow (reboot, disable, remove).
- **Tabs:** Overview · Services · Packages · Firewall · Sites · Settings.

Each tab uses `Table` for list views, `Card` for grouped settings.

### 12.6 Domains (`/domains`)

`Table` of all domains with columns: Domain, Registrar, DNS managed by, Sites (count), Expiry (with badge for expiring soon), Auto-renew, Actions.

A second `Tabs` row at top: All · Tundra DNS · External DNS · Expiring soon. Filters the table.

### 12.7 Databases (`/databases`)

Two-section layout:

- **Top: Database servers** — `Card` grid for each PG/MySQL/MariaDB/Valkey instance. Status, version, size, connections.
- **Bottom: Databases** — `Table` of every database with columns: Name, Engine, Size, Connections, Actions.

`Sheet` opens for the query console — a Monaco-editor-backed SQL panel (only with Write enabled per database).

### 12.8 Mail (`/mail`)

- `Tabs`: Domains · Mailboxes · Aliases · Queue · Logs.
- Mail domain card shows DKIM/SPF/DMARC validity (live-checked) with traffic-light icons.
- Queue tab is a `Table` with hold/release/delete actions per message.

### 12.9 Backups (`/backups`)

- **Top: Backup targets** — `Card` grid, each shows storage backend, repo size, last backup time, dedup ratio.
- **Bottom: Backup jobs** — `Table` with name, scope, schedule, retention summary, last status, next run.

Restore is a multi-step Formik wizard (5 steps: choose snapshot → choose target → preview → confirm → run).

### 12.10 Plugins (`/plugins`)

- `Tabs`: Installed · Available · Updates.
- Each plugin shown as a `Card` — icon, name, author, version, description, capability summary, status (disabled/enabled), action button.
- Install/grant flow opens a `Dialog` with the capability review (the screen specified in `tundra-plugin-architecture-plan-v1.md` §4.3).

### 12.11 Migrations (`/migrations`)

The Plesk migration plugin's UI surfaces here. List of migration jobs with state, source, target, last activity. Detail view shows the per-site state machine progress.

### 12.12 Settings (`/settings`)

`Tabs`: Profile · Security (2FA, sessions) · Operators · API tokens · MCP server · Notifications · Theme · Advanced.

The MCP tab is the operator-facing surface specified in `tundra-additional-core-plugins-v1.md` §4.12 — token list, active sessions, recent invocations.

---

## 13. Accessibility

WCAG 2.1 AA conformance is a release blocker, not a stretch goal.

### 13.1 Foundations

- **Semantic HTML.** `<nav>`, `<main>`, `<aside>`, `<button>` (never `<div onClick>` for interactive elements). The `eslint-plugin-jsx-a11y` strict ruleset catches the obvious offenders at lint time.
- **Heading hierarchy.** Each route has exactly one `<h1>`. Heading levels descend logically without skipping.
- **Landmarks.** The app shell sets `role="banner"` on the header, `role="navigation"` on the sidebar, `role="main"` on the content area, `role="contentinfo"` on the footer when present.
- **Focus management.** Every interactive element receives a visible focus ring (Tundra Lichen accent at 2px). Focus traps in dialogs (Radix handles this). Focus restoration to the trigger when a dialog closes (also Radix).
- **Skip links.** The app shell provides a "Skip to main content" link as the first focusable element.

### 13.2 Color & Contrast

The brand palette in `tundra-brand-guidelines-v1.md` §3.6 was already validated for AA contrast. The frontend never introduces additional palette entries that haven't been contrast-checked.

For dynamic content (status badges, chart colors), the `cn()` helper composes classes from the validated palette only. There is no opportunity for a developer to write `text-[#DEADBE]` and ship it.

### 13.3 Keyboard Navigation

Every action achievable with mouse must be achievable with keyboard:

| Pattern | Key |
|---------|-----|
| Open command palette | `⌘K` / `Ctrl+K` |
| Close any dialog/sheet/popover | `Esc` |
| Submit form | `Enter` (within form) |
| Navigate sidebar | `Tab` / `Shift+Tab` |
| Activate a button | `Enter` / `Space` |
| Navigate tabs | `←` / `→` (Radix Tabs) |
| Navigate menus | `↑` / `↓` (Radix DropdownMenu) |
| Select date | Calendar arrow keys (Radix Calendar) |

The command palette is the keyboard power-user's home. It exposes every navigation route, every site, every server, every recent deployment as searchable command.

### 13.4 Screen Reader Support

- Every icon button has `aria-label`. Text-only buttons don't need it; icon-only buttons always do.
- Live regions for important async updates: deploy progress, log lines (with `aria-live="polite"`), new alerts (`aria-live="assertive"`).
- Form errors announce: `<FormMessage>` from shadcn/ui sets `aria-describedby` and screen readers read the error when the field becomes invalid.
- Status badges include screen-reader text: `<Badge>active <span class="sr-only">— site is live and healthy</span></Badge>`.

### 13.5 Motion & Reduced Motion

`prefers-reduced-motion` is honored throughout:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Loading skeletons replace shimmer animations with static low-contrast blocks under reduced motion.

### 13.6 Automated Audit

Every PR runs an axe-core pass via the Playwright suite:

```ts
// e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "/login",
  "/dashboard",
  "/sites",
  "/servers",
  "/domains",
  "/databases",
  "/mail",
  "/backups",
  "/plugins",
  "/settings",
];

for (const route of ROUTES) {
  test(`a11y: ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
```

A violation fails the build. There is no exceptions list; violations get fixed.

---

## 14. Performance

### 14.1 Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint (1 vCPU server, throttled) | < 800 ms |
| Largest Contentful Paint | < 1.5 s |
| Time to Interactive | < 2 s |
| Cumulative Layout Shift | < 0.05 |
| First bundle (compressed) | < 180 KB |
| Total JS (compressed, all chunks) | < 600 KB |
| API roundtrip (panel → tundrad → panel, same host) | < 80 ms p99 |

### 14.2 Bundle Discipline

- **Code split per route.** TanStack Router with `autoCodeSplitting: true` (in `vite.config.ts`) gives this for free.
- **Lazy-load heavy primitives.** Recharts (~80 KB), Monaco editor (when used in the database query console), the markdown renderer (used in plugin descriptions) — all dynamically imported when first needed.
- **Manual chunks for stability.** Vendor chunks for React, Router, Query, Charts, Forms — see `vite.config.ts` in §3.3. Stable chunks mean cache hits across releases.
- **No moment.js, no lodash.** date-fns for dates (per-function imports). Native `Array` / `Object` / `Map` methods over lodash. The bundler tree-shakes these effectively.
- **Tailwind v4's automatic content scanning** keeps the CSS footprint tight; only used utilities ship.

### 14.3 Runtime Discipline

- **TanStack Query staleness** — 30s default. Prevents unnecessary refetches.
- **Pagination on tables** — every list view paginates server-side. No client-side filter of 10,000 rows.
- **`useMemo` and `useCallback`** — reserved for measured wins. No reflexive memoization.
- **List virtualization** — for log streams, audit log, and any view that may exceed 200 rows. Use `@tanstack/react-virtual`.
- **Image optimization** — every brand asset is SVG (the only raster images are user-uploaded avatars and registry plugin icons; both pass through the panel's image proxy with size limits).

### 14.4 The Real-Time Cost

WebSocket events update Query cache. Naive implementations re-render every subscriber on every event. Tundra's pattern:

- Hooks subscribe to specific event types, not the whole stream.
- Event handlers `invalidateQueries` for affected keys — components re-render only if their query key was invalidated.
- High-frequency events (metrics ticks every second per server) are throttled at the WS-client level: 1 update per server per 500ms in-bound to React.

### 14.5 Service Worker (Optional, v1.5)

v1.0 does not ship a service worker. The panel is always-online by definition — it's served by `tundrad` on the same host as the operator's workloads. v1.5 adds an optional service worker for asset caching to reduce LCP on subsequent loads.

---

## 15. Testing Strategy

### 15.1 The Pyramid

| Tier | Tool | What it tests | Volume |
|------|------|--------------|--------|
| Unit | Vitest | Pure logic — formatters, validators, hooks in isolation | Many; sub-second per file |
| Component | Vitest + React Testing Library | Components in isolation with mocked API | Moderate |
| Integration | Vitest + MSW | Components with mocked API, full user flows in DOM | Moderate |
| E2E | Playwright | Real frontend ↔ real backend on a stood-up test cluster | Few; covers critical paths |
| Accessibility | Playwright + axe-core | Per-route a11y compliance | One per route |
| Visual regression | Playwright + screenshots | Pixel-stable layout for key pages | Optional, run on demand |

### 15.2 Vitest Setup

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["**/*.test.ts", "**/*.spec.ts", "src/test/**", "**/types.ts"],
    },
  },
});
```

```ts
// src/test/setup.ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 15.3 Reference Test — Component With Mocked API

```tsx
// src/components/forms/rhf/env-var-form.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { EnvVarForm } from "./env-var-form";

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

test("submits a new env var and clears the form", async () => {
  const user = userEvent.setup();
  const onSuccess = vi.fn();

  server.use(
    http.post("/api/v1/applications/:appId/env-vars", async ({ request }) => {
      const body = await request.json();
      expect(body).toMatchObject({ key: "DATABASE_URL", isSecret: true });
      return HttpResponse.json({ id: "ev_1", ...body }, { status: 201 });
    }),
  );

  render(withProviders(<EnvVarForm applicationId="app_1" onSuccess={onSuccess} />));

  await user.type(screen.getByLabelText("Key"), "DATABASE_URL");
  await user.type(screen.getByLabelText("Value"), "postgres://...");
  await user.click(screen.getByRole("button", { name: /add variable/i }));

  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Key")).toHaveValue("");
});

test("rejects lowercase keys with validation error", async () => {
  const user = userEvent.setup();
  render(withProviders(<EnvVarForm applicationId="app_1" />));

  await user.type(screen.getByLabelText("Key"), "database_url");
  await user.tab();

  expect(await screen.findByText(/UPPER_SNAKE_CASE/)).toBeInTheDocument();
});
```

### 15.4 Playwright E2E

```ts
// e2e/site-create.spec.ts
import { test, expect } from "./fixtures";

test("operator creates a Laravel site from a GitHub repo", async ({ page, login }) => {
  await login();
  await page.goto("/sites");

  await page.getByRole("button", { name: "Create site" }).click();

  // Step 1: Source
  await page.getByLabel("GitHub").click();
  await page.getByPlaceholder("Search repositories…").fill("tundra-test-laravel");
  await page.getByRole("option", { name: /tundra-test-laravel/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: Application
  await expect(page.getByLabel("Application type")).toHaveValue("laravel");
  await expect(page.getByLabel("Runtime version")).toHaveValue("8.4");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: Domain
  await page.getByLabel("Domain").fill("e2e-test.tundra.local");
  await page.getByLabel("Server").click();
  await page.getByRole("option", { name: "test-server-01" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: Confirm
  await page.getByRole("button", { name: "Create site" }).click();

  // Wait for redirect + provisioning
  await expect(page).toHaveURL(/\/sites\/[a-z0-9]+/);
  await expect(page.getByText("e2e-test.tundra.local")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("provisioning");
});
```

### 15.5 Coverage Targets

| Layer | Floor |
|-------|-------|
| Pure utilities (formatters, validators) | 95% |
| Custom hooks | 85% |
| Components with logic | 75% |
| Routes (smoke E2E only) | 100% (every route loads without error) |
| Critical flows (login, deploy, migrate) | 100% E2E |

Coverage drops below floor → PR blocked.

---

## 16. Internationalization (Roadmap)

v1.0 ships English-only. Architecture allows for i18n in v1.5:

- All user-facing strings in `src/i18n/en.json` (a single file for v1.0; one per locale once we expand).
- Strings accessed via a hook: `const t = useT(); t("sites.create.title")`.
- For v1.0, the hook is a pass-through that returns the key; the indirection lets us add real translation later without refactoring.
- Bengali (the author's first language) and Spanish are the v1.5 priority locales.

---

## 17. Build & Deployment

### 17.1 Build Output

`pnpm build` produces:

```
dist/
├── index.html               # Single-page-app shell
├── assets/
│   ├── index-[hash].js      # Entry chunk
│   ├── vendor-react-[hash].js
│   ├── vendor-router-[hash].js
│   ├── vendor-query-[hash].js
│   ├── vendor-charts-[hash].js
│   ├── vendor-forms-[hash].js
│   ├── route-dashboard-[hash].js
│   ├── route-sites-[hash].js
│   └── ... (one chunk per route)
├── styles/
│   └── main-[hash].css
└── fonts/
    ├── Inter.var.woff2
    ├── InterDisplay.var.woff2
    └── JetBrainsMono.var.woff2
```

### 17.2 Bundling Into `tundrad`

The Rust build embeds the `dist/` directory into the `tundrad` binary using `include_dir!`:

```rust
// crates/tundrad-api/src/static_assets.rs
use include_dir::{include_dir, Dir};
static UI_DIST: Dir = include_dir!("$CARGO_MANIFEST_DIR/../../ui/dist");
```

Axum then serves these files at `/_app/*` with proper `Content-Type`, gzip/brotli pre-compression, and `Cache-Control: public, max-age=31536000, immutable` for hashed assets.

### 17.3 Development Workflow

```bash
# Terminal 1: run tundrad in dev mode
cargo run --bin tundrad

# Terminal 2: run the Vite dev server with HMR
cd ui && pnpm dev
```

Vite proxies `/api` and `/ws` to `tundrad` on `127.0.0.1:7400`. Operator browses to `http://localhost:5173` for HMR; production users hit `tundrad` directly at `:7400`.

### 17.4 CI/CD

The frontend builds as part of the Rust workflow:

```yaml
# .github/workflows/build.yml (excerpt)
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: "pnpm"

- name: Install pnpm
  uses: pnpm/action-setup@v4
  with: { version: 10 }

- name: Install frontend deps
  run: cd ui && pnpm install --frozen-lockfile

- name: Lint
  run: cd ui && pnpm lint

- name: Type check
  run: cd ui && pnpm typecheck

- name: Test
  run: cd ui && pnpm test --run --coverage

- name: Build frontend
  run: cd ui && pnpm build

- name: E2E
  run: cd ui && pnpm test:e2e

- name: Build tundrad with embedded UI
  run: cargo build --release --bin tundrad
```

---

## 18. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial complete frontend specification. Vite 8 (Rolldown) + React 19 + Tailwind v4 + shadcn/ui CLI v4. TanStack Router for routing; TanStack Query for server state; Zustand for client state. Forms: RHF+Zod for simple, Formik+Yup for wizards. Brand integration via `@theme` block. Accessibility, performance, testing all specified. |

**Companion Documents:**

- `tundra-technical-implementation-plan-v2.md` — primary architecture
- `tundra-brand-guidelines-v1.md` — visual identity
- `tundra-plugin-architecture-plan-v1.md` — plugin contract (frontend renders plugin contributions)
- `tundra-plesk-migration-plan-v1.md` — migration plugin (frontend has the migrations page)
- `tundra-additional-core-plugins-v1.md` — core plugins (frontend renders the Namecheap, GitHub, MCP pages)

**Planned Follow-up Documents:**

- `tundra-frontend-component-cookbook.md` — every Tundra-specific compound component (`<DeploymentTimeline>`, `<LogStream>`, `<MetricsChart>`, …) with full code, tests, and storybook entry
- `tundra-frontend-storybook.md` — the visual catalog setup (Storybook 9 + Vite + Tailwind)
- `tundra-frontend-i18n-guide.md` — when v1.5 i18n lands
- `tundra-mobile-companion-app-spec.md` — the iOS/Android companion app architecture (post-v1.0)
