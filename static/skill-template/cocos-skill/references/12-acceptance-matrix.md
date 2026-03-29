# 12 — Acceptance Matrix

Use this file after a live mutation to choose the smallest readback that proves the editor actually changed.

Read `PROGRAM.md` first if you still need baseline, keep-or-discard, or manual-review policy.

## Nodes

- Write surface: `create_nodes`, `modify_nodes`
- Minimum readback: `query_nodes` or `search_nodes` on the exact live target
- Stronger proof: `context` when hierarchy order, parent, or active scene placement matters
- Failure signals:
  - stale UUID
  - wrong parent
  - transform or active-state drift after the write

## Components

- Write surface: `modify_components`, `execute_scene_code`
- Minimum readback: `query_components` on the target node and component type
- Stronger proof: pair the component read with `query_nodes` when the change should affect visible node state
- Failure signals:
  - component missing or duplicated
  - property path did not change
  - value type was coerced unexpectedly

## Assets

- Write surface: `operate_assets`, `editor_request` on `asset-db`
- Minimum readback: re-run the asset query against the source or destination identifier
- Stronger proof: refresh the asset-db view, then read both source and destination again
- Failure signals:
  - old UUID or path still returned
  - save or import not visible after refresh
  - overwrite or rename policy resolved differently than expected

## Scenes

- Write surface: `operate_current_scene`, `apply_gated_action`, documented `scene` commands
- Minimum readback: `context` or `query-dirty`
- Stronger proof: reopen or re-query the active scene when structure, dirty state, or save status is part of the result
- Failure signals:
  - wrong active scene
  - dirty state did not move as expected
  - scene save or close action still leaves pending prompts

## Escalate When Needed

If the minimum readback is ambiguous:

1. read the narrower target again
2. add one broader read (`context`, hierarchy, or asset query)
3. only then conclude whether to keep, discard, or retry
