# 06 — Asset Create, Update, Delete, And Import

> **Channel**: `asset-db` | **Mode**: read/write
## When to Use

- You need to create, overwrite, copy, move, or import assets.
- You need to modify asset content or meta.
- You need to refresh, reimport, or open assets in the editor.

## Default Rules

All write operations should follow this sequence by default:

1. Query source and target first
2. Decide the conflict strategy explicitly
3. Execute the write
4. Run `refresh-asset` or `reimport-asset` when needed
5. Read back to verify

## Quick Flow

### Create Or Update A File

1. `query-asset-info(target)`
2. If it exists, use `save-asset`
3. If it does not exist, use `create-asset`
4. Call `query-asset-info` again

### Copy Or Move Assets

1. `query-asset-info(source)`
2. `query-asset-info(target)`
3. Decide `overwrite` / `rename`
4. `copy-asset` or `move-asset`
5. Read back the target

### Modify Meta

1. `query-asset-meta`
2. Change only the fields you actually need
3. `JSON.stringify(...)`
4. `save-asset-meta`
5. Run `reimport-asset` when needed

## Core Commands

| Command | Use Case | Returns | Notes |
|------|----------|------|------|
| `create-asset` | Create a new file or directory | `AssetInfo \| null` | Can use `overwrite` / `rename` |
| `save-asset` | Overwrite existing content | `AssetInfo \| null` | Supports text and binary |
| `save-asset-meta` | Change importer meta | `AssetInfo \| null` | Second arg must be a JSON string |
| `copy-asset` | Copy an asset | `AssetInfo \| null` | Query target conflicts first |
| `move-asset` | Move or rename an asset | `AssetInfo \| null` | Changes reference-path chains |
| `import-asset` | Import from an external path | `AssetInfo \| null` | Often followed by refresh |
| `refresh-asset` | Refresh the asset database | `void` | Common after writes |
| `reimport-asset` | Reimport an asset | `void` | Common after meta changes |
| `open-asset` | Open an asset in the editor | `void` | More of a UI action |
| `delete-asset` | Delete an asset directly | `AssetInfo \| null` | Prefer `apply_gated_action` for high-risk deletes |

## Signature Cheat Sheet

- `create-asset`: `args = [url: string, content: string | Buffer | null, options?: { overwrite?: boolean, rename?: boolean }]`
- `import-asset`: `args = [sourcePath: string, targetUrl: string, options?: { overwrite?: boolean, rename?: boolean }]`
- `copy-asset` / `move-asset`: `args = [sourceUrl: string, targetUrl: string, options?: { overwrite?: boolean, rename?: boolean }]`
- `save-asset`: `args = [urlOrUuid: string, content: string | Buffer]`
- `save-asset-meta`: `args = [urlOrUuid: string, metaJsonString: string]`
- `delete-asset` / `refresh-asset` / `reimport-asset`: `args = [urlOrUuid: string]`

## Common Pitfalls

- `save-asset-meta` expects a JSON string, not an object.
- `copy-asset` / `move-asset` failures usually mean the source is missing or target conflicts were not handled first.
- After file writes, asset-db refresh lag can briefly hide the new state from subsequent reads.
- Do not default to raw `delete-asset` for bulk deletes; use approval flow for high-risk cases.

## Verification

- After create / save: `query-asset-info`
- After move / copy: query both source and target
- After meta edits: `query-asset-meta`, plus `reimport-asset` when needed

## Cross References

- Preflight and dependency analysis: `references/05-asset-query.md`
- Scene operations: `references/07-scene-management.md`
