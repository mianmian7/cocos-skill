import type { OperateAnimationResponse, OperateAnimationTarget } from "./types.js";
import { asNonEmptyString } from "./value-coercion.js";
import { asNumber, mapClipStatuses } from "./utils.js";

const CONTROLLER_OPERATIONS = [
  "setValue",
  "getVariables",
  "getValue",
  "getLayerWeight",
  "setLayerWeight",
  "getStatus",
] as const;

export function isControllerOperation(operation: string): boolean {
  return (CONTROLLER_OPERATIONS as readonly string[]).includes(operation);
}

type ControllerOpHandler = (
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
) => OperateAnimationResponse;

function setValue(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const variableName = asNonEmptyString(options?.variableName);
  if (!variableName) {
    return { success: false, targetResolved, error: "variableName is required" };
  }

  const value = (options as any)?.value;
  component.setValue(variableName, value);
  return { success: true, targetResolved, data: { variableName, value } };
}

function getVariables(
  component: any,
  targetResolved: OperateAnimationTarget,
  _options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const variables: Array<{ name: string; type: unknown }> = [];
  for (const entry of component.getVariables?.() ?? []) {
    const name = entry?.[0];
    const meta = entry?.[1];
    if (typeof name === "string") {
      variables.push({ name, type: meta?.type });
    }
  }
  return { success: true, targetResolved, data: { variables } };
}

function getValue(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const variableName = asNonEmptyString(options?.variableName);
  if (!variableName) {
    return { success: false, targetResolved, error: "variableName is required" };
  }

  const value = component.getValue(variableName);
  return { success: true, targetResolved, data: { variableName, value } };
}

function getLayerWeight(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const layer = asNumber((options as any)?.layer);
  if (layer === undefined || !Number.isInteger(layer)) {
    return { success: false, targetResolved, error: "layer (int) is required" };
  }

  const weight = component.getLayerWeight(layer);
  return { success: true, targetResolved, data: { layer, weight } };
}

function setLayerWeight(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const layer = asNumber((options as any)?.layer);
  if (layer === undefined || !Number.isInteger(layer)) {
    return { success: false, targetResolved, error: "layer (int) is required" };
  }

  const weight = asNumber((options as any)?.weight);
  if (weight === undefined) {
    return { success: false, targetResolved, error: "weight (number) is required" };
  }

  component.setLayerWeight(layer, weight);
  return { success: true, targetResolved, data: { layer, weight } };
}

function getStatus(
  component: any,
  targetResolved: OperateAnimationTarget,
  options: Record<string, unknown> | undefined
): OperateAnimationResponse {
  const layer = asNumber((options as any)?.layer);
  if (layer === undefined || !Number.isInteger(layer)) {
    return { success: false, targetResolved, error: "layer (int) is required" };
  }

  const currentStateStatus = component.getCurrentStateStatus(layer);
  const currentClipStatuses = mapClipStatuses(component.getCurrentClipStatuses(layer));
  const currentTransition = component.getCurrentTransition(layer);
  const nextStateStatus = component.getNextStateStatus(layer);
  const nextClipStatuses = mapClipStatuses(component.getNextClipStatuses(layer));

  return {
    success: true,
    targetResolved,
    data: {
      layer,
      currentStateStatus,
      currentClipStatuses,
      currentTransition,
      nextStateStatus,
      nextClipStatuses,
    },
  };
}

const HANDLERS: Record<string, ControllerOpHandler> = {
  setValue,
  getVariables,
  getValue,
  getLayerWeight,
  setLayerWeight,
  getStatus,
};

export function operateController(
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

