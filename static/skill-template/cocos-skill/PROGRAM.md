# Cocos Skill Program

Use this file as the default operating program for live-editor work through `cocos-skill`.

## Goal

Turn the bundled skill from a static API manual into a repeatable workflow:

- capture a baseline before mutating
- verify every write with live readback
- keep only changes with confirmed outcomes
- escalate to manual review when the outcome is ambiguous

## Operating Rules

1. Read this file before large live-editor tasks.
2. Use `SKILL.md` for endpoint discovery and task routing.
3. Use this file for execution policy, verification rules, and keep or discard decisions.
4. Keep instructions concrete and project-specific inside the preserved user block only.

## Baseline

Before any mutating action:

1. Confirm the server with `GET /skill/health`.
2. Capture the current state with the narrowest useful read:
   - `POST /skill/context`
   - `POST /skill/search-nodes`
   - `POST /skill/query-nodes`
   - `POST /skill/query-components`
3. Record the exact live target, expected change, and verification path.

## Verification

After every mutating action:

1. Re-run a fresh readback against the same target.
2. Compare the live result against the intended change.
3. Treat missing readback or mismatched state as unverified.

Never treat a write response alone as proof of success.

## Keep Or Discard

- `keep`: the change is visible in live readback and matches the intended effect.
- `discard`: the change failed, hit the wrong target, or produced a worse verified state.
- `manual-review`: the API succeeded but the live outcome is ambiguous, partial, or too risky to continue automatically.

## Failure Handling

- If the target cannot be located reliably, stop and re-query from live state.
- If the tool response and live readback disagree, trust the live readback.
- If a low-level command is required, send one narrow `editor_request` call and verify immediately.
- If a destructive path is involved, use `apply_gated_action` and inspect the preview first.

## Diversity Rule

Do not repeat the same kind of attempt indefinitely.

- If the last few attempts all changed only parameters or only retried the same endpoint, change strategy.
- Alternate between:
  - better target discovery
  - narrower writes
  - higher-level tools
  - stronger verification
  - explicit manual-review stops

## Project Workflow Overrides

Keep project-local workflow rules inside the preserved user block below.

<!-- cocos-skill:program:user:start -->
## Baseline Notes

- Add project-specific baseline or verification rules here.
<!-- cocos-skill:program:user:end -->
