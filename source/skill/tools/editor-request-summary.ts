export function generateResultSummary(result: any, channel: string, command: string): unknown {
  if (channel === "scene" && command === "query-node-tree") {
    const countNodes = (node: any): number => {
      let count = 1;
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          count += countNodes(child);
        }
      }
      return count;
    };

    let totalNodes = 0;
    const rootNames: string[] = [];
    const nodes = Array.isArray(result) ? result : result?.children || [];
    for (const root of nodes) {
      totalNodes += countNodes(root);
      rootNames.push(root.name);
    }

    return {
      type: "node-tree-summary",
      totalNodes,
      rootNodes: rootNames.slice(0, 10),
      hint: "使用 maxDepth 和 maxNodes 参数限制返回数据量",
    };
  }

  if (channel === "scene" && command === "query-node") {
    return {
      type: "node-summary",
      uuid: result?.uuid,
      name: result?.name?.value || result?.name,
      componentCount: result?.__comps__?.length || 0,
      childCount: result?.__children__?.length || result?.children?.length || 0,
      hint: "节点详情已精简，需要完整数据请设置 summarize=false",
    };
  }

  const genericSummary: Record<string, unknown> = {
    type: "generic-summary",
  };
  if (Array.isArray(result)) {
    genericSummary.length = result.length;
    return genericSummary;
  }

  if (typeof result === "object" && result) {
    genericSummary.keys = Object.keys(result).slice(0, 20);
    return genericSummary;
  }

  return {
    ...genericSummary,
    valueType: result === null ? "null" : typeof result,
  };
}
