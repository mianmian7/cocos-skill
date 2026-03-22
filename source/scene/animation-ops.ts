import { operateController, isControllerOperation } from "./animation/controller-ops.js";
import { operateLegacy, isLegacyOperation } from "./animation/legacy-ops.js";
import { collectAnimationRelatedComponents, resolveTarget } from "./animation/target-resolution.js";
import type { OperateAnimationRequest, OperateAnimationResponse } from "./animation/types.js";
import { findNodeByUuid, getCc } from "./animation/utils.js";

function buildListResponse(candidates: ReturnType<typeof collectAnimationRelatedComponents>): OperateAnimationResponse {
  return {
    success: true,
    data: {
      legacy: candidates.legacy.map((entry) => entry.summary),
      controller: candidates.controller.map((entry) => entry.summary),
    },
  };
}

export function operateAnimation(request: OperateAnimationRequest): OperateAnimationResponse {
  try {
    const cc = getCc();
    const sceneRoot = cc.director?.getScene?.();
    if (!sceneRoot) {
      return { success: false, error: "No active scene" };
    }

    const node = findNodeByUuid(sceneRoot, request.target.nodeUuid);
    if (!node) {
      return { success: false, error: `Node not found: ${request.target.nodeUuid}` };
    }

    const candidates = collectAnimationRelatedComponents(node, cc);

    if (request.operation === "list") {
      return buildListResponse(candidates);
    }

    if (isControllerOperation(request.operation)) {
      if (request.target.kind !== "controller") {
        return { success: false, error: `${request.operation} requires target.kind=controller` };
      }

      const resolved = resolveTarget(request.target, candidates);
      if (!resolved.ok) {
        return { success: false, error: resolved.error, details: resolved.details };
      }

      return operateController(request.operation, resolved.component, resolved.targetResolved, request.options);
    }

    if (isLegacyOperation(request.operation)) {
      if (request.target.kind !== "legacy") {
        return { success: false, error: `${request.operation} requires target.kind=legacy` };
      }

      const resolved = resolveTarget(request.target, candidates);
      if (!resolved.ok) {
        return { success: false, error: resolved.error, details: resolved.details };
      }

      return operateLegacy(request.operation, resolved.component, resolved.targetResolved, request.options);
    }

    return { success: false, error: `Unsupported operation: ${request.operation}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
