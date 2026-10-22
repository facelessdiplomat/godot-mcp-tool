import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { type ClassDoc, globalScopeName } from '../docs/ClassDoc.js';
import type { DocsLibrary } from '../docs/DocsLibrary.js';
import { DocsUnavailableError } from '../docs/DocsSource.js';
import { readingAnnotations } from './annotations.js';
import { formatClassReference, formatMemberReference, formatSearchHits } from './formatting/classReference.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface DocsProvider {
  load(): Promise<DocsLibrary>;
}

const docsClassInput = z.object({
  name: z
    .string()
    .min(1)
    .describe('A class such as "CharacterBody3D", a built-in type such as "Vector3", a class_name of the project, or "@GlobalScope"; "Class.member" works too.'),
  member: z
    .string()
    .min(1)
    .optional()
    .describe('One property, method, signal, constant or enum of the class to show in full, such as "move_and_slide". Inherited members are found too.'),
});

export class DocsClassTool implements Tool<typeof docsClassInput> {
  readonly name = 'docs_class';

  readonly definition: ToolDefinition<typeof docsClassInput> = {
    title: 'Class reference',
    description:
      'Read the reference of the installed Godot version for a class: what it inherits, its properties, methods with their signatures, signals, enums and constants, each with a short summary; with member, the full description of one of them. Covers engine classes, built-in types such as Vector3, @GlobalScope functions such as lerp, and the class_name classes of the project. Use it before writing code with an API you are unsure of.',
    inputSchema: docsClassInput,
    annotations: readingAnnotations,
    alwaysLoad: true,
  };

  constructor(private readonly provider: DocsProvider) {}

  async execute(input: z.input<typeof docsClassInput>): Promise<CallToolResult> {
    const parsedInput = docsClassInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    const library = await loadLibrary(this.provider);
    return library instanceof DocsUnavailableError ? errorResult(library.message) : describe(library, parsedInput.data.name, parsedInput.data.member);
  }
}

const docsSearchInput = z.object({
  query: z.string().min(1).describe('Words to look for in class and member names and their summaries, such as "raycast", "tween" or "look at".'),
  max_results: z.number().int().min(1).max(50).default(15).describe('The most results to list.'),
});

export class DocsSearchTool implements Tool<typeof docsSearchInput> {
  readonly name = 'docs_search';

  readonly definition: ToolDefinition<typeof docsSearchInput> = {
    title: 'Search the reference',
    description:
      "Search the reference of the installed Godot version and the project's own classes by words in class and member names and their summaries, such as \"raycast\", \"tween\" or \"look at\". Returns classes and members to read with docs_class.",
    inputSchema: docsSearchInput,
    annotations: readingAnnotations,
    alwaysLoad: false,
  };

  constructor(private readonly provider: DocsProvider) {}

  async execute(input: z.input<typeof docsSearchInput>): Promise<CallToolResult> {
    const parsedInput = docsSearchInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    const library = await loadLibrary(this.provider);
    if (library instanceof DocsUnavailableError) {
      return errorResult(library.message);
    }
    return textResult(formatSearchHits(parsedInput.data.query, library.search(parsedInput.data.query, parsedInput.data.max_results)));
  }
}

async function loadLibrary(provider: DocsProvider): Promise<DocsLibrary | DocsUnavailableError> {
  try {
    return await provider.load();
  } catch (error) {
    if (error instanceof DocsUnavailableError) {
      return error;
    }
    throw error;
  }
}

function describe(library: DocsLibrary, name: string, member: string | undefined): CallToolResult {
  const classDoc = library.find(name);
  if (classDoc !== undefined) {
    return member === undefined ? textResult(formatClassReference(library, classDoc)) : describeMember(library, classDoc, member);
  }
  const separator = name.lastIndexOf('.');
  if (separator > 0 && member === undefined) {
    const owner = library.find(name.slice(0, separator));
    if (owner !== undefined) {
      return describeMember(library, owner, name.slice(separator + 1));
    }
  }
  const globalScope = library.find(globalScopeName);
  const globalMember = member === undefined && globalScope !== undefined ? library.findMember(globalScope, name) : undefined;
  if (globalScope !== undefined && globalMember !== undefined) {
    return textResult(formatMemberReference(globalScope, globalMember));
  }
  const similar = library.similarNames(name);
  return errorResult(
    `No class named "${name}" in the reference. ${similar.length === 0 ? 'docs_search finds classes by words in their names.' : `Similar: ${similar.join(', ')}.`}`,
  );
}

function describeMember(library: DocsLibrary, classDoc: ClassDoc, member: string): CallToolResult {
  const match = library.findMember(classDoc, member);
  if (match !== undefined) {
    return textResult(formatMemberReference(classDoc, match));
  }
  const similar = library.similarMemberNames(classDoc, member);
  return errorResult(
    `${classDoc.name} has no member "${member}". ${similar.length === 0 ? `docs_class with name "${classDoc.name}" lists its members.` : `Similar: ${similar.join(', ')}.`}`,
  );
}
