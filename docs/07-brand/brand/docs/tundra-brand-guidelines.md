# Tundra — Brand Guidelines

> **The visual identity, voice, and design system for Tundra.**
> One source of truth for everything that wears the name.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-technical-implementation-plan-v2.md`
**Status:** Implementation-Ready Specification

---

## 1. The Idea Behind the Brand

Tundra is named for the landscape it imagines: vast, ordered, low-noise, durable. The brand exists to make that idea visible and felt — in every screen, every download badge, every CLI prompt, every screenshot a teammate pastes into a Slack channel. A brand book is not decoration; it is the operational contract that keeps a project recognizable as it grows.

This document is that contract. It is the canonical reference for anyone — operator, contributor, designer, content writer, third-party integrator — who needs to produce something that wears the Tundra name without diluting it. It is opinionated by design. It tells you what to do. Where it doesn't, it tells you what *not* to do.

The brand has four pillars:

1. **The Mark** — the asymmetric north star. The single most recognizable atom of the identity.
2. **The Palette** — earth-tundra colors. Warm-leaning structural tones, three accents used sparingly.
3. **The Type** — Inter Display for headlines, Inter for body, JetBrains Mono for code and technical metadata.
4. **The Voice** — direct, technical, generous, never breathless. The way Tundra speaks in writing.

Every asset in this book derives from these four pillars. Where this book disagrees with what someone else has produced, this book is right and the artifact is wrong.

---

## 2. The Mark

### 2.1 The Core Idea

The Tundra mark is a **stylized polaris** — a four-pointed star with an elongated vertical axis. It is not a five-pointed sheriff star, not a snowflake, not a generic compass rose. The asymmetry is deliberate and load-bearing: a symmetric four-point star reads as a generic geometric mark; stretching the vertical axis to roughly twice the horizontal signals *navigation by a fixed point in the sky* — which is exactly what Tundra is for an operator's infrastructure.

### 2.2 Construction

| Property | Value |
|----------|-------|
| Vertical axis (north–south) | 432 units (full mark height in 240×240 viewBox) |
| Horizontal axis (east–west) | 208 units |
| Aspect ratio | 2.077 : 1 (≈ golden ratio + half) |
| Inner-vertex pull | 36 units from the center axis |
| Construction | Single closed path, eight vertices (four tips, four inner vertices) |
| Render | Solid fill only. No strokes, no gradients, no shadows |

See the construction diagram (`docs/tundra-mark-construction.svg`) for the geometric reference.

### 2.3 Variants

Five variants ship in `logos/`. Choose the one that fits the context:

| Variant | File | Use when |
|---------|------|----------|
| Mark | `tundra-mark.svg` | The mark alone, in any context above ~24px. Default symbol. |
| Mark — compact | `tundra-mark-compact.svg` | The mark at 16–32px (favicons, dense UI, app icons). Slightly thicker arms to maintain visibility. |
| Mark — horizon | `tundra-mark-horizon.svg` | Brand-storytelling contexts: install screens, hero panels, brand book covers. The mark sits above a tundra horizon line. |
| Wordmark | `tundra-wordmark.svg` | Typography-only contexts where the mark would feel redundant: footer, fine print, embedded social headers. |
| Lockup — horizontal | `tundra-lockup-horizontal.svg` | The default logo for most contexts. Mark + wordmark, side by side. |
| Lockup — stacked | `tundra-lockup-stacked.svg` | Square or portrait contexts: app icons, social profile images, hero panels. |

### 2.4 Clear Space

Maintain a **protected zone** around any mark or lockup placement equal to the mark's east–west width on the left and right, and half that on top and bottom. Inside the protected zone, no competing graphic, edge, or text element is permitted — not even at lower opacity.

This rule is non-negotiable. The most common brand violation is crowding the mark with adjacent text or edges; the protected zone exists precisely to prevent that.

### 2.5 Minimum Sizes

| Form | Minimum size |
|------|--------------|
| Mark alone | 16px wide. Below this, use the favicon variant inside its rounded square container. |
| Lockup horizontal | 96px wide. Below this, use the mark alone. |
| Lockup stacked | 80px wide. Below this, use the mark alone. |

### 2.6 Don'ts

These transformations are **never** acceptable:

- **Don't squash or stretch** — the geometric ratio is fixed.
- **Don't rotate** — the north tip points up. Always.
- **Don't outline** — the mark is a solid form. An outlined version is not the Tundra mark.
- **Don't apply shadows or glows** — earth-tundra means grounded; effects break this.
- **Don't apply gradients** — the mark is one color, full stop.
- **Don't recolor outside the palette** — Ink, Paper, or one of the three accents. Nothing else.

See `docs/tundra-mark-construction.svg` for a visual reference of all six don'ts.

### 2.7 Color Pairings

Acceptable mark color pairings:

| Background | Mark color |
|------------|-----------|
| Tundra Paper (#F5F2E9) | Tundra Ink |
| Tundra Bone (#FBF9F2) | Tundra Ink |
| Tundra Frost (#E8E5DC) | Tundra Ink |
| Tundra Ink (#1C1F1A) | Tundra Paper |
| Tundra Stone (#3A3D38) | Tundra Paper |
| Lichen Accent (#7A8A5C) | Tundra Paper |
| Rust Accent (#B5613A) | Tundra Paper |
| Aurora Accent (#5B7A8C) | Tundra Paper |

The mark is **never** rendered in an accent color on a structural background (no green star on white). The accent colors carry too much semantic weight in the system to be used decoratively.

---

## 3. Color

The full color system is documented visually in `docs/tundra-color-system.svg`. This section is the operational reference.

### 3.1 The Philosophy

Tundra's color system is **earth-tundra**: warm-leaning grays and a single accent green that reads as *natural*, not *Slack-bright*. Every other dev-tool brand reaches for cold blue. Tundra deliberately does not. The result is a system that feels grounded — it could live in a print book or an enamel sign as easily as a web UI.

The structural palette is the load-bearing backbone. The accent palette is what gives the system tension. Most surfaces use only structural colors. Accents earn their presence by appearing rarely.

### 3.2 Structural

| Token | Hex | Role |
|-------|-----|------|
| Tundra Ink | `#1C1F1A` | Primary dark text & dark surfaces. Warm near-black, very slight green tint. Not pure black. |
| Tundra Stone | `#3A3D38` | Secondary text, mid-dark surfaces, code-block backgrounds. |
| Tundra Slate | `#6B6F66` | Tertiary text, muted body copy, secondary metadata. |
| Tundra Lichen | `#A8AC9F` | Dividers, line art, disabled states, faint UI. |
| Tundra Frost | `#E8E5DC` | Subtle backgrounds, card surfaces on Paper, borders. |
| Tundra Paper | `#F5F2E9` | Primary light background. Warm paper white, never pure white. |
| Tundra Bone | `#FBF9F2` | Alternate lightest background. Slightly warmer than Paper. |

