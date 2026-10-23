import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/createApplication.js';
import { serverInstructions } from '../../src/server/serverInstructions.js';
import { registeredToolNames } from '../support/registeredToolNames.js';

describe('serverInstructions', () => {
  it('fits in what Claude Code loads at startup', () => {
    expect(serverInstructions.length).toBeLessThan(4096);
  });

  it('tells how to catch a short moment of the running game', () => {
    expect(serverInstructions).toContain('read it inside game_input with a read step, or pause the game with game_pause first');
    expect(serverInstructions).toContain('Calls sent in one message may run one after another, so a game_wait sent with a game_input does not watch it.');
  });

  it('sends file moves and renames through filesystem_move', () => {
    expect(serverInstructions).toContain('Move or rename project files with filesystem_move');
  });

  it('says which tools work without the editor', () => {
    expect(serverInstructions).toContain(
      'without it, the tools that read the project and its scenes, game_run and the other game_ tools, script_validate, test_run, export_project and the docs tools still work',
    );
  });

  it('points to breakpoints for finding bugs in game code', () => {
    expect(serverInstructions).toContain('debug_breakpoints');
  });

  it('names only tools that exist', async () => {
    const toolNames = await registeredToolNames();
    const mentionedTools = serverInstructions.match(/\b(?:godot|project|editor|scene|node|game|docs|signal|script|input|asset|filesystem|resource|test|debug)_[a-z_]+\b/g) ?? [];

    expect(mentionedTools.length).toBeGreaterThan(5);
    for (const toolName of mentionedTools) {
      expect(toolNames).toContain(toolName);
    }
  });

  it('passes the instructions to the client', async () => {
    const application = createApplication({ variables: {}, workingDirectory: '/nonexistent', platform: process.platform, homeDirectory: '/nonexistent' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await application.createMcpServer().connect(serverTransport);
    const client = new Client({ name: 'instructions-test', version: '1.0.0' });
    await client.connect(clientTransport);

    expect(client.getInstructions()).toBe(serverInstructions);

    await client.close();
    application.shutdown();
  });
});
