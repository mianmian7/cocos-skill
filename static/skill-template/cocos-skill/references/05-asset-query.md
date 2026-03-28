# 05 — Asset Query And Dependency Analysis

> **Channel**: `asset-db` | **Mode**: read-only
## When to Use

- You are doing preflight before a write: query the source first, then the target.
- You need to convert between `uuid`, `db://` URL, and absolute path.
- You need asset dependencies, reverse usage, importer, type, or metadata information.

## Quick Flow

### Preflight Before Asset Writes

1. `query-ready`
2. `query-asset-info(source)`
3. `query-asset-info(target)`
4. Decide explicitly whether the operation should:
   - fail
   - overwrite
   - rename automatically

### Query A Batch Of Assets

1. `query-assets`
2. Request only the `dataKeys` you actually need
3. Drill down with `query-asset-info` only for the specific assets that matter

### Query Dependencies Or Reverse Usage

1. Start from the target asset UUID or URL
2. Use `query-asset-dependencies` to see what it depends on
3. Use `query-asset-users` to see what depends on it

## Core Commands

| Command | Use Case | Returns | Notes |
|------|----------|------|------|
| `query-ready` | Asset-db health check | `boolean` | Do not continue with writes if not ready |
| `query-asset-info` | Query one asset | `AssetInfo \| null` | Accepts `uuid` / `url` / path |
| `query-asset-meta` | Read importer settings and meta | `IAssetMeta \| null` | Required before meta edits |
| `query-assets` | Filter a batch of assets | `AssetInfo[]` | Prefer `dataKeys` to reduce payload size |
| `query-path` / `query-url` / `query-uuid` | Convert identifiers | `string \| null` | Useful across workflows |
| `query-asset-users` | Reverse usage lookup | `string[]` | See what uses the asset |
| `query-asset-dependencies` | Forward dependency lookup | `string[]` | See what the asset depends on |
| `generate-available-url` | Generate a non-conflicting URL | `string` | Useful for auto-naming |

## Signature Cheat Sheet

- `query-asset-info`: `args = [urlOrUuidOrPath: string, dataKeys?: string[]] -> AssetInfo | null`
- `query-asset-meta`: `args = [urlOrUuid: string] -> IAssetMeta | null`
- `query-assets`: `args = [options?: QueryAssetsOption, dataKeys?: (keyof IAssetInfo)[]] -> AssetInfo[]`
- `query-asset-users`: `args = [uuidOrUrl: string, type?: "asset" | "script" | "all"] -> string[]`
- `query-asset-dependencies`: `args = [uuidOrUrl: string, type?: "asset" | "script" | "all"] -> string[]`
- `query-path` / `query-url` / `query-uuid` / `generate-available-url`: each takes a single string argument

## Most Useful Fields

For preflight, start with these `dataKeys`:

- `uuid`
- `type`
- `path`
- `url`
- `importer`
- `subAssets`

Do not fetch full payloads by default.

## Common Pitfalls

- `query-asset-info` accepts multiple input formats, but one workflow should usually stick to one identifier style.
- `query-assets` can get large quickly, so keep both filters and `dataKeys` tight.
- Dependency queries return UUID lists, not full asset details.

## Verification

- Before writes, confirm that both `source` and `target` were checked.
- After dependency lookups, call `query-asset-info` or `query-url` only if you need richer detail.

## Cross References

- Asset writes: `references/06-asset-crud.md`
- Scene asset switching: `references/07-scene-management.md`
