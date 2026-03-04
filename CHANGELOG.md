# Changelog

All notable changes to the Cocos Creator AI Skill extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Unified runtime and naming around `cocos-skill`.
- Route surface is fully HTTP-based under `/skill/*`.
- Tool registration now uses internal `ToolRegistrar` contract.
- UUID encode/decode uses `source/skill/uuid-codec.ts`.
- Configuration modules are consolidated in `source/skill/`.

### Removed

- Legacy transport manager files that were no longer used by runtime.
- Obsolete QA scripts tied to historical naming.
- Outdated documentation referencing old compatibility paths.

## [1.0.0] - 2026-03-04

### Added

- Gateway tools for context, request routing, and guarded actions.
- Search support via `search_nodes`.

### Improved

- Layered structure with `core`, `adapters`, and `infra` modules.
- Profile-based configuration persistence with project discovery file.
