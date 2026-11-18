import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { type CreatedProject, ProjectCreationError, type ProjectRequest } from '../../src/project/ProjectCreator.js';
import { ProjectCreateTool } from '../../src/tools/ProjectCreateTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const capsuleWalk: CreatedProject = {
  root: '/work/capsule-walk',
  name: 'Capsule Walk',
  renderer: 'forward_plus',
  windowSize: [1152, 648],
  mainScene: 'res://main.tscn',
  addon: 'Installed the Godot MCP Tool addon 0.1.2 in /work/capsule-walk/addons/godot_mcp_tool.',
};

function creatorOf(outcome: CreatedProject | Error): { create: (request: ProjectRequest) => Promise<CreatedProject>; requests: ProjectRequest[] } {
  const requests: ProjectRequest[] = [];
  return {
    requests,
    create: (request) => {
      requests.push(request);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
  };
}

describe('project_create', () => {
  it('creates the project and takes it up when the server has none', async () => {
    const creator = creatorOf(capsuleWalk);
    const adopted: string[] = [];
    const tool = new ProjectCreateTool(creator, (root) => {
      adopted.push(root);
      return { adopted: true };
    });

    const result = await tool.execute({ path: 'capsule-walk', window_size: [1280, 720] });

    expect(creator.requests).toEqual([{ path: 'capsule-walk', name: undefined, renderer: 'forward_plus', windowSize: [1280, 720] }]);
    expect(adopted).toEqual(['/work/capsule-walk']);
    expect(textOf(result)).toBe(
      [
        'Created the Godot project "Capsule Walk" in /work/capsule-walk: project.godot (Forward+, Jolt Physics, window 1152×648), the main scene res://main.tscn with a camera and a light, .gitignore, .gitattributes and .editorconfig.',
        'Installed the Godot MCP Tool addon 0.1.2 in /work/capsule-walk/addons/godot_mcp_tool. Its plugin is enabled.',
        'The server now works on this project: start its editor with editor_launch.',
      ].join('\n'),
    );
  });

  it('says how to work on the new project when the server keeps another one', async () => {
    const tool = new ProjectCreateTool(creatorOf(capsuleWalk), () => ({ adopted: false, currentRoot: '/work/old-game' }));

    const result = await tool.execute({ path: 'capsule-walk' });

    expect(textOf(result).split('\n').at(-1)).toBe(
      'The server keeps working on /work/old-game; to work on the new project, start Claude Code in /work/capsule-walk or set GODOT_PROJECT_PATH to it.',
    );
  });

  it('explains a folder it cannot use', async () => {
    const tool = new ProjectCreateTool(creatorOf(new ProjectCreationError('/work has a Godot project already.')), () => ({ adopted: true }));

    const result = await tool.execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('/work has a Godot project already.');
  });
});
