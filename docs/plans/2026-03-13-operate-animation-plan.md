# Operate Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增加 `operate_animation` 工具与 `POST /skill/animation` 端点，结构化控制 `Animation/SkeletalAnimation` 与 `AnimationController`。

**Architecture:** Tool 负责参数校验与 UUID decode，并通过 `scene.execute-scene-script` 调用 scene 方法 `operateAnimation()` 在运行时执行真实动画操作。HTTP 层只做路由与工具注册，保持薄。

**Tech Stack:** TypeScript、`zod`、`node:test`、Cocos Creator `Editor.Message.request`、scene script methods.

---

### Task 1: 添加 RED 测试（模块存在 + 调用链）

**Files:**
- Create: `source/skill/tools/__tests__/operate-animation.test.ts`

**Step 1: Write the failing test**
- 断言：`operate-animation` 模块可被导入；并且 `registerOperateAnimationTool()` 能注册 handler。
- 断言：调用 handler 后，会对 `Editor.Message.request('scene','execute-scene-script', ...)` 发起 `startCaptureSceneLogs` 与 `operateAnimation` 调用。

**Step 2: Run test to verify it fails**

Run:
```bash
npm run build:tsc
timeout 60s node --test dist/skill/tools/__tests__/operate-animation.test.js
```

Expected:
- 测试失败（`assert.fail(...)`），原因是模块不存在或 handler 未注册。

---

### Task 2: 实现 GREEN（scene 方法 + tool + 注册）

**Files:**
- Create: `source/scene/animation-ops.ts`
- Modify: `source/scene/index.ts`
- Create: `source/skill/tools/operate-animation.ts`
- Modify: `source/http/http-tool-server.ts`
- Modify: `source/skill/config.ts`
- Modify: `source/main.ts`

**Step 1: Implement minimal scene method**
- 在 `source/scene/animation-ops.ts` 提供 `operateAnimation(request)`，实现：
  - `findNodeByUuid`
  - resolve legacy/controller component（ambiguous 时返回候选并报错）
  - 覆盖最小操作：`list`、`play`、`pause`（先把最小闭环跑通）

**Step 2: Implement minimal tool**
- `operate_animation`：
  - zod schema
  - decode uuid
  - `execute-scene-script` 调用 `operateAnimation`
  - 回收 logs + snapshot + 返回 JSON

**Step 3: Wire HTTP + config**
- `ROUTE_TO_TOOL['/skill/animation']='operate_animation'`
- `registerTools()` 里按开关注册
- `SkillServerToolConfig` 增加 `operateAnimation`
- `DEFAULT_TOOL_CONFIG` / fallback config 同步

**Step 4: Run test to verify it passes**
```bash
npm run build:tsc
timeout 60s node --test dist/skill/tools/__tests__/operate-animation.test.js
```

Expected:
- PASS

---

### Task 3: 扩展操作覆盖（保持每次一条 RED→GREEN）

**Files:**
- Modify: `source/scene/animation-ops.ts`
- Modify: `source/skill/tools/operate-animation.ts`
- Modify: `source/skill/tools/__tests__/operate-animation.test.ts`

按需迭代增加以下操作，并为每项增加对应的失败测试与通过验证：
- legacy：`resume/stop/crossFade/getState/setState`
- controller：`getVariables/getValue/setValue/getStatus/getLayerWeight/setLayerWeight`

