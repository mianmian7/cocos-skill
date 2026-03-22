# Tool API Consistency Refactor Design

**Date:** 2026-03-22

## Goal

以 API 一致性为第一目标，统一 `cocos-skill` 全仓工具的请求归一化、响应骨架、错误语义和副作用流程，降低“使用过程中经常报错”的概率。

## Approved Decisions

### 1. 方案选型

采用“契约优先 + 全仓迁移”，而不是只按文件大小拆分，原因是当前主要问题是 API 契约不一致而不是单纯文件过大。

### 2. 统一标准

所有工具必须满足以下标准：

- 请求入口统一：参数命名、必填/选填语义、UUID 解码、布尔/数字归一化规则一致。
- 响应结构统一：统一为固定骨架，例如 `success / data / errors / warnings / logs / meta`。
- 错误语义统一：不再混用抛异常、裸字符串、零散 `errors` 字段。
- 副作用流程统一：修改 scene/prefab/asset 的工具统一走日志捕获、必要保存、快照刷新、结果回读。
- tool 层职责统一：tool 负责 schema 与编排，业务逻辑下沉到 helper / domain 模块。

### 3. 架构落点

新增共享运行时层，承载：

- `tool-contract`
- `tool-errors`
- `tool-runtime`
- `tool-context`
- `tool-coercion`

所有工具统一走同一种执行模型：

1. 定义输入 schema
2. 通过统一 wrapper 执行
3. wrapper 处理参数归一化、错误捕获、日志捕获、快照与统一响应整形
4. tool 本身只返回领域结果

### 4. 统一响应骨架

统一响应形状：

```json
{
  "success": true,
  "data": {},
  "errors": [],
  "warnings": [],
  "logs": [],
  "meta": {
    "tool": "operate_animation",
    "operation": "play"
  }
}
```

约束：

- `success=false` 时必须返回结构化错误数组
- `errors` 永远是数组
- `data` 只放业务数据
- `meta` 只放工具与执行元数据
- `logs` 可选但结构统一

### 5. 副作用分级

- `read-only`
- `mutating-scene`
- `mutating-asset`

统一契约，不强行让所有工具共享同一种副作用流程。

### 6. 迁移顺序

1. 共享 runtime 与统一响应契约
2. 高频且最容易出错的核心工具
3. 其余工具迁移
4. HTTP 层和文档统一

### 7. 完成标准

- 所有工具返回统一响应骨架
- 所有失败路径输出结构化错误
- 不再各自重复写日志捕获、快照、参数归一化
- 高风险工具有成功/失败路径测试
- HTTP 层输出一致
- 存在仓库级验证证明重构未打断主链路
