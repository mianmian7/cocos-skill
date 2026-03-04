import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { tryToAddComponent } from "../tool-utils";

export function registerModifyNodesTool(server: ToolRegistrar): void {
  const mobilityTypes: { [key: string]: number } = {
    "Static": 0,
    "Stationary": 1,
    "Movable": 2
  };

  // Build enum arrays from constants for consistency
  const mobilityValues = ["Static", "Stationary", "Movable"] as const;

  server.registerTool(
    "modify_nodes",
    {
      title: "Modify Multiple Nodes",
      description: "Modifies existing nodes properties, hierarchy, and components. Each node is configured individually for maximum control.",
      inputSchema: {
        nodes: z.array(z.object({
          uuid: z.string().describe("Required: target node UUID"),
          properties: z.object({
            name: z.string().optional(),
            position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
            eulerAngles: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
            scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
            enabled: z.boolean().optional(),
            layer: z.number().optional(),
            mobility: z.enum(mobilityValues).optional()
          }).optional().describe("Optional: update node properties"),
          addComponents: z.array(z.string()).optional().describe("Optional: add new components (flat array)"),
          removeComponentUuids: z.array(z.string()).optional().describe("Optional: remove specific components by UUID"),
          newParentUuid: z.string().optional().describe("Optional: change parent"),
          siblingIndex: z.number().optional().describe("Optional: reorder within parent"),
          deleteNode: z.boolean().optional().describe("Optional: delete this node (will ignore other operations)")
        }))
      }
    },
    async (args) => {
      const { nodes } = args;
      const results: any[] = [];
      const errors: string[] = [];

      try {
        for (const nodeSpec of nodes) {
          const nodeResult: any = {
            uuid: nodeSpec.uuid,
            success: true,
            propertiesSet: [],
            componentsAdded: [],
            componentsRemoved: [],
            errors: []
          };

          try {
            const decodedNodeUuid = decodeUuid(nodeSpec.uuid);

            // Verify node exists
            const nodeInfo = await Editor.Message.request('scene', 'query-node', decodedNodeUuid);
            if (!nodeInfo) {
              nodeResult.success = false;
              nodeResult.errors.push(`Node with UUID ${nodeSpec.uuid} not found`);
              results.push(nodeResult);
              continue;
            }

            // Handle node deletion first (skip other operations if deleting)
            if (nodeSpec.deleteNode) {
              try {
                await Editor.Message.request('scene', 'remove-node', { uuid: decodedNodeUuid });
                nodeResult.deleted = true;
                nodeResult.success = true;
                results.push(nodeResult);
                continue; // Skip other operations
              } catch (deleteError) {
                nodeResult.success = false;
                nodeResult.errors.push(`Failed to delete node: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
                results.push(nodeResult);
                continue;
              }
            }

            // Update node properties
            if (nodeSpec.properties) {
              const nodeProperties: any[] = [];

              if (nodeSpec.properties.name !== undefined) {
                nodeProperties.push({ path: 'name', value: nodeSpec.properties.name, type: 'String' });
              }

              if (nodeSpec.properties.position !== undefined) {
                nodeProperties.push({ path: 'position', value: nodeSpec.properties.position, type: 'cc.Vec3' });
              }

              if (nodeSpec.properties.eulerAngles !== undefined) {
                nodeProperties.push({ path: 'eulerAngles', value: nodeSpec.properties.eulerAngles, type: 'cc.Vec3' });
              }

              if (nodeSpec.properties.scale !== undefined) {
                nodeProperties.push({ path: 'scale', value: nodeSpec.properties.scale, type: 'cc.Vec3' });
              }

              if (nodeSpec.properties.enabled !== undefined) {
                nodeProperties.push({ path: 'active', value: nodeSpec.properties.enabled, type: 'Boolean' });
              }

              if (nodeSpec.properties.layer !== undefined) {
                nodeProperties.push({ path: 'layer', value: nodeSpec.properties.layer, type: 'Number' });
              }

              if (nodeSpec.properties.mobility !== undefined) {
                const mobilityValue = mobilityTypes[nodeSpec.properties.mobility];
                nodeProperties.push({ path: 'mobility', value: mobilityValue, type: 'Number' });
              }

              // Apply node properties individually (correct API)
              if (nodeProperties.length > 0) {
                for (const prop of nodeProperties) {
                  try {
                    await Editor.Message.request('scene', 'set-property', {
                      uuid: decodedNodeUuid,
                      path: prop.path,
                      dump: { value: prop.value, type: prop.type }
                    });
                    nodeResult.propertiesSet.push(prop.path);
                  } catch (propError) {
                    nodeResult.success = false;
                    nodeResult.errors.push(`Failed to set ${prop.path}: ${propError instanceof Error ? propError.message : String(propError)}`);
                  }
                }
              }
            }

            // Remove components
            if (nodeSpec.removeComponentUuids && nodeSpec.removeComponentUuids.length > 0) {
              for (const componentUuid of nodeSpec.removeComponentUuids) {
                try {
                  const decodedComponentUuid = decodeUuid(componentUuid);
                  
                  // Verify component exists
                  const componentInfo = await Editor.Message.request('scene', 'query-component', decodedComponentUuid);
                  if (!componentInfo) {
                    nodeResult.errors.push(`Component with UUID ${componentUuid} not found`);
                    continue;
                  }

                  // Remove component
                  await Editor.Message.request('scene', 'remove-component', {
                    uuid: decodedComponentUuid
                  });

                  nodeResult.componentsRemoved.push(componentUuid);
                } catch (removeError) {
                  nodeResult.success = false;
                  nodeResult.errors.push(`Failed to remove component ${componentUuid}: ${removeError instanceof Error ? removeError.message : String(removeError)}`);
                }
              }
            }

            // Add components
            if (nodeSpec.addComponents && nodeSpec.addComponents.length > 0) {
              for (const componentType of nodeSpec.addComponents) {
                try {
                  const componentDescription = await tryToAddComponent(decodedNodeUuid, componentType, false);
                  if (componentDescription.uuid) {
                    nodeResult.componentsAdded.push({
                      uuid: componentDescription.uuid,
                      type: componentType
                    });
                  } else {
                    nodeResult.success = false;
                    nodeResult.errors.push(`Failed to add component ${componentType}: ${componentDescription.error || 'Unknown error'}`);
                  }
                } catch (addError) {
                  nodeResult.success = false;
                  nodeResult.errors.push(`Error adding component ${componentType}: ${addError instanceof Error ? addError.message : String(addError)}`);
                }
              }
            }

            // Change parent
            if (nodeSpec.newParentUuid && nodeSpec.newParentUuid.length > 0) {
              try {
                // Use set-parent message (correct API)
                await Editor.Message.request('scene', 'set-parent', {
                  parent: decodeUuid(nodeSpec.newParentUuid),
                  uuids: decodedNodeUuid,
                  keepWorldTransform: false
                });
                nodeResult.parentChanged = true;
              } catch (moveError) {
                nodeResult.success = false;
                nodeResult.errors.push(`Failed to change parent: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
              }
            }

            // Handle sibling index separately (after parent change if needed)
            if (nodeSpec.siblingIndex !== undefined) {
              // Handle sibling index with move-array-element (proven approach from operate-nodes.ts)
              try {
                // If we changed parent, refresh node info to get the new parent
                let currentNodeInfo = nodeInfo;
                if (nodeSpec.newParentUuid !== undefined) {
                  currentNodeInfo = await Editor.Message.request('scene', 'query-node', decodedNodeUuid);
                }

                const parentUuid = currentNodeInfo?.parent?.value?.uuid;
                if (!parentUuid || parentUuid.length === 0) {
                  nodeResult.errors.push(`Node has no parent for sibling index setting`);
                } else {
                  const parentNode = await Editor.Message.request('scene', 'query-node', parentUuid);
                  const childrenArray = parentNode.children;
                  if (!childrenArray || !Array.isArray(childrenArray)) {
                    nodeResult.errors.push(`Parent node has no children array for sibling index setting`);
                  } else {
                    const currentIndex = childrenArray.findIndex(child => child.value.uuid === decodedNodeUuid);
                    if (currentIndex !== -1 && currentIndex !== nodeSpec.siblingIndex) {
                      const targetIndex = Math.min(nodeSpec.siblingIndex, childrenArray.length - 1);
                      const offset = targetIndex - currentIndex;
                      await Editor.Message.request('scene', 'move-array-element', {
                        uuid: parentUuid,
                        path: 'children',
                        target: currentIndex,
                        offset: offset,
                      });
                      nodeResult.siblingIndexChanged = true;
                    }
                  }
                }
              } catch (reorderError) {
                nodeResult.success = false;
                nodeResult.errors.push(`Failed to reorder node: ${reorderError instanceof Error ? reorderError.message : String(reorderError)}`);
              }
            }

          } catch (nodeError) {
            nodeResult.success = false;
            nodeResult.errors.push(`Error processing node: ${nodeError instanceof Error ? nodeError.message : String(nodeError)}`);
          }

          const processedNodeResult: any = {
            uuid: nodeSpec.uuid,
            success: nodeResult.success
          }
          if (nodeResult.propertiesSet && nodeResult.propertiesSet.length > 0) {
            processedNodeResult.propertiesSet = nodeResult.propertiesSet;
          }
          if (nodeResult.componentsAdded && nodeResult.componentsAdded.length > 0) {
            processedNodeResult.componentsAdded = nodeResult.componentsAdded;
          }
          if (nodeResult.componentsRemoved && nodeResult.componentsRemoved.length > 0) {
            processedNodeResult.componentsRemoved = nodeResult.componentsRemoved;
          }
          if (nodeResult.errors && nodeResult.errors.length > 0) {
            processedNodeResult.errors = nodeResult.errors;
          }

          results.push(processedNodeResult);
        }

        const successCount = results.filter(r => r.success).length;
        const result = {
          operation: "modify-nodes",
          nodes: results,
          successCount,
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
          operation: "modify-nodes",
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
