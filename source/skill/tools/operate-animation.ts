import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { runToolWithContext } from "../runtime/tool-runtime.js";
import type { ToolEffect } from "../runtime/tool-context.js";

type OperateAnimationTarget = {
  kind: "legacy" | "controller";
  nodeUuid: string;
  componentUuid?: string;
};

type OperateAnimationArgs = {
  operation: string;
  target: OperateAnimationTarget;
  options?: Record<string, unknown>;
};

type SceneOperateAnimationResult = {
  success: boolean;
  targetResolved?: OperateAnimationTarget;
  data?: unknown;
  error?: string;
  details?: unknown;
};

const READ_OPERATIONS = new Set(["list", "getVariables", "getValue", "getLayerWeight", "getStatus"]);

function getAnimationEffect(operation: string): ToolEffect {
  return READ_OPERATIONS.has(operation) ? "read" : "mutating-scene";
}

function buildAnimationData(sceneResult: SceneOperateAnimationResult): Record<string, unknown> {
  const data: Record<string, unknown> =
    typeof sceneResult.data === "object" && sceneResult.data !== null && !Array.isArray(sceneResult.data)
      ? { ...(sceneResult.data as Record<string, unknown>) }
      : sceneResult.data === undefined
        ? {}
        : { value: sceneResult.data };

  if (sceneResult.targetResolved) {
    data.targetResolved = sceneResult.targetResolved;
  }
  if (sceneResult.details !== undefined) {
    data.details = sceneResult.details;
  }
  return data;
}

export function registerOperateAnimationTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_animation",
    {
      title: "Operate Animation",
      description: "Structured control over Animation/SkeletalAnimation and AnimationController.",
      inputSchema: {
        operation: z.string(),
        target: z.object({
          kind: z.enum(["legacy", "controller"]),
          nodeUuid: z.string(),
          componentUuid: z.string().optional(),
        }),
        options: z.record(z.any()).optional().default({}),
      },
    },
    async (args: OperateAnimationArgs) =>
      runToolWithContext(
        {
          toolName: "operate_animation",
          operation: args.operation,
          effect: getAnimationEffect(args.operation),
          packageName: packageJSON.name,
          captureSceneLogs: true,
          meta: { targetKind: args.target.kind },
        },
        async ({ callSceneScript }) => {
          const sceneResult = (await callSceneScript("operateAnimation", [args])) as SceneOperateAnimationResult;
          if (!sceneResult || typeof sceneResult !== "object") {
            throw new Error("operateAnimation returned an invalid response");
          }

          const data = buildAnimationData(sceneResult);
          if (!sceneResult.success) {
            return {
              success: false,
              data,
              errors: [sceneResult.error || "operateAnimation failed"],
            };
          }

          return { data };
        }
      )
  );
}
