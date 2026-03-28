# 12 — Experience Capture

## Goal

Turn high-value lessons from development, review, debugging, and validation into reusable skill guidance instead of leaving them in one-off chats or commit messages.

## When To Record

Record a lesson when all of these are true:

- It is reusable across tasks.
- It explains a stable failure signal, root cause, or hard constraint.
- It changes what the next agent should do.
- It can be verified with a command, test, readback, or real workflow check.

Do not record:

- Unverified guesses.
- Pure environment noise.
- Details that only matter to one temporary branch, UUID, or dirty worktree.

## Where To Put It

- Short rule: append under `SKILL.md` -> `## Experience Capture`.
- Longer note with commands, examples, or boundaries: write it here and leave a short summary in `SKILL.md`.

## Template

Use these exact fields:

- `Title`
- `Signal`
- `Root Cause / Constraints`
- `Correct Approach`
- `Verification`
- `Scope`

Copyable skeleton:

```md
### Title

### Signal

### Root Cause / Constraints

### Correct Approach

### Verification

### Scope
```

## Quality Bar

Before saving a lesson, check:

- It helps future agents avoid repeating the same mistake.
- It captures root cause, not just a surface workaround.
- It includes a real verification path.
- Its scope is explicit and not over-generalized.

## Maintenance

- Append incrementally; do not rewrite unrelated lessons.
- If a new lesson replaces an old one, update the old one instead of keeping both.
- If three or more lessons say the same thing, merge them into one higher-signal rule.