### 3.3 Accents

Three accents, each with three depths (soft, default, deep):

| Accent | Soft | Default | Deep | Role |
|--------|------|---------|------|------|
| **Lichen** | `#E8ECDD` | `#7A8A5C` | `#5A6943` | Primary accent. CTAs, success states, the "north-star" reference color. |
| **Rust** | `#F2DDD0` | `#B5613A` | `#8A4626` | Emphasis & danger. Destructive actions, errors, important warnings. |
| **Aurora** | `#DEE5EA` | `#5B7A8C` | `#3F5C6E` | Information. Links, info notices, hyperlinks in dense documentation. |

### 3.4 Usage Discipline

Three rules govern color usage:

**Rule 1 — Structure first, accents second.** A well-designed Tundra surface uses 80%+ structural colors and reaches for accents only where semantically required. A wall of Lichen accent dilutes its meaning.

**Rule 2 — Accents have meanings, not just appearances.** Lichen means *positive / accent / progress*. Rust means *warning / danger / emphasis*. Aurora means *informational / link*. Choose by intent, not by aesthetic.

**Rule 3 — No off-palette colors in core surfaces.** Plugins, marketing pages, and external promotional material may introduce additional palette extensions where needed (a payment gateway plugin can borrow the gateway's brand color in its own UI region), but the core panel, CLI output, and brand assets stay strictly inside the Tundra palette.

### 3.5 Dark Theme

Dark theme inverts the structural palette:

| Token | Light | Dark |
|-------|-------|------|
| Background | Paper `#F5F2E9` | Ink `#1C1F1A` |
| Subtle bg | Frost `#E8E5DC` | `#262924` |
| Elevated bg | Bone `#FBF9F2` | `#2E312C` |
| Foreground | Ink `#1C1F1A` | Paper `#F5F2E9` |
| Muted fg | Stone `#3A3D38` | Lichen `#A8AC9F` |
| Border | Frost `#E8E5DC` | `#2E312C` |

Accents brighten slightly on dark to maintain contrast (Lichen `#7A8A5C` becomes `#94A472` in dark mode, etc.). The full mapping is in `tokens/tundra-tokens.css`.

### 3.6 Accessibility

All listed text-on-background combinations meet **WCAG 2.1 AA** for body text (4.5:1) and large text (3:1). Specifically verified pairings:

| Text | Background | Contrast |
|------|------------|----------|
| Tundra Ink | Tundra Paper | 14.8 : 1 ✓ AAA |
| Tundra Stone | Tundra Paper | 9.3 : 1 ✓ AAA |
| Tundra Slate | Tundra Paper | 4.9 : 1 ✓ AA |
| Tundra Paper | Tundra Ink | 14.8 : 1 ✓ AAA |
| Lichen Deep | Tundra Paper | 6.1 : 1 ✓ AA |
| Rust Deep | Tundra Paper | 7.2 : 1 ✓ AA |

Tundra Lichen `#A8AC9F` on Tundra Paper is **3.0 : 1** — adequate for non-text UI (dividers, icons) only. Never use Lichen for body text on Paper.

---

## 4. Typography

The full type system is documented visually in `docs/tundra-typography.svg`.

### 4.1 The Three Families

| Family | Role | Weights used |
|--------|------|--------------|
| **Inter Display** | Headlines, display, the wordmark itself | 700 (Bold), 900 (Black) |
| **Inter** | Body, UI, paragraphs | 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold) |
| **JetBrains Mono** | Code, terminal output, technical labels, metadata | 400 (Regular), 500 (Medium) |

