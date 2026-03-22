import type { AnimationComponentCandidates, OperateAnimationTarget, ResolveTargetResult } from "./types.js";

export function collectAnimationRelatedComponents(node: any, cc: any): AnimationComponentCandidates {
  const legacy: AnimationComponentCandidates["legacy"] = [];
  const controller: AnimationComponentCandidates["controller"] = [];

  const AnimationCtor = cc.Animation;
  const SkeletalAnimationCtor = cc.SkeletalAnimation;
  const AnimationControllerCtor = cc.animation?.AnimationController;

  const components = Array.isArray(node?.components) ? node.components : [];
  for (const comp of components) {
    const uuid = typeof comp?.uuid === "string" ? comp.uuid : "";
    if (!uuid) {
      continue;
    }

    if (AnimationControllerCtor && comp instanceof AnimationControllerCtor) {
      controller.push({
        component: comp,
        summary: { kind: "controller", uuid, type: "AnimationController" },
      });
      continue;
    }

    if (SkeletalAnimationCtor && comp instanceof SkeletalAnimationCtor) {
      legacy.push({
        component: comp,
        summary: { kind: "legacy", uuid, type: "SkeletalAnimation" },
      });
      continue;
    }

    if (AnimationCtor && comp instanceof AnimationCtor) {
      legacy.push({
        component: comp,
        summary: { kind: "legacy", uuid, type: "Animation" },
      });
    }
  }

  return { legacy, controller };
}

export function resolveTarget(target: OperateAnimationTarget, candidates: AnimationComponentCandidates): ResolveTargetResult {
  const pool = target.kind === "legacy" ? candidates.legacy : candidates.controller;
  const summaries = pool.map((entry) => entry.summary);

  if (target.componentUuid) {
    const found = pool.find((entry) => entry.summary.uuid === target.componentUuid);
    if (!found) {
      return {
        ok: false,
        error: `Component not found: ${target.componentUuid}`,
        details: { candidates: summaries },
      };
    }
    return {
      ok: true,
      component: found.component,
      targetResolved: { ...target, componentUuid: found.summary.uuid },
    };
  }

  if (pool.length === 1) {
    return {
      ok: true,
      component: pool[0].component,
      targetResolved: { ...target, componentUuid: pool[0].summary.uuid },
    };
  }

  if (pool.length === 0) {
    return {
      ok: false,
      error: `No ${target.kind} animation component found on node`,
      details: { candidates: summaries },
    };
  }

  return {
    ok: false,
    error: "ambiguous_target",
    details: { candidates: summaries },
  };
}

