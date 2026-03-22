import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";

type DesignResolutionInput = {
  width: number;
  height: number;
  fitWidth: boolean;
  fitHeight: boolean;
};

type CollisionMatrixInput = {
  groupId: number;
  collidesWith: number[];
};

type ProjectSettingsArgs = {
  designResolution?: DesignResolutionInput;
  objectLayers?: string[];
  sortingLayers?: string[];
  collisionGroups?: string[];
  collisionMatrix?: CollisionMatrixInput[];
};

const OPERATE_PROJECT_SETTINGS_SCHEMA = {
  designResolution: z
    .object({
      width: z.number().int(),
      height: z.number().int(),
      fitWidth: z.boolean(),
      fitHeight: z.boolean(),
    })
    .optional(),
  objectLayers: z.array(z.string()).optional().describe("Object layers names array"),
  sortingLayers: z.array(z.string()).optional().describe("Used for cc.Sorting component"),
  collisionGroups: z.array(z.string()).optional().describe("Collision group names array"),
  collisionMatrix: z
    .array(
      z.object({
        groupId: z.number().int(),
        collidesWith: z.array(z.number().int()),
      })
    )
    .optional(),
};

export function registerOperateProjectSettingsTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_project_settings",
    {
      title: "Operate Project Settings",
      description: "Get/set project settings",
      inputSchema: OPERATE_PROJECT_SETTINGS_SCHEMA,
    },
    async (args: ProjectSettingsArgs) => {
      const hasMutations = hasSettingMutations(args);
      return runToolWithContext(
        {
          toolName: "operate_project_settings",
          operation: hasMutations ? "update-settings" : "read-settings",
          effect: hasMutations ? "mutating-scene" : "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const errors = hasMutations ? await applyProjectSettings(request, args) : [];
          const actualSettings = await readProjectSettings(request, errors);

          if (hasMutations) {
            await request("scene", "soft-reload");
          }

          return {
            success: errors.length === 0,
            data: { actualSettings },
            errors,
          };
        }
      );
    }
  );
}

function hasSettingMutations(args: ProjectSettingsArgs): boolean {
  return Boolean(
    args.designResolution ||
      args.objectLayers ||
      args.sortingLayers ||
      args.collisionGroups ||
      args.collisionMatrix
  );
}

async function applyProjectSettings(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  args: ProjectSettingsArgs
): Promise<string[]> {
  const errors: string[] = [];

  try {
    if (args.designResolution) {
      await setDesignResolution(request, args.designResolution);
    }
    if (args.objectLayers) {
      await setObjectLayers(request, args.objectLayers);
    }
    if (args.sortingLayers) {
      await setSortingLayers(request, args.sortingLayers);
    }
    if (args.collisionGroups) {
      await setCollisionGroups(request, args.collisionGroups);
    }
    if (args.collisionMatrix) {
      await setCollisionMatrix(request, args.collisionMatrix);
    }
  } catch (error) {
    errors.push(`Error setting: ${toErrorMessage(error)}`);
  }

  return errors;
}

async function setDesignResolution(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  designResolution: DesignResolutionInput
): Promise<void> {
  for (const [key, value] of Object.entries(designResolution)) {
    const result = await request("project", "set-config", "project", `general.designResolution.${key}`, value);
    if (!result) {
      throw new Error("Failed to set design resolution");
    }
  }
}

async function setObjectLayers(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  objectLayers: string[]
): Promise<void> {
  const parsedLayers = objectLayers.map((name, index) => ({ name, value: 1 << index }));
  const result = await request("project", "set-config", "project", "layer", parsedLayers);
  if (!result) {
    throw new Error("Failed to set object layers");
  }
}

async function setSortingLayers(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  sortingLayers: string[]
): Promise<void> {
  const normalizedLayers = normalizeSortingLayers(sortingLayers);
  const parsedLayers = normalizedLayers.map((name, index) => ({ id: index, name, value: index }));
  const result = await request("project", "set-config", "project", "sorting-layer.layers", parsedLayers);
  if (!result) {
    throw new Error("Failed to set sorting layers");
  }
}

function normalizeSortingLayers(sortingLayers: string[]): string[] {
  const withoutDefault = sortingLayers.filter((layer) => layer !== "default");
  return ["default", ...withoutDefault];
}