Inter is the open-source workhorse for screen typography in 2026 — designed for screens, optical-size aware, and globally available. Inter Display is its display-optimized sibling, used for sizes ≥24px where the tighter spacing and refined letterforms read better. JetBrains Mono is the open-source monospace standard with the best programming-ligature support and a humanist character that pairs well with Inter.

### 4.2 Type Scale

A modular scale at ratio 1.250 ("Major Third"):

| Token | Size | Line height | Use |
|-------|------|-------------|-----|
| `text-2xs` | 11px | 16px | Fine print, technical labels (uppercase mono) |
| `text-xs` | 12px | 18px | Captions, footnotes |
| `text-sm` | 14px | 20px | Secondary UI text, table cells |
| `text-base` | 16px | 24px | Body text default |
| `text-md` | 18px | 28px | Lead paragraphs, emphasized body |
| `text-lg` | 22px | 30px | Small headings, callouts |
| `text-xl` | 28px | 36px | h3 |
| `text-2xl` | 36px | 44px | h2 |
| `text-3xl` | 48px | 56px | h1 |
| `text-4xl` | 64px | 72px | Display headings, hero subtitles |
| `text-5xl` | 96px | 100px | Hero titles |
| `text-display` | 148px | 148px | Brand display only (e.g., the wordmark on the OG card) |

