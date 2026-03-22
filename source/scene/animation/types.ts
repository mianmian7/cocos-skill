export type OperateAnimationKind = "legacy" | "controller";

export type OperateAnimationTarget = {
  kind: OperateAnimationKind;
  nodeUuid: string;
  componentUuid?: string;
};

export type OperateAnimationRequest = {
  operation: string;
  target: OperateAnimationTarget;
  options?: Record<string, unknown>;
};

export type OperateAnimationResponse = {
  success: boolean;
  targetResolved?: OperateAnimationTarget;
  data?: unknown;
  error?: string;
  details?: unknown;
};

export type AnimationComponentSummary = {
  kind: OperateAnimationKind;
  uuid: string;
  type: string;
};

export type AnimationComponentCandidate = {
  component: any;
  summary: AnimationComponentSummary;
};

export type AnimationComponentCandidates = {
  legacy: AnimationComponentCandidate[];
  controller: AnimationComponentCandidate[];
};

export type ResolveTargetResult =
  | { ok: true; component: any; targetResolved: OperateAnimationTarget }
  | { ok: false; error: string; details?: unknown };

