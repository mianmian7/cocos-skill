# Tool API Consistency Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一全仓工具 API 契约、错误输出和副作用执行流程，降低调用时的随机报错和行为不一致。

**Architecture:** 先冻结统一响应骨架与运行时 contract，再引入共享 runtime 包装层，最后按风险顺序迁移所有工具、HTTP 路由和文档。tool 文件尽量变薄，业务逻辑下沉到 helper/domain 模块，但拆分只在对一致性和维护性有收益时发生。

**Tech Stack:** TypeScript, zod, node:test, Cocos Creator Editor.Message.request, Express HTTP server

---

### Task 1: Freeze the Unified Contract

**Files:**
- Modify: `source/core/tool-contract.ts`
- Modify: `source/core/tool-registry.ts`
- Test: `source/core/__tests__/tool-registry.test.ts`
- Modify: `docs/plans/2026-03-22-tool-api-consistency-design.md`

**Step 1: Write failing regression tests**

- Add tests for unified response envelope parsing and structured validation/tool errors.

**Step 2: Run the targeted tests and confirm failure**

Run: `npm run build:tsc && timeout 60s node --test dist/core/__tests__/tool-registry.test.js`

**Step 3: Implement minimal contract changes**

- Add unified response/result types.
- Keep `ToolRegistry.execute()` behavior explicit and deterministic.

**Step 4: Re-run the targeted tests**

Run: `npm run build:tsc && timeout 60s node --test dist/core/__tests__/tool-registry.test.js`

### Task 2: Introduce Shared Tool Runtime

**Files:**
- Create: `source/skill/runtime/tool-runtime.ts`
- Create: `source/skill/runtime/tool-errors.ts`
- Create: `source/skill/runtime/tool-context.ts`
- Create: `source/skill/runtime/tool-coercion.ts`
- Modify: `source/skill/tools/scene-save.ts`

**Step 1: Add runtime tests or adapt existing tests to use the runtime**

**Step 2: Implement shared response builders, error mapping, side-effect policy helpers**

**Step 3: Verify runtime compiles and the registry tests still pass**

Run: `npm run build:tsc && timeout 60s node --test dist/core/__tests__/tool-registry.test.js`

### Task 3: Migrate Scene and Prefab Mutators

**Files:**
- Modify: `source/skill/tools/operate-current-scene.ts`
- Modify: `source/skill/tools/operate-prefab-assets.ts`
- Modify: `source/skill/tools/node-linked-prefabs-operations.ts`
- Modify: `source/skill/tools/apply-gated-action.ts`
- Test: `source/skill/tools/__tests__/scene-save.test.ts`
- Test: `source/skill/tools/__tests__/node-linked-prefabs-operations.test.ts`
- Test: `source/skill/tools/__tests__/operate-current-scene.test.ts`
- Test: `source/skill/tools/__tests__/operate-prefab-assets.test.ts`

**Step 1: Convert one tool at a time to the runtime**

**Step 2: Normalize error and log output**

**Step 3: Verify scene/prefab tests**

Run: `npm run build:tsc && timeout 60s node --test dist/skill/tools/__tests__/scene-save.test.js dist/skill/tools/__tests__/node-linked-prefabs-operations.test.js dist/skill/tools/__tests__/operate-current-scene.test.js dist/skill/tools/__tests__/operate-prefab-assets.test.js`

### Task 4: Migrate Asset, Project, and Script Mutators

**Files:**
- Modify: `source/skill/tools/operate-assets.ts`
- Modify: `source/skill/tools/operate-project-settings.ts`
- Modify: `source/skill/tools/operate-scripts-and-text.ts`
- Test: `source/skill/tools/__tests__/operate-assets.test.ts`

**Step 1: Split per-operation logic behind runtime-backed handlers**

**Step 2: Normalize mutation outputs and refresh behavior**

**Step 3: Verify asset tests**

Run: `npm run build:tsc && timeout 60s node --test dist/skill/tools/__tests__/operate-assets.test.js`

### Task 5: Migrate Query and Discovery Tools

**Files:**
- Modify: `source/skill/tools/get-editor-context.ts`
- Modify: `source/skill/tools/search-nodes.ts`
- Modify: `source/skill/tools/query-nodes.ts`
- Modify: `source/skill/tools/query-components.ts`
- Modify: `source/skill/tools/get-assets-by-type.ts`
- Modify: `source/skill/tools/get-available-asset-types.ts`
- Modify: `source/skill/tools/get-available-component-types.ts`
- Modify: `source/skill/tools/get-component-definitions.ts`
- Modify: `source/skill/tools/get-node-definitions.ts`

**Step 1: Convert read-only tools to the same response envelope**

**Step 2: Add or adapt targeted tests where coverage is missing**

**Step 3: Verify compilation and query path contract tests**

Run: `npm run build:tsc && timeout 60s node --test dist/core/__tests__/tool-registry.test.js`

### Task 6: Migrate Gateways and Finish Animation Split

**Files:**
- Modify: `source/skill/tools/editor-request.ts`
- Modify: `source/skill/tools/execute-scene-code.ts`
- Modify: `source/skill/tools/operate-animation.ts`
- Modify: `source/scene/animation-ops.ts`
- Modify: `source/scene/animation/controller-ops.ts`
- Modify: `source/scene/animation/target-resolution.ts`
- Modify: `source/scene/index.ts`
- Test: `source/skill/tools/__tests__/editor-request.test.ts`
- Test: `source/skill/tools/__tests__/operate-animation.test.ts`

**Step 1: Migrate the highest-risk gateway tools to the runtime**

**Step 2: Reduce `animation-ops.ts` to a dispatcher and move domain logic into helpers**

**Step 3: Verify gateway and animation tests**

Run: `npm run build:tsc && timeout 60s node --test dist/skill/tools/__tests__/editor-request.test.js dist/skill/tools/__tests__/operate-animation.test.js`

### Task 7: Unify HTTP and Documentation

**Files:**
- Modify: `source/http/http-tool-server.ts`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `CHANGELOG.md`

**Step 1: Make HTTP error/status responses match the tool contract**

**Step 2: Update docs to describe the new envelope and migration assumptions**

**Step 3: Verify build and legacy scan**

Run: `npm run build:tsc && npm run qa:no-legacy`

### Task 8: Final Validation and Cleanup

**Files:**
- Review: `source/core/`
- Review: `source/http/`
- Review: `source/skill/tools/`
- Review: `source/scene/`

**Step 1: Remove obsolete per-tool response glue**

**Step 2: Run repository-wide validation**

Run: `npm run build:tsc && npm run qa:no-legacy && timeout 60s node --test dist/core/__tests__/tool-registry.test.js dist/skill/tools/__tests__/*.test.js`