### 4.3 Tracking

Inter is optical-size-aware. Apply tracking by size:

| Size range | Tracking | Token |
|------------|----------|-------|
| ≥80px | -0.04em | `tracking-tightest` |
| 32–80px | -0.02em | `tracking-tight` |
| 18–32px | -0.01em | `tracking-snug` |
| 12–18px | 0 | `tracking-normal` |
| Caps mono ≤14px | 0.05–0.1em | `tracking-wider` / `tracking-widest` |

### 4.4 Hierarchy Rules

- **Headlines use Inter Display 900 (Black)** for hero treatments, **700 (Bold)** for h2/h3.
- **Body uses Inter 400** at 16px on Tundra Stone (`#3A3D38`).
- **Lead paragraphs use Inter 500** at 22px on Tundra Ink for emphasis.
- **Technical labels use JetBrains Mono 500** in uppercase with `tracking-widest` on Tundra Slate. This is the eyebrow / metadata convention used throughout the brand sheets.
- **Code uses JetBrains Mono 400** at 14px on Tundra Ink dark surfaces; never on Paper — code blocks always sit in dark surfaces.

### 4.5 Italic, Bold, Underline

- **Italic** is rare and reserved for editorial emphasis (the *kind* of word a sober book would italicize).
- **Bold** within body uses Inter 600 (SemiBold), not 700 — full Bold is reserved for headings.
- **Underline** is reserved for links. No underlined headings, no underlined emphasis.

### 4.6 Loading the Fonts

Bundle Inter and JetBrains Mono with the panel UI; do not rely on Google Fonts CDN at runtime (privacy + offline). The Tundra UI ships them as woff2 in `/_app/fonts/` with `font-display: swap` for graceful loading.

```css
@font-face {
  font-family: 'Inter';
  src: url('/_app/fonts/Inter.var.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'Inter Display';
  src: url('/_app/fonts/InterDisplay.var.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('/_app/fonts/JetBrainsMono.var.woff2') format('woff2-variations');
  font-weight: 100 800;
  font-display: swap;
}
```

---

## 5. Voice & Tone

Brands fall apart at the writing layer faster than the visual layer. This section is the verbal contract.

### 5.1 The Voice in One Paragraph

Tundra speaks like a senior engineer who respects the reader's time. It is direct, technical, and generous — generous in the sense that it explains the *why* without being asked, but never lectures. It uses precise nouns. It does not breathe through paragraphs of marketing copy. It would rather show one working command than describe ten features. When something fails, it says what failed, why, and what to try — in that order, and in that few words.

### 5.2 The Five Tone Principles

**1. Direct over breathless.** "Deploys in under 30 seconds" beats "Lightning-fast deployment that revolutionizes your workflow." Stating a measured fact builds more trust than any superlative ever has.

**2. Technical without being smug.** Use the right word for the right thing — "atomic deploy," "zero-downtime cutover," "WAL archiving." Never use jargon as a wall to gatekeep the reader. If a term is unfamiliar, link the concept rather than dumbing the term down.

**3. Generous about the how.** Show concrete commands and configs. Operators trust software that shows its work. Marketing pages that hide the actual install process are signaling that the install is bad.

**4. Honest about limits.** When a feature isn't supported, say so. "Tundra v1.0 is single-tenant; reseller hierarchies are not supported." Never pretend a limit is a deliberate feature.

**5. Quiet about itself.** The brand book is the only place Tundra talks about Tundra. In documentation, error messages, and CLI output, the user is the subject. "Deploying example.com…" not "Tundra is deploying example.com…"

### 5.3 Voice Examples

#### Marketing copy

- ✓ **A self-hosted server-management platform, built in Rust.**
- ✗ The lightning-fast, blazing-secure, AI-powered next-gen hosting platform.

