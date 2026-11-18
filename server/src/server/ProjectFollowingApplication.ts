import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type * as z from 'zod/v4';
import type { McpPrompt } from '../prompts/McpPrompt.js';
import type { ProjectLookup } from '../project/ProjectLocator.js';
import type { McpResource, ResourceVariables } from '../resources/McpResource.js';
import type { Adoption } from '../tools/ProjectCreateTool.js';
import type { Tool } from '../tools/Tool.js';
import { createMcpServer } from './createMcpServer.js';

export interface ApplicationParts {
  readonly project: ProjectLookup;
  readonly instructions: string;
  readonly tools: readonly Tool[];
  readonly resources: readonly McpResource[];
  readonly prompts: readonly McpPrompt[];
  shutdown(): void;
}

export type PartsBuilder = (createdProjectRoot: string | undefined, adopt: (root: string) => Adoption) => ApplicationParts;

export interface ServerIdentity {
  readonly name: string;
  readonly version: string;
}

export class ProjectFollowingApplication {
  private parts: ApplicationParts;
  private createdProjectRoot: string | undefined;

  constructor(
    private readonly build: PartsBuilder,
    private readonly identity: ServerIdentity,
    private readonly locate: () => ProjectLookup,
  ) {
    this.parts = build(undefined, this.adopt);
  }

  createMcpServer(): McpServer {
    const template = this.parts;
    return createMcpServer({
      ...this.identity,
      instructions: template.instructions,
      tools: template.tools.map((tool) => new FollowingTool(tool, () => this.current().tools.find((candidate) => candidate.name === tool.name) ?? tool)),
      resources: template.resources.map(
        (resource) => new FollowingResource(resource, () => this.current().resources.find((candidate) => candidate.definition.name === resource.definition.name) ?? resource),
      ),
      prompts: template.prompts.map((prompt) => new FollowingPrompt(prompt, () => this.current().prompts.find((candidate) => candidate.name === prompt.name) ?? prompt)),
    });
  }

  shutdown(): void {
    this.parts.shutdown();
  }

  private readonly adopt = (root: string): Adoption => {
    if (this.parts.project.found) {
      return { adopted: false, currentRoot: this.parts.project.root };
    }
    this.createdProjectRoot = root;
    return { adopted: true };
  };

  private current(): ApplicationParts {
    if (this.parts.project.found || (this.createdProjectRoot === undefined && !this.locate().found)) {
      return this.parts;
    }
    const next = this.build(this.createdProjectRoot, this.adopt);
    if (!next.project.found) {
      next.shutdown();
      return this.parts;
    }
    this.parts.shutdown();
    this.parts = next;
    return next;
  }
}

class FollowingTool implements Tool {
  readonly name: string;
  readonly definition: Tool['definition'];

  constructor(
    template: Tool,
    private readonly current: () => Tool,
  ) {
    this.name = template.name;
    this.definition = template.definition;
  }

  execute(input: z.input<z.ZodObject>): Promise<CallToolResult> {
    return this.current().execute(input);
  }
}

class FollowingResource implements McpResource {
  readonly definition: McpResource['definition'];
  readonly list: McpResource['list'];

  constructor(
    template: McpResource,
    private readonly current: () => McpResource,
  ) {
    this.definition = template.definition;
    this.list = template.list === undefined ? undefined : () => this.current().list?.() ?? [];
  }

  read(variables: ResourceVariables): Promise<string> {
    return this.current().read(variables);
  }
}

class FollowingPrompt implements McpPrompt {
  readonly name: string;
  readonly definition: McpPrompt['definition'];

  constructor(
    template: McpPrompt,
    private readonly current: () => McpPrompt,
  ) {
    this.name = template.name;
    this.definition = template.definition;
  }

  render(args: z.output<z.ZodObject>): Promise<string> {
    return this.current().render(args);
  }
}
