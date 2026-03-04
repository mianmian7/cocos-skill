# Agent Guide

## Scope

- Repository: `cocos-skill`
- Runtime: `source/http/http-tool-server.ts`
- Entry: `source/main.ts`
- Source of truth for code: `source/`
- Build output: `dist/` (do not edit directly)

## Directory Overview

- `source/core/`: transport-agnostic contracts and registry
- `source/adapters/`: HTTP and editor message adapters
- `source/infra/`: runtime integration utilities
- `source/http/`: HTTP server and routing
- `source/skill/`: config and tool implementations
- `source/panels/`: extension UI panel
- `static/`: templates, styles, skill template assets
- `scripts/`: build/package/QA scripts

## Build And Validate

- Install: `npm install`
- Type check: `npm run build:tsc`
- Build: `npm run build`
- Package: `npm run package`
- Legacy scan: `npm run qa:no-legacy`

## Engineering Rules

- Keep changes in `source/`, not `dist/`.
- Prefer named exports and clear module boundaries.
- Keep HTTP routing thin; business behavior belongs to tools under `source/skill/tools/`.
- Validate before completion with reproducible commands.

## Release Notes

- Current package version target: `1.0.0`
- Date baseline: `2026-03-04`