- ✓ **Free of license fees. Yours, end to end.**
- ✗ Revolutionary pricing model that's disrupting the hosting industry.

#### Documentation

- ✓ **Tundra installs Nginx, PHP-FPM, PostgreSQL 18, and Valkey 8 by default. You can swap any of these per-server.**
- ✗ Tundra leverages a comprehensive ecosystem of best-in-class open-source technologies to deliver a rock-solid foundation for your infrastructure needs.

#### Error messages

- ✓ **Failed to bind to port 443: address already in use.** Run `tundra server doctor` to find what's holding it.
- ✗ Oops! Something went wrong. Please try again.
- ✗ Error: ECONNREFUSED at /usr/local/bin/tundrad:14:32

#### CLI output

- ✓ ```
  → provisioning site...
  → issuing TLS certificate...
  ✓ site live at https://example.com
  ```

- ✗ ```
  [INFO] [2026-05-02T11:43:21.847Z] [tundrad::sites::provisioner] Initiating site provisioning sequence...
  ```

### 5.4 Words to Use

**Use:** site, deploy, server, agent, plugin, runtime, panel, operator, control plane, atomic, zero-downtime, reconcile, observe.

**Avoid:** leverage, robust, seamless, cutting-edge, world-class, ecosystem (in marketing copy; fine in technical docs about literal ecosystems), revolutionize, empower, unlock, supercharge.

### 5.5 Casing & Punctuation

- **Headlines: sentence case.** "A self-hosted server-management platform." Never Title Case Like This.
- **The wordmark is lowercase: `tundra`.** The word in body copy is capitalized when it's the proper noun: "Tundra installs…".
- **Em-dashes for breaks** — like this — never spaced hyphens.
- **Hyphenated compound modifiers when they precede a noun:** "self-hosted platform," "zero-downtime cutover."
- **Oxford comma on.** "Sites, mailboxes, and databases."
- **No exclamation marks** in error messages, documentation, or marketing copy. They corrode trust.

### 5.6 Commands & Config in Prose

When the running text mentions a command or config token, set it in mono inline:

> Run `tundra site create` to provision a new site. Configure the runtime via `runtime.toml`.

When showing extended commands, use a code block. Prefix multi-step commands with `$` for shell prompts and `→` for output:

```bash
$ tundra site create --type laravel --domain example.com
→ provisioning site...
→ issuing TLS certificate...
✓ site live at https://example.com
```

---

## 6. The Asset Set

This section catalogs the deliverables that ship with this brand system.

### 6.1 Logos (`logos/`)

| File | Purpose |
|------|---------|
| `tundra-mark.svg` | Primary mark, full canvas |
| `tundra-mark-compact.svg` | Mark for small sizes (≤32px) |
| `tundra-mark-horizon.svg` | Brand-storytelling variant with horizon |
| `tundra-wordmark.svg` | Type-only variant |
| `tundra-lockup-horizontal.svg` | **Default logo** for most contexts |
| `tundra-lockup-stacked.svg` | Vertical lockup for square contexts |
| PNGs at 128, 256, 512, 1024, 2400px widths | Pre-rendered for non-SVG consumers |

### 6.2 Social (`social/`)

| File | Purpose | Dimensions |
|------|---------|------------|
| `tundra-og-card.svg` / `.png` | Light Open Graph card | 1200×630 |
| `tundra-og-card-dark.svg` / `.png` | Dark Open Graph card | 1200×630 |

The OG card is what appears when a Tundra link is shared on Twitter, LinkedIn, Slack, GitHub previews, etc. The light variant is the default. The dark variant is for projects that opt into a dark social preview.

### 6.3 README & Docs (`readme/`)

| File | Purpose | Dimensions |
|------|---------|------------|
| `tundra-readme-banner.svg` / `.png` | GitHub README header banner | 1280×360 |

Drop the banner at the top of the README, the docs site landing, the install runbook. The badges row is updated each release; the install command line stays.

### 6.4 Favicon (`favicon/`)

