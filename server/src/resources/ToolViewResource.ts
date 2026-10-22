import type { Tool } from '../tools/Tool.js';
import type { ListedResource, McpResource, ResourceDefinition, ResourceVariables } from './McpResource.js';

export class ToolViewResource implements McpResource {
  constructor(
    readonly definition: ResourceDefinition,
    private readonly tool: Tool,
    private readonly inputFor: (variables: ResourceVariables) => Record<string, unknown>,
    readonly list?: () => readonly ListedResource[],
  ) {}

  async read(variables: ResourceVariables): Promise<string> {
    const result = await this.tool.execute(this.inputFor(variables));
    return result.content.flatMap((content) => (content.type === 'text' ? [content.text] : [])).join('\n');
  }
}
