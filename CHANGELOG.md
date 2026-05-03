# Changelog

All notable changes to Tundra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.0.1] - 2026-05-03 — Bootstrap

### Added
- Workspace scaffold per `tundra-technical-implementation-plan-v3.md` §11.3
- Toolchain pinned to Rust 1.95, Node 22
- `rustfmt.toml`, `.clippy.toml`, ESLint 9, Prettier 3 configured
- CI skeleton (lint, deps, unit-rust, unit-ts, build-binaries, build-panel)
- `deny.toml` with Apache-2.0/MIT/BSD-3-Clause/ISC/Unicode-DFS-2016 allowlist; openssl-sys banned
- `panel/` React 19 + Vite + TypeScript 5.7 strict + Tailwind 4 + TanStack Router/Query scaffold
- Apache-2.0 LICENSE, README, CHANGELOG