| File | Purpose |
|------|---------|
| `tundra-favicon.svg` | Source SVG (modern browsers prefer this) |
| `tundra-favicon-{16,32,48,64,128,180,192,256,512}.png` | Pre-rendered raster variants |
| `favicon.ico` | Multi-resolution legacy container (16/32/48) |
| `apple-touch-icon.png` | iOS home screen (180×180) |
| `android-chrome-{192,512}x{192,512}.png` | Android Chrome PWA icons |
| `site.webmanifest` | PWA manifest, registers icons + theme colors |

Reference these from the panel HTML head:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1C1F1A">
```

### 6.5 Tokens (`tokens/`)

| File | For consumers using |
|------|---------------------|
| `tundra-tokens.css` | Vanilla CSS, any web framework |
| `tundra-tokens.tailwind.css` | Tailwind v4 (drop into the main stylesheet) |
| `tundra-tokens.json` | Design tools (Figma Tokens, Style Dictionary), non-CSS environments |

### 6.6 Brand Specs (`docs/`)

| File | Content |
|------|---------|
| `tundra-mark-construction.svg` / `.png` | The mark's geometry, clear-space, and don'ts |
| `tundra-color-system.svg` / `.png` | Full color palette with hex codes and usage |
| `tundra-typography.svg` / `.png` | Type scale specimen with real sample text |

These three sheets are designed to be printed at A3 and pinned to a wall. They are also the canonical visual reference when this Markdown document is ambiguous.

---

## 7. Application Examples

### 7.1 Panel UI

The panel uses Tundra Paper as the canvas color, Tundra Frost for elevated cards, Tundra Ink for body text. Lichen accent appears on primary CTAs ("Deploy"), success states, and the brand mark in the top-left. Rust accent appears only on destructive actions ("Delete site") and error states. Aurora accent appears on inline links in dense text.

### 7.2 CLI Output

The CLI uses ANSI colors that map to the palette:

| Element | ANSI | Maps to |
|---------|------|---------|
| Default text | `\e[0m` | Tundra Ink (terminal default fg) |
| Success ✓ | `\e[38;2;122;138;92m` | Lichen accent |
| Error ✗ | `\e[38;2;181;97;58m` | Rust accent |
| Info → | `\e[38;2;91;122;140m` | Aurora accent |
| Muted | `\e[38;2;107;111;102m` | Tundra Slate |
| Code/value | `\e[38;2;245;242;233m` | Tundra Paper (on dark terminals) |

The CLI never uses bright/neon ANSI defaults — they clash with the earth-tundra system.

### 7.3 GitHub Repository

- **Repository description:** `A self-hosted server-management platform, built in Rust.` (one sentence, the lead from the README banner)
- **Topics:** `rust`, `server-management`, `panel`, `self-hosted`, `infrastructure`, `vps`, `wordpress`, `laravel`, `nginx`, `postgresql`
- **README header:** `tundra-readme-banner.png` at the top, followed by status badges, a one-paragraph elevator pitch, and the install command.
- **Repository social preview:** `tundra-og-card.png` (set in repo settings → Social preview).

### 7.4 Documentation Site

- Site favicon: `favicon.svg` with `apple-touch-icon.png` for iOS bookmarks.
- Theme: light by default, dark via `prefers-color-scheme: dark`.
- Code blocks: Tundra Ink background, Tundra Paper text, Lichen accent for keywords, Aurora for strings, Stone for comments.
- Headings: Inter Display 900 for the page title, 700 for h2/h3.
- Body: Inter 400 at 16px on Tundra Stone.

### 7.5 Slide Decks

When presenting Tundra at a conference or to a team, use:

- Tundra Ink background with Tundra Paper text for the cover slide
- Tundra Paper background with Tundra Ink text for content slides
- The mark in the top-right at 32px on every slide (with proper clear space)
- Inter Display 700 at ~64px for slide titles
- Inter 400 at ~28px for body
- A single Lichen accent dot or rule per slide to anchor attention — never multiple accents per slide

---

## 8. Naming & Trademarks

### 8.1 The Name

**Tundra** is the project name. Always written in sentence case in body copy: "Tundra is a self-hosted…". The wordmark itself uses lowercase as a deliberate typographic choice; the name is not lowercase in writing.

### 8.2 Component Names

The four binaries that make up the system have lowercase, technical names. They are written in monospace in documentation:

- `tundrad` — the control plane daemon
- `tundra-agent` — the per-node executor
- `tundra` — the CLI
- `tundra-ui` — the React frontend

### 8.3 Plugin Naming

First-party plugins use the reverse-DNS prefix `com.tundra.`:

- `com.tundra.plesk-migration`
- `com.tundra.namecheap`
- `com.tundra.github`
- `com.tundra.mcp-server`

Third-party plugins use their author's namespace (e.g., `com.example.cloudflare-dns`).

### 8.4 Trademark Posture

Tundra is a personal project under Al Amin Ahamed. The name and mark are not currently registered trademarks. The intent is permissive: anyone may build plugins, integrations, hosting providers, or commercial offerings that use Tundra as a foundation, and may say so honestly ("Powered by Tundra," "Tundra-compatible"). What is not permitted is impersonation — creating a fork or alternative implementation that calls itself "Tundra" without the permission of the project author.

If commercial use of the name in a product brand becomes a question, contact `@mralaminahamed` directly.

---

## 9. Maintenance

### 9.1 Versioning

This brand system follows **semver-like discipline**:

- **Patch (1.0.x):** correcting documentation, adding pre-rendered sizes, adding new tokens that don't conflict.
- **Minor (1.x.0):** adding new accent depths, new components, new asset variants. Old tokens remain valid.
- **Major (2.0.0):** breaking changes to existing tokens, color shifts, mark redesign. Strongly avoided.

### 9.2 The Source of Truth

The `docs/` SVGs are authoritative. The `tokens/` files are derived. When token files and SVGs disagree, the SVG wins and the token file gets updated.

### 9.3 Adding New Assets

When the project needs a brand-adjacent asset that this system doesn't include (e.g., a sticker, an enamel pin, a conference banner):

1. Read this document end to end.
2. Use only the structural and accent palettes.
3. Use only Inter Display, Inter, and JetBrains Mono.
4. Use the mark as specified — clear space, minimum size, color pairings.
5. If the asset feels new in kind (not just a rendering of existing assets), add it to `docs/` and document it in §6 of this file.

---

## 10. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial complete brand system. Earth-tundra palette. North-star mark with horizon variant. Inter Display + Inter + JetBrains Mono. Voice & tone codified. Full asset set rendered. |

**Companion Documents:**

- `tundra-technical-implementation-plan-v2.md` — primary architecture
- `tundra-plesk-migration-plan-v1.md` — Plesk migration (core plugin)
- `tundra-plugin-architecture-plan-v1.md` — plugin contract
- `tundra-additional-core-plugins-v1.md` — Namecheap, GitHub, MCP Server core plugins

**Asset Manifest:**

- `logos/` — 6 SVG variants + PNG renders at standard sizes
- `social/` — light + dark OG cards (SVG + PNG)
- `readme/` — README banner (SVG + PNG)
- `favicon/` — full favicon set (SVG, multi-size PNG, .ico, manifest)
- `tokens/` — CSS, Tailwind, JSON token exports
- `docs/` — color system, typography specimen, mark construction sheets (SVG + PNG)

**Planned Follow-up Documents:**

- `tundra-illustration-guide.md` — patterns and rules for marketing illustration if/when the project reaches that stage
- `tundra-motion-guide.md` — animation conventions for the panel UI (transitions, deploy progress, real-time updates)
- `tundra-merchandise-guide.md` — guidelines for stickers, t-shirts, conference giveaways, when the community reaches that scale
