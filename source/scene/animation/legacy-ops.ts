import type { OperateAnimationResponse, OperateAnimationTarget } from "./types.js";
import { asNonEmptyString } from "./value-coercion.js";
import { asNumber } from "./utils.js";

const LEGACY_OPERATIONS = ["play", "pause", "crossFade", "resume", "stop"] as const;

export function isLegacyOperation(operation: string): boolean {
  return (LEGACY_OPERATIONS as readonly string[]).includes(operation);
}

type LegacyOpHandler = (
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
) => OperateAnimationResponse;

function play(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const clipName = asNonEmptyString(options?.clipName);
  if (clipName) {
    component.play(clipName);
    return { success: true, targetResolved, data: { clipName } };
  }

  const defaultClipName = asNonEmptyString(component?.defaultClip?.name);
  if (!defaultClipName) {
    return {
      success: false,
      targetResolved,
      error: "clipName is required when defaultClip is missing",
    };
  }

  component.play();
  return {
    success: true,
    targetResolved,
    data: { clipName: defaultClipName },
  };
}

function pause(
  component: any,
  targetResolved: OperateAnimationTarget,
  _options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  component.pause();
  return { success: true, targetResolved, data: { paused: true } };
}

function crossFade(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const clipName = asNonEmptyString(options?.clipName);
  if (!clipName) {
    return { success: false, targetResolved, error: "clipName is required" };
  }

  const duration = asNumber((options as any)?.duration);
  if (duration !== undefined) {
    component.crossFade(clipName, duration);
  } else {
    component.crossFade(clipName);
  }

  return { success: true, targetResolved, data: { clipName, duration } };
}

function resume(
  component: any,
  targetResolved: OperateAnimationTarget,
  _options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  component.resume();
  return { success: true, targetResolved, data: { resumed: true } };
}

function stop(
  component: any,
  targetResolved: OperateAnimationTarget,
  _options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  component.stop();
  return { success: true, targetResolved, data: { stopped: true } };
}

const HANDLERS: Record<string, LegacyOpHandler> = {
  play,
  pause,
  crossFade,
  resume,
  stop,
};

export function operateLegacy(
  operation: string,
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const handler = HANDLERS[operation];
  if (!handler) {
    return { success: false, targetResolved, error: `Unsupported operation: ${operation}` };
  }
  return handler(component, targetResolved, options);
}