async function setCollisionGroups(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  collisionGroups: string[]
): Promise<void> {
  const parsedGroups = collisionGroups
    .filter((group) => group !== "DEFAULT")
    .map((name, index) => ({ index: index + 1, name }));
  const result = await request("project", "set-config", "project", "physics.collisionGroups", parsedGroups);
  if (!result) {
    throw new Error("Failed to set collision groups");
  }
}

async function setCollisionMatrix(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  collisionMatrix: CollisionMatrixInput[]
): Promise<void> {
  const parsedMatrix = await request("project", "query-config", "project", "physics.collisionMatrix");
  if (!parsedMatrix || !Array.isArray(parsedMatrix)) {
    throw new Error("Failed to fetch actual collision matrix");
  }

  for (const collision of collisionMatrix) {
    parsedMatrix[collision.groupId] = 0;
    for (const targetGroupId of collision.collidesWith) {
      parsedMatrix[collision.groupId] = parsedMatrix[collision.groupId] | (1 << targetGroupId);
    }
  }

  const result = await request("project", "set-config", "project", "physics.collisionMatrix", parsedMatrix);
  if (!result) {
    throw new Error("Failed to set collision matrix");
  }
}

async function readProjectSettings(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>,
  errors: string[]
): Promise<Record<string, unknown>> {
  const projectSettings: Record<string, unknown> = {};

  try {
    const designResolution = await request("project", "query-config", "project", "general.designResolution");
    if (designResolution) {
      projectSettings.designResolution = designResolution;
    }

    const objectLayers = await request("project", "query-config", "project", "layer");
    if (Array.isArray(objectLayers)) {
      projectSettings.objectLayers = mergeBuiltInObjectLayers(objectLayers);
    }

    const sortingLayers = await request("project", "query-config", "project", "sorting-layer.layers");
    if (sortingLayers) {
      projectSettings.sortingLayers = sortingLayers;
    }

    const collisionGroups = await request("project", "query-config", "project", "physics.collisionGroups");
    if (Array.isArray(collisionGroups)) {
      projectSettings.collisionGroups = [{ index: 0, name: "DEFAULT" }, ...collisionGroups];
    }

    const collisionMatrix = await request("project", "query-config", "project", "physics.collisionMatrix");
    if (Array.isArray(collisionMatrix)) {
      projectSettings.collisionMatrix = decodeCollisionMatrix(collisionMatrix);
    }
  } catch (error) {
    errors.push(`Error getting settings: ${toErrorMessage(error)}`);
  }

  if (Object.keys(projectSettings).length === 0) {
    errors.push("Failed to retrieve project settings");
  }

  return projectSettings;
}

function mergeBuiltInObjectLayers(objectLayers: Array<{ name: string; value: number }>) {
  const customLayers = objectLayers.filter((layer) => layer.name !== "NONE");
  const builtInLayers = [
    { name: "NONE", value: 0 },
    { name: "IGNORE_RAYCAST", value: 1048576 },
    { name: "GIZMOS", value: 2097152 },
    { name: "EDITOR", value: 4194304 },
    { name: "UI_3D", value: 8388608 },
    { name: "SCENE_GIZMO", value: 16777216 },
    { name: "UI_2D", value: 33554432 },
    { name: "PROFILER", value: 268435456 },
    { name: "DEFAULT", value: 1073741824 },
    { name: "ALL", value: 4294967295 },
  ];

  const filteredCustomLayers = customLayers.filter(
    (layer) => !builtInLayers.some((builtInLayer) => builtInLayer.name === layer.name)
  );
  return [builtInLayers[0], ...filteredCustomLayers, ...builtInLayers.slice(1)];
}

function decodeCollisionMatrix(collisionMatrix: number[]): CollisionMatrixInput[] {
  const parsedCollisionMatrix: CollisionMatrixInput[] = [];

  collisionMatrix.forEach((bitmask, groupId) => {
    const collidesWith: number[] = [];
    for (let bit = 0; bit < 32; bit += 1) {
      if (bitmask & (1 << bit)) {
        collidesWith.push(bit);
      }
    }

    if (collidesWith.length > 0) {
      parsedCollisionMatrix.push({ groupId, collidesWith });
    }
  });

  return parsedCollisionMatrix;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
