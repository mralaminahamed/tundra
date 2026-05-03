# Tundra Brand Assets

This directory contains the complete visual identity for **Tundra**.

## Start here

→ **[docs/tundra-brand-guidelines.md](docs/tundra-brand-guidelines.md)** — the master brand book. Read this first.

## Layout

```
brand/
├── docs/                          # Specifications & visual reference sheets
│   ├── tundra-brand-guidelines.md # ← Master document. Start here.
│   ├── tundra-mark-construction.svg/.png
│   ├── tundra-color-system.svg/.png
│   └── tundra-typography.svg/.png
│
├── logos/                         # All logo and mark variants
│   ├── tundra-mark.svg            # Primary mark — the north star
│   ├── tundra-mark-compact.svg    # Optimized for ≤32px sizes
│   ├── tundra-mark-horizon.svg    # Mark above the tundra horizon
│   ├── tundra-wordmark.svg        # Text-only variant
│   ├── tundra-lockup-horizontal.svg  # ← Default logo
│   ├── tundra-lockup-stacked.svg     # Square / portrait contexts
│   └── *.png                      # Pre-rendered raster exports
│
├── social/                        # Open Graph / social share cards
│   ├── tundra-og-card.svg/.png        # 1200×630, light
│   └── tundra-og-card-dark.svg/.png   # 1200×630, dark
│
├── readme/                        # GitHub README banner
│   └── tundra-readme-banner.svg/.png  # 1280×360
│
├── favicon/                       # Complete favicon set
│   ├── tundra-favicon.svg
│   ├── tundra-favicon-{16…512}.png
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   ├── android-chrome-{192,512}x{192,512}.png
│   └── site.webmanifest
│
└── tokens/                        # Design tokens for code
    ├── tundra-tokens.css          # Vanilla CSS custom properties
    ├── tundra-tokens.tailwind.css # Tailwind v4 @theme block
    └── tundra-tokens.json         # JSON for design tools
```

## Quick reference

| Need | File |
|------|------|
| The default logo to put in a README | `readme/tundra-readme-banner.png` |
| A logo for a slide deck | `logos/tundra-lockup-horizontal-1200.png` |
| Just the mark | `logos/tundra-mark-512.png` |
| Social share preview | `social/tundra-og-card-1200.png` |
| Browser tab icon | `favicon/tundra-favicon.svg` |
| Web app icons | `favicon/android-chrome-{192,512}*.png` + `site.webmanifest` |
| Color tokens for the panel UI | `tokens/tundra-tokens.css` |
| Color tokens for Tailwind | `tokens/tundra-tokens.tailwind.css` |
| Color hex codes (just the values) | See `docs/tundra-color-system.png` |

## Usage

- **CSS:** `<link rel="stylesheet" href="tokens/tundra-tokens.css">` then use `var(--color-fg)`, `var(--font-display)`, etc.
- **Tailwind v4:** `@import "tailwindcss"; @import "tokens/tundra-tokens.tailwind.css";` then use `bg-tundra-paper`, `text-tundra-ink`, etc.
- **Figma / design tools:** import `tokens/tundra-tokens.json` via your tokens plugin of choice.

## Authorship

Designed by **Al Amin Ahamed** ([@mralaminahamed](https://github.com/mralaminahamed)).
Free to use under the terms of the Tundra project license. Don't impersonate.

For the full story behind every decision in this system, read `docs/tundra-brand-guidelines.md`.
