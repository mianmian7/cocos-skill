import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { getComponentInfo, tryToAddComponent } from "../tool-utils";
import packageJSON from '../../../package.json';

export function registerCreateNodesTool(server: ToolRegistrar): void {
  const extractCreatedNodeUuid = (createNodeResult: unknown): string | undefined => {
    if (typeof createNodeResult === "string") {
      return createNodeResult;
    }

    if (Array.isArray(createNodeResult)) {
      const firstString = createNodeResult.find((entry) => typeof entry === "string");
      return typeof firstString === "string" ? firstString : undefined;
    }

    return undefined;
  };

  const queryNodesByPrefabAssetUuid = async (assetUuid: string): Promise<string[]> => {
    const result = await Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid);
    if (!Array.isArray(result)) {
      return [];
    }

    return result.filter((entry): entry is string => typeof entry === "string");
  };

  const isLinkedToPrefabAsset = (nodeInfo: any, assetUuid: string): boolean => {
    if (!nodeInfo || typeof nodeInfo !== "object") {
      return false;
    }

    const prefabInfo = nodeInfo.__prefab__ || nodeInfo._prefab || nodeInfo.prefab;
    const linkedPrefabUuid =
      prefabInfo?.uuid || prefabInfo?.assetUuid || prefabInfo?.asset?.uuid || prefabInfo?.value?.uuid;

    return typeof linkedPrefabUuid === "string" && linkedPrefabUuid === assetUuid;
  };

  const resolvePrefabInstanceUuid = async (
    fallbackUuid: string,
    assetUuid: string,
    linkedNodesBeforeCreate: Set<string>
  ): Promise<string> => {
    let linkedNodesAfterCreate: string[] = [];
    try {
      linkedNodesAfterCreate = await queryNodesByPrefabAssetUuid(assetUuid);
    } catch {
      return fallbackUuid;
    }

    const newlyLinkedNodes = linkedNodesAfterCreate.filter((uuid) => !linkedNodesBeforeCreate.has(uuid));
    if (newlyLinkedNodes.length === 1) {
      return newlyLinkedNodes[0];
    }

    try {
      const fallbackNodeInfo = await Editor.Message.request('scene', 'query-node', fallbackUuid);
      if (isLinkedToPrefabAsset(fallbackNodeInfo, assetUuid)) {
        return fallbackUuid;
      }
    } catch {
      // Keep fallback behavior.
    }

    return fallbackUuid;
  };

  // Helper function to get root scene node
  const getRootSceneNode = async (): Promise<string> => {
    const hierarchy = await Editor.Message.request('scene', 'query-node-tree') as any;
    if (hierarchy && hierarchy.uuid) {
      return hierarchy.uuid;
    } else {
      throw new Error("No scene loaded");
    }
  };

  const nodeTypesMap: { [key: string]: { url: string, requireCanvas: boolean} } = {
    "3D/Capsule": { url: "db://internal/default_prefab/3d/Capsule.prefab", requireCanvas: false },
    "3D/Cone": { url: "db://internal/default_prefab/3d/Cone.prefab", requireCanvas: false },
    "3D/Cube": { url: "db://internal/default_prefab/3d/Cube.prefab", requireCanvas: false },
    "3D/Cylinder": { url: "db://internal/default_prefab/3d/Cylinder.prefab", requireCanvas: false },
    "3D/Plane": { url: "db://internal/default_prefab/3d/Plane.prefab", requireCanvas: false },
    "3D/Quad": { url: "db://internal/default_prefab/3d/Quad.prefab", requireCanvas: false },
    "3D/Sphere": { url: "db://internal/default_prefab/3d/Sphere.prefab", requireCanvas: false },
    "3D/Torus": { url: "db://internal/default_prefab/3d/Torus.prefab", requireCanvas: false },
    "SpriteRenderer": { url: "db://internal/default_prefab/ui/SpriteRenderer.prefab", requireCanvas: false },
    "2D/Graphics": { url: "db://internal/default_prefab/ui/Graphics.prefab", requireCanvas: true },
    "2D/Label": { url: "db://internal/default_prefab/ui/Label.prefab", requireCanvas: true },
    "2D/Mask": { url: "db://internal/default_prefab/ui/Mask.prefab", requireCanvas: true },
    "2D/ParticleSystem2D": { url: "db://internal/default_prefab/ui/ParticleSystem2D.prefab", requireCanvas: true },
    "2D/Sprite": { url: "db://internal/default_prefab/ui/Sprite.prefab", requireCanvas: true },
    "2D/SpriteSplash": { url: "db://internal/default_prefab/ui/SpriteSplash.prefab", requireCanvas: true },
    "2D/TiledMap": { url: "db://internal/default_prefab/ui/TiledMap.prefab", requireCanvas: true },
    "UI/Button (with Label)": { url: "db://internal/default_prefab/ui/Button.prefab", requireCanvas: true },
    "UI/Canvas": { url: "db://internal/default_prefab/ui/Canvas.prefab", requireCanvas: false },
    "UI/EditBox": { url: "db://internal/default_prefab/ui/EditBox.prefab", requireCanvas: true },
    "UI/Layout": { url: "db://internal/default_prefab/ui/Layout.prefab", requireCanvas: true },
    "UI/PageView": { url: "db://internal/default_prefab/ui/pageView.prefab", requireCanvas: true },
    "UI/ProgressBar": { url: "db://internal/default_prefab/ui/ProgressBar.prefab", requireCanvas: true },
    "UI/RichText": { url: "db://internal/default_prefab/ui/RichText.prefab", requireCanvas: true },
    "UI/ScrollView": { url: "db://internal/default_prefab/ui/ScrollView.prefab", requireCanvas: true },
    "UI/Slider": { url: "db://internal/default_prefab/ui/Slider.prefab", requireCanvas: true },
    "UI/Toggle": { url: "db://internal/default_prefab/ui/Toggle.prefab", requireCanvas: true },
    "UI/ToggleGroup": { url: "db://internal/default_prefab/ui/ToggleContainer.prefab", requireCanvas: true },
    "UI/VideoPlayer": { url: "db://internal/default_prefab/ui/VideoPlayer.prefab", requireCanvas: true },
    "UI/WebView": { url: "db://internal/default_prefab/ui/WebView.prefab", requireCanvas: true },
    "UI/Widget": { url: "db://internal/default_prefab/ui/Widget.prefab", requireCanvas: true },
    "Light/Directional": { url: "db://internal/default_prefab/light/Directional Light.prefab", requireCanvas: false },
    "Light/Sphere": { url: "db://internal/default_prefab/light/Sphere Light.prefab", requireCanvas: false },
    "Light/Spot": { url: "db://internal/default_prefab/light/Spot Light.prefab", requireCanvas: false },
    "Light/LightProbeGroup": { url: "db://internal/default_prefab/light/Light Probe Group.prefab", requireCanvas: false },
    "Light/ReflectionProbe": { url: "db://internal/default_prefab/light/Reflection Probe.prefab", requireCanvas: false },
    "ParticleSystem": { url: "db://internal/default_prefab/effects/Particle System.prefab", requireCanvas: false },
    "Camera": { url: "db://internal/default_prefab/Camera.prefab", requireCanvas: false },
    "Terrain": { url: "db://internal/default_prefab/Terrain.prefab", requireCanvas: false }
  };

  const mobilityTypes: { [key: string]: number } = {
    "Static": 0,
    "Stationary": 1,
    "Movable": 2
  };

  // Build enum arrays from constants for consistency
  const nodeTypeValues = ["Prefab", "Empty", ...Object.keys(nodeTypesMap)];
  const mobilityValues = ["Static", "Stationary", "Movable"] as const;

  server.registerTool(
    "create_nodes",
    {
      title: "Create Multiple Nodes",
      description: "Creates multiple nodes of specific types, with components and properties. Returns nodes and components UUIDs. 2D and UI nodes should be placed under Canvas, will be created if not present.",
      inputSchema: {
        nodes: z.array(z.object({
          type: z.enum(nodeTypeValues as [string, ...string[]]),
          name: z.string().default("Node"),
          components: z.array(z.string()).default([]).describe("Component types to add"),
          // Flat properties for consistency with component property paths
          position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
          eulerAngles: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
          scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
          prefabUuid: z.string().describe("Prefab UUID (required for Prefab type)").optional(),
          enabled: z.boolean().default(true).describe("Enabled state"),
          layer: z.number().describe("Layer bitmask").optional(),
          mobility: z.enum(mobilityValues).optional(),
          siblingIndex: z.number().int().describe("Position in parent").optional()
        })),
        parentUuid: z.string().describe("Parent UUID (defaults to scene root)").optional()
      }
    },
    async (args) => {
      const { nodes, parentUuid } = args;
      const results: any[] = [];
      const errors: string[] = [];

      try {
        // Get parent UUID or use root scene
        let targetParentUuid: string | undefined;
        if (parentUuid) {
          targetParentUuid = decodeUuid(parentUuid);
        } else {
          targetParentUuid = await getRootSceneNode();
        }

        for (const nodeSpec of nodes) {
          try {
            let nodeUuid: string;
            
            // Create node based on type
            if (nodeSpec.type === "Empty") {
              // Create empty node
              const result = await Editor.Message.request('scene', 'create-node', {
                parent: targetParentUuid
              });
              const extractedUuid = extractCreatedNodeUuid(result);
              if (!extractedUuid) {
                errors.push(`Failed to create node of type ${nodeSpec.type}: create-node did not return UUID`);
                continue;
              }
              nodeUuid = extractedUuid;
            } else if (nodeSpec.type === "Prefab") {
              if (!nodeSpec.prefabUuid) {
                errors.push(`Prefab UUID is required for node type "Prefab"`);
                continue;
              }
              
              // Check if prefabUuid is a URL (starts with db://) or actual UUID
              let assetUuid: string;
              if (nodeSpec.prefabUuid.startsWith("db://")) {
                // It's a URL, need to query for UUID
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', nodeSpec.prefabUuid);
                if (!assetInfo) {
                  errors.push(`Can't find prefab at ${nodeSpec.prefabUuid}`);
                  continue;
                }
                assetUuid = assetInfo.uuid;
              } else {
                // It's already a UUID, decode it
                assetUuid = decodeUuid(nodeSpec.prefabUuid);
              }

              let linkedNodesBeforeCreate = new Set<string>();
              try {
                linkedNodesBeforeCreate = new Set(await queryNodesByPrefabAssetUuid(assetUuid));
              } catch {
                // Keep empty baseline when query fails.
              }
              
              // Create prefab instance
              const result = await Editor.Message.request('scene', 'create-node', {
                parent: targetParentUuid,
                assetUuid: assetUuid,
                unlinkPrefab: false
              });
              const fallbackUuid = extractCreatedNodeUuid(result);
              if (!fallbackUuid) {
                errors.push(`Failed to create node of type ${nodeSpec.type}: create-node did not return UUID`);
                continue;
              }

              try {
                const linked = await Editor.Message.request('scene', 'execute-scene-script', {
                  name: packageJSON.name,
                  method: 'linkNodeWithPrefabAsset',
                  args: [fallbackUuid, assetUuid],
                });
                if (!linked) {
                  errors.push(`Created node ${nodeSpec.name} but failed to link prefab asset ${encodeUuid(assetUuid)}`);
                }
              } catch (linkError) {
                errors.push(`Error linking prefab asset for node ${nodeSpec.name}: ${linkError instanceof Error ? linkError.message : String(linkError)}`);
              }

              nodeUuid = await resolvePrefabInstanceUuid(fallbackUuid, assetUuid, linkedNodesBeforeCreate);
            } else {
              // Create node from template - first get the actual UUID
              const template = nodeTypesMap[nodeSpec.type];
              if (!template) {
                errors.push(`Unknown node type: ${nodeSpec.type}`);
                continue;
              }

              try {
                // Query asset info to get the actual UUID from the URL
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', template.url);
                if (!assetInfo) {
                  errors.push(`Can't find template prefab for ${nodeSpec.type} at ${template.url}`);
                  continue;
                }

                const result = await Editor.Message.request('scene', 'create-node', {
                  parent: targetParentUuid,
                  assetUuid: assetInfo.uuid,
                  name: nodeSpec.name,
                  unlinkPrefab: true,
                  canvasRequired: template.requireCanvas
                });
                const extractedUuid = extractCreatedNodeUuid(result);
                if (!extractedUuid) {
                  errors.push(`Failed to create node of type ${nodeSpec.type}: create-node did not return UUID`);
                  continue;
                }
                nodeUuid = extractedUuid;
              } catch (templateError) {
                errors.push(`Error creating ${nodeSpec.type} node: ${templateError instanceof Error ? templateError.message : String(templateError)}`);
                continue;
              }
            }

            if (!nodeUuid) {
              errors.push(`Failed to create node of type ${nodeSpec.type}`);
              continue;
            }

            const encodedNodeUuid = encodeUuid(nodeUuid);

            // Set basic node properties
            const nodeProperties: any[] = [];

            if (nodeSpec.name !== undefined) {
              nodeProperties.push({ path: 'name', value: nodeSpec.name, type: 'String' });
            }

            if (nodeSpec.position !== undefined) {
              nodeProperties.push({ path: 'position', value: nodeSpec.position, type: 'cc.Vec3' });
            }

            if (nodeSpec.eulerAngles !== undefined) {
              nodeProperties.push({ path: 'rotation', value: nodeSpec.eulerAngles, type: 'cc.Vec3' });
            }

            if (nodeSpec.scale !== undefined) {
              nodeProperties.push({ path: 'scale', value: nodeSpec.scale, type: 'cc.Vec3' });
            }

            if (nodeSpec.enabled !== undefined) {
              nodeProperties.push({ path: 'active', value: nodeSpec.enabled, type: 'Boolean' });
            }

            if (nodeSpec.layer !== undefined) {
              nodeProperties.push({ path: 'layer', value: nodeSpec.layer, type: 'Number' });
            }

            if (nodeSpec.mobility !== undefined) {
              const mobilityValue = mobilityTypes[nodeSpec.mobility];
              nodeProperties.push({ path: 'mobility', value: mobilityValue, type: 'Number' });
            }

            // Apply node properties if any
            if (nodeProperties.length > 0) {
              // Apply properties individually (correct API based on operate-nodes.ts)
              for (const prop of nodeProperties) {
                try {
                  await Editor.Message.request('scene', 'set-property', {
                    uuid: nodeUuid,
                    path: prop.path,
                    dump: { value: prop.value, type: prop.type }
                  });
                } catch (propError) {
                  errors.push(`Error setting ${prop.path} on node ${nodeSpec.name}: ${propError instanceof Error ? propError.message : String(propError)}`);
                }
              }
            }

            // Handle sibling index separately (similar to operate-nodes.ts)
            if (nodeSpec.siblingIndex !== undefined) {
              try {
                const nodeInfo = await Editor.Message.request('scene', 'query-node', nodeUuid);
                const parentUuid = nodeInfo?.parent?.value?.uuid;
                if (!parentUuid || parentUuid.length === 0) {
                  errors.push(`Node ${nodeSpec.name} has no parent for sibling index setting`);
                } else {
                  const parentNode = await Editor.Message.request('scene', 'query-node', parentUuid);
                  const childrenArray = parentNode.children;
                  if (!childrenArray || !Array.isArray(childrenArray)) {
                    errors.push(`Parent node has no children array for sibling index setting`);
                  } else {
                    const currentIndex = childrenArray.findIndex(child => child.value.uuid === nodeUuid);
                    if (currentIndex !== -1 && currentIndex !== nodeSpec.siblingIndex) {
                      const targetIndex = Math.min(nodeSpec.siblingIndex, childrenArray.length - 1);
                      const offset = targetIndex - currentIndex;
                      await Editor.Message.request('scene', 'move-array-element', {
                        uuid: parentUuid,
                        path: 'children',
                        target: currentIndex,
                        offset: offset,
                      });
                    }
                  }
                }
              } catch (siblingError) {
                errors.push(`Error setting sibling index on node ${nodeSpec.name}: ${siblingError instanceof Error ? siblingError.message : String(siblingError)}`);
              }
            }

            // Add new components and collect all component UUIDs
            const allComponents: Array<{ uuid: string, type: string }> = [];

            // First, add any new components specified
            for (const componentType of nodeSpec.components) {
              try {
                const componentDescription = await tryToAddComponent(nodeUuid, componentType, false);
                if (componentDescription.uuid) {
                  allComponents.push({
                    uuid: componentDescription.uuid,
                    type: componentType
                  });
                } else {
                  errors.push(`Failed to add component ${componentType} to node ${nodeSpec.name}: ${componentDescription.error || 'Unknown error'}`);
                }
              } catch (componentError) {
                errors.push(`Error adding component ${componentType}: ${componentError instanceof Error ? componentError.message : String(componentError)}`);
              }
            }

            // Get all components on the node (including existing ones from prefabs)
            try {
              const nodeInfo = await Editor.Message.request('scene', 'query-node', nodeUuid);
              if (nodeInfo && nodeInfo.__comps__) {
                for (const comp of nodeInfo.__comps__) {
                  if (comp.value && typeof comp.value === 'object' && 'uuid' in comp.value) {
                    const compValue = comp.value as any;
                    const compUuid = compValue.uuid.value;
                    // Only add if not already in our list
                    if (!allComponents.some(c => c.uuid === encodeUuid(compUuid))) {
                      const compInfo = await getComponentInfo(compUuid, false, false);
                      if (compInfo.type && !compInfo.error) {
                        allComponents.push({
                          uuid: encodeUuid(compUuid),
                          type: compInfo.type
                        });
                      }
                    }
                  }
                }
              }
            } catch (getComponentError) {
              errors.push(`Error getting existing components for node ${nodeSpec.name}: ${getComponentError instanceof Error ? getComponentError.message : String(getComponentError)}`);
            }

            let result: any = {
              uuid: encodedNodeUuid,
              name: nodeSpec.name
            };
            if (allComponents.length > 0) {
              result.components = allComponents;
            }

            results.push(result);

          } catch (nodeError) {
            errors.push(`Error creating node ${nodeSpec.name}: ${nodeError instanceof Error ? nodeError.message : String(nodeError)}`);
          }
        }

        const result = {
          nodes: results,
          successCount: results.length,
          totalNodes: nodes.length,
          errors: errors.length > 0 ? errors : undefined
        };

        await Editor.Message.request('scene', 'snapshot');

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result)
          }]
        };

      } catch (error) {
        const result = {
          nodes: [],
          successCount: 0,
          totalNodes: nodes.length,
          errors: [`Global error: ${error instanceof Error ? error.message : String(error)}`]
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result)
          }]
        };
      }
    }
  );
}
