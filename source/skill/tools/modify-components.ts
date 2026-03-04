import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { setProperties, PropertySetSpec, getComponentInfo } from "../tool-utils";

export function registerModifyComponentsTool(server: ToolRegistrar): void {
  server.registerTool(
    "modify_components",
    {
      title: "Modify Component Properties",
      description: "Updates/removes components using UUID targeting. Safe for nodes with multiple same-type components.",
      inputSchema: {
        components: z.array(z.object({
          uuid: z.string().describe("Required: specific component UUID"),
          properties: z.array(z.object({
            path: z.string().describe("Property path like 'mass' or 'transform.position'"),
            type: z.string().describe("Property type for validation (e.g., 'cc.Vec3', 'String', 'Number')"),
            value: z.any()
          })).optional().describe("properties to update")
        })).optional().describe("Components to modify properties"),
        removeComponentUuids: z.array(z.string()).optional().describe("Component UUIDs to remove")
      }
    },
    async (args) => {
      const { components, removeComponentUuids } = args;
      const results: any[] = [];
      const errors: string[] = [];

      try {
        // Handle property updates
        if (components && components.length > 0) {
          for (const componentSpec of components) {
            const componentResult: any = {
              uuid: componentSpec.uuid,
              success: true,
              propertiesSet: [],
              errors: []
            };

            try {
              const decodedComponentUuid = decodeUuid(componentSpec.uuid);

              // Get component info first to get node UUID
              const componentInfo = await getComponentInfo(componentSpec.uuid, true, false);
              if (componentInfo.error) {
                componentResult.success = false;
                componentResult.errors.push(`Failed to get component info: ${componentInfo.error}`);
                results.push(componentResult);
                continue;
              }

              // Get node UUID from component info
              const targetNodeUuid = componentInfo.properties?.node?.value?.uuid;
              if (!targetNodeUuid) {
                componentResult.success = false;
                componentResult.errors.push(`Component ${componentSpec.uuid} doesn't have associated node property`);
                results.push(componentResult);
                continue;
              }

              // Get node info
              const nodeInfo = await Editor.Message.request('scene', 'query-node', targetNodeUuid);
              if (!nodeInfo || !nodeInfo.__comps__) {
                componentResult.success = false;
                componentResult.errors.push(`Cannot find node or components for component ${componentSpec.uuid}`);
                results.push(componentResult);
                continue;
              }

              // Find component index
              const componentIndex = nodeInfo.__comps__.findIndex((comp: any) => comp.value.uuid.value == decodedComponentUuid);
              if (componentIndex < 0) {
                componentResult.success = false;
                componentResult.errors.push(`Cannot find component ${componentSpec.uuid} in node's component list`);
                results.push(componentResult);
                continue;
              }

              // Update properties if provided
              if (componentSpec.properties && componentSpec.properties.length > 0) {
                const propertySpecs: PropertySetSpec[] = componentSpec.properties.map((prop: {
                  path: string;
                  type: string;
                  value: any;
                }) => ({
                  propertyPath: prop.path,
                  propertyType: prop.type,
                  propertyValue: prop.value
                }));

                const propertyResults = await setProperties(targetNodeUuid, `__comps__.${componentIndex}`, propertySpecs);
                
                // Process results
                for (const result of propertyResults) {
                  if (result.success) {
                    componentResult.propertiesSet.push(result.propertyPath);
                  } else {
                    componentResult.success = false;
                    componentResult.errors.push(`Failed to set property '${result.propertyPath}': ${result.error}`);
                  }
                }
              }

            } catch (componentError) {
              componentResult.success = false;
              componentResult.errors.push(`Error processing component: ${componentError instanceof Error ? componentError.message : String(componentError)}`);
            }

            // Clean up empty arrays for cleaner output
            if (componentResult.errors.length === 0) {
              delete componentResult.errors;
            }

            results.push(componentResult);
          }
        }

        // Handle component removal
        if (removeComponentUuids && removeComponentUuids.length > 0) {
          for (const componentUuid of removeComponentUuids) {
            const removeResult: any = {
              uuid: componentUuid,
              operation: "remove",
              success: false
            };

            try {
              const decodedUuid = decodeUuid(componentUuid);

              // Verify component exists first
              const componentInfo = await Editor.Message.request('scene', 'query-component', decodedUuid);
              if (!componentInfo) {
                removeResult.error = `Component with UUID ${componentUuid} not found`;
                results.push(removeResult);
                continue;
              }

              // Remove component
              await Editor.Message.request('scene', 'remove-component', {
                uuid: decodedUuid
              });

              removeResult.success = true;

            } catch (componentError) {
              removeResult.error = `Failed to remove component: ${componentError instanceof Error ? componentError.message : String(componentError)}`;
            }

            results.push(removeResult);
          }
        }

        const successCount = results.filter(r => r.success).length;
        const result = {
          operation: "modify-components",
          components: results,
          successCount,
          totalComponents: (components?.length || 0) + (removeComponentUuids?.length || 0),
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
          operation: "modify-components",
          components: [],
          successCount: 0,
          totalComponents: (components?.length || 0) + (removeComponentUuids?.length || 0),
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
