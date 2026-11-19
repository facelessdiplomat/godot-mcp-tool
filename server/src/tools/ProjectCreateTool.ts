import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { type CreatedProject, ProjectCreationError, type ProjectRequest } from '../project/ProjectCreator.js';
import type { Renderer } from '../project/ProjectTemplate.js';
import { changingAnnotations } from './annotations.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface ProjectMaker {
  create(request: ProjectRequest): Promise<CreatedProject>;
}

export type Adoption = { readonly adopted: true } | { readonly adopted: false; readonly currentRoot: string };

const rendererNames: Readonly<Record<Renderer, string>> = { forward_plus: 'Forward+', mobile: 'Mobile', gl_compatibility: 'Compatibility' };
const windowSide = z.number().int().min(64).max(7680);

const projectCreateInput = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The folder of the project, relative to the folder Claude Code runs in or absolute, such as "capsule-walk". It is created when missing and must be empty apart from hidden files and notes (.md). Default: the folder Claude Code runs in.',
    ),
  name: z.string().min(1).optional().describe('The name of the game. Default: the folder name in words, such as "Capsule Walk".'),
  renderer: z
    .enum(['forward_plus', 'mobile', 'gl_compatibility'])
    .default('forward_plus')
    .describe('forward_plus (default) for desktop 3D, mobile for phones and lighter 3D, gl_compatibility for the web and old hardware.'),
  window_size: z.tuple([windowSide, windowSide]).optional().describe('The window size [width, height] in pixels. Default: [1152, 648].'),
});

export class ProjectCreateTool implements Tool<typeof projectCreateInput> {
  readonly name = 'project_create';

  readonly definition: ToolDefinition<typeof projectCreateInput> = {
    title: 'Create project',
    description:
      'Create a new Godot 4 project for a game from scratch: project.godot with the name, the renderer, Jolt Physics, the window size and warnings for GDScript declarations without a static type, a main scene with a camera and a light, .gitignore, and the godot MCP addon installed with its plugin enabled. A server that started without a project works on the new one right away; start its editor with editor_launch.',
    inputSchema: projectCreateInput,
    annotations: changingAnnotations({ destructive: false, idempotent: false }),
    alwaysLoad: false,
  };

  constructor(
    private readonly maker: ProjectMaker,
    private readonly adopt: (root: string) => Adoption,
  ) {}

  async execute(input: z.input<typeof projectCreateInput>): Promise<CallToolResult> {
    const parsedInput = projectCreateInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    const { path, name, renderer, window_size: windowSize } = parsedInput.data;
    let created: CreatedProject;
    try {
      created = await this.maker.create({ path, name, renderer, windowSize });
    } catch (error) {
      if (error instanceof ProjectCreationError) {
        return errorResult(error.message);
      }
      throw error;
    }
    const adoption = this.adopt(created.root);
    const [width, height] = created.windowSize;
    return textResult(
      [
        `Created the Godot project "${created.name}" in ${created.root}: project.godot (${rendererNames[created.renderer]}, Jolt Physics, window ${String(width)}×${String(height)}, warnings for untyped GDScript), the main scene ${created.mainScene} with a camera and a light, .gitignore, .gitattributes and .editorconfig.`,
        `${created.addon} Its plugin is enabled.`,
        adoption.adopted
          ? 'The server now works on this project: start its editor with editor_launch.'
          : `The server keeps working on ${adoption.currentRoot}; to work on the new project, start Claude Code in ${created.root} or set GODOT_PROJECT_PATH to it.`,
      ].join('\n'),
    );
  }
}
