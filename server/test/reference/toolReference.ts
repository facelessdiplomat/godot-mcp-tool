export interface ListedTool {
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations?: { readonly readOnlyHint?: boolean | undefined } | undefined;
  readonly _meta?: Readonly<Record<string, unknown>> | undefined;
}

export interface ListedPromptArgument {
  readonly name: string;
  readonly description?: string | undefined;
  readonly required?: boolean | undefined;
}

export interface ListedPrompt {
  readonly name: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly arguments?: readonly ListedPromptArgument[] | undefined;
}

export interface ListedResource {
  readonly name: string;
  readonly title?: string | undefined;
  readonly uri: string;
  readonly description?: string | undefined;
}

export interface ListedResourceTemplate {
  readonly name: string;
  readonly title?: string | undefined;
  readonly uriTemplate: string;
  readonly description?: string | undefined;
}

export interface ServerListing {
  readonly tools: readonly ListedTool[];
  readonly prompts: readonly ListedPrompt[];
  readonly resources: readonly ListedResource[];
  readonly resourceTemplates: readonly ListedResourceTemplate[];
}

interface ToolArea {
  readonly title: string;
  readonly prefixes: readonly string[];
}

interface GroupedArea {
  readonly title: string;
  readonly tools: readonly ListedTool[];
}

type SchemaNode = Readonly<Record<string, unknown>>;

const toolAreas: readonly ToolArea[] = [
  { title: 'Connection and editor', prefixes: ['godot_', 'editor_'] },
  { title: 'Project', prefixes: ['project_', 'input_map_', 'autoload_'] },
  { title: 'Scenes and nodes', prefixes: ['scene_', 'node_', 'signal_'] },
  { title: 'Resources and files', prefixes: ['resource_', 'asset_', 'filesystem_'] },
  { title: 'Animation and navigation', prefixes: ['animation_', 'navigation_'] },
  { title: 'Scripts, tests and exports', prefixes: ['script_', 'test_', 'export_'] },
  { title: 'The running game', prefixes: ['game_'] },
  { title: 'Debugging', prefixes: ['debug_'] },
  { title: 'Engine reference', prefixes: ['docs_'] },
];
const otherToolsTitle = 'Other tools';
const alwaysLoadKey = 'anthropic/alwaysLoad';
const requiresUserInteractionKey = 'anthropic/requiresUserInteraction';
const nestedIndent = '  ';

const introduction = [
  'Every tool, prompt and resource of the Godot MCP Tool server, as Claude sees them. This page is generated from the',
  'code: after changing a tool, run `npm run docs:tools` in `server/`; a unit test fails while the page is out of date.',
  '',
  'The line under each tool says what kind of tool it is:',
  '',
  '- *Read-only*: it reads the project, the editor or the running game and changes nothing. Read-only mode',
  '  (`GODOT_MCP_READ_ONLY=1`) keeps only these tools.',
  '- *Makes changes*: it changes the project, the editor or the running game.',
  '- *Loaded at the start*: Claude has it from the first message; Claude Code loads the other tools when a task needs',
  '  them.',
  '- *Off by default*: one of the unsafe tools. They need `GODOT_MCP_UNSAFE=1` and Project → Tools → Godot MCP Tool →',
  '  Allow Unsafe Tools in the editor, and Claude Code asks before every call.',
];

export function renderToolReference(listing: ServerListing): string {
  const areas = groupedByArea(listing.tools);
  const resourceCount = listing.resources.length + listing.resourceTemplates.length;
  const lines = [
    '# Tool reference',
    '',
    ...introduction,
    '',
    '## Contents',
    '',
    ...areas.map((area) => `- [${area.title}](#${anchorOf(area.title)}): ${area.tools.map((tool) => `\`${tool.name}\``).join(', ')}`),
    ...(listing.prompts.length > 0 ? ['- [Prompts](#prompts)'] : []),
    ...(resourceCount > 0 ? ['- [Resources](#resources)'] : []),
    '',
    ...areas.flatMap(areaLines),
    ...promptLines(listing.prompts),
    ...resourceLines(listing.resources, listing.resourceTemplates),
  ];
  while (lines.at(-1) === '') {
    lines.pop();
  }
  return `${lines.join('\n')}\n`;
}

function groupedByArea(tools: readonly ListedTool[]): GroupedArea[] {
  const areaOf = (tool: ListedTool): string => toolAreas.find((area) => area.prefixes.some((prefix) => tool.name.startsWith(prefix)))?.title ?? otherToolsTitle;
  return [...toolAreas.map((area) => area.title), otherToolsTitle]
    .map((title) => ({ title, tools: tools.filter((tool) => areaOf(tool) === title) }))
    .filter((area) => area.tools.length > 0);
}

function anchorOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/ /g, '-');
}

function areaLines(area: GroupedArea): string[] {
  return [`## ${area.title}`, '', ...area.tools.flatMap(toolLines)];
}

function toolLines(tool: ListedTool): string[] {
  const parameters = propertyLines(tool.inputSchema, '');
  return [
    `### \`${tool.name}\``,
    '',
    titledText(tool.title, tool.description),
    '',
    `*${marksOf(tool).join(' · ')}*`,
    '',
    ...(parameters.length > 0 ? parameters : ['No parameters.']),
    '',
  ];
}

function titledText(title: string | undefined, description: string | undefined): string {
  return [title === undefined ? '' : `**${title}.**`, description ?? ''].filter((part) => part !== '').join(' ');
}

function marksOf(tool: ListedTool): string[] {
  const meta = tool._meta ?? {};
  return [
    tool.annotations?.readOnlyHint === true ? 'Read-only' : 'Makes changes',
    ...(meta[alwaysLoadKey] === true ? ['loaded at the start'] : []),
    ...(meta[requiresUserInteractionKey] === true ? ['off by default; Claude Code asks before every call'] : []),
  ];
}

function propertyLines(schema: SchemaNode, indent: string): string[] {
  const properties = recordAt(schema, 'properties');
  const required = new Set(arrayAt(schema, 'required').filter((name) => typeof name === 'string'));
  return Object.entries(properties).flatMap(([name, value]) => {
    const node = asNode(value);
    const label = `\`${name}\`${required.has(name) ? ' (required)' : ''}`;
    return [`${indent}- ${label}: ${describedLine(node)}`, ...nestedLines(node, indent + nestedIndent)];
  });
}

function describedLine(node: SchemaNode): string {
  const sentences = [typeText(node), textAt(node, 'description')].filter((part) => part !== '').map(asSentence);
  const continuation = continuationOf(node);
  return [...sentences, ...(continuation === '' ? [] : [continuation])].join(' ');
}

function continuationOf(node: SchemaNode): string {
  if (hasProperties(node)) {
    return 'It has:';
  }
  if (hasComplexVariants(node)) {
    return 'It is one of:';
  }
  const items = asNode(node['items']);
  if (typeAt(node) === 'array' && hasComplexVariants(items)) {
    return 'Each item is one of:';
  }
  if (typeAt(node) === 'array' && hasProperties(items)) {
    return 'Each item has:';
  }
  return '';
}

function nestedLines(node: SchemaNode, indent: string): string[] {
  if (hasProperties(node)) {
    return propertyLines(node, indent);
  }
  if (hasComplexVariants(node)) {
    return variantLines(node, indent);
  }
  const items = asNode(node['items']);
  if (typeAt(node) === 'array' && hasComplexVariants(items)) {
    return variantLines(items, indent);
  }
  if (typeAt(node) === 'array' && hasProperties(items)) {
    return propertyLines(items, indent);
  }
  return [];
}

function variantLines(node: SchemaNode, indent: string): string[] {
  return variantsOf(node).flatMap((variant) => {
    if (!hasProperties(variant)) {
      return [`${indent}- ${describedLine(variant)}`];
    }
    const description = textAt(variant, 'description');
    const opening = description === '' ? 'an object with:' : `${asSentence(description)} It has:`;
    return [`${indent}- ${opening}`, ...propertyLines(variant, indent + nestedIndent)];
  });
}

function typeText(node: SchemaNode): string {
  if (hasComplexVariants(node)) {
    return '';
  }
  const kind = kindText(node);
  const defaultValue = 'default' in node ? `, default \`${JSON.stringify(node['default'])}\`` : '';
  return `${kind}${defaultValue}`;
}

function kindText(node: SchemaNode): string {
  if ('const' in node) {
    return JSON.stringify(node['const']);
  }
  const choices = arrayAt(node, 'enum');
  if (choices.length > 0) {
    return listedChoices(choices);
  }
  const variants = variantsOf(node);
  if (variants.length > 0) {
    return listedAlternatives(variants.map(kindText));
  }
  const type = node['type'];
  if (Array.isArray(type)) {
    return listedAlternatives(type.map(String));
  }
  switch (type) {
    case 'integer':
    case 'number':
      return `${type}${rangeText(node)}`;
    case 'array':
      return listText(node);
    case 'object':
      return objectText(node);
    default:
      return typeof type === 'string' ? type : 'value';
  }
}

function objectText(node: SchemaNode): string {
  if (hasProperties(node) || !('additionalProperties' in node) || node['additionalProperties'] === false) {
    return 'object';
  }
  const values = asNode(node['additionalProperties']);
  return `object that maps names to ${typeof values['type'] === 'string' ? pluralOf(values['type']) : 'values'}`;
}

function listText(node: SchemaNode): string {
  const items = asNode(node['items']);
  const minimum = finiteNumberAt(node, 'minItems');
  const maximum = finiteNumberAt(node, 'maxItems');
  if (hasProperties(items) || hasComplexVariants(items)) {
    return `list of ${countedItems(minimum, maximum)}`;
  }
  const itemsText = arrayAt(items, 'enum').length > 0 ? kindText(items) : pluralOf(typeof items['type'] === 'string' ? items['type'] : 'value');
  if (minimum !== undefined && minimum === maximum) {
    return `list of ${String(minimum)} ${itemsText}`;
  }
  const count =
    minimum !== undefined && maximum !== undefined
      ? `, ${String(minimum)} to ${String(maximum)}`
      : minimum !== undefined
        ? `, at least ${String(minimum)}`
        : maximum !== undefined
          ? `, at most ${String(maximum)}`
          : '';
  return `list of ${itemsText}${count}`;
}

function countedItems(minimum: number | undefined, maximum: number | undefined): string {
  if (minimum !== undefined && maximum !== undefined) {
    return minimum === maximum ? `${String(minimum)} items` : `${String(minimum)} to ${String(maximum)} items`;
  }
  if (minimum !== undefined) {
    return `at least ${String(minimum)} ${minimum === 1 ? 'item' : 'items'}`;
  }
  return maximum === undefined ? 'items' : `at most ${String(maximum)} items`;
}

function rangeText(node: SchemaNode): string {
  const minimum = finiteNumberAt(node, 'minimum');
  const maximum = finiteNumberAt(node, 'maximum');
  const above = finiteNumberAt(node, 'exclusiveMinimum');
  if (minimum !== undefined && maximum !== undefined) {
    return ` from ${String(minimum)} to ${String(maximum)}`;
  }
  if (above !== undefined && maximum !== undefined) {
    return `, above ${String(above)} and at most ${String(maximum)}`;
  }
  if (minimum !== undefined) {
    return `, at least ${String(minimum)}`;
  }
  if (above !== undefined) {
    return `, above ${String(above)}`;
  }
  return maximum === undefined ? '' : `, at most ${String(maximum)}`;
}

function promptLines(prompts: readonly ListedPrompt[]): string[] {
  if (prompts.length === 0) {
    return [];
  }
  return [
    '## Prompts',
    '',
    'In Claude Code the prompts are slash commands; the [usage guide](usage.md#slash-commands) shows how to run them.',
    '',
    ...prompts.flatMap((prompt) => {
      const promptArguments = prompt.arguments ?? [];
      return [
        `### \`${prompt.name}\``,
        '',
        titledText(prompt.title, prompt.description),
        '',
        ...(promptArguments.length > 0
          ? promptArguments.map((argument) => `- \`${argument.name}\`${argument.required === true ? ' (required)' : ''}: ${argument.description ?? ''}`)
          : ['No arguments.']),
        '',
      ];
    }),
  ];
}

function resourceLines(resources: readonly ListedResource[], templates: readonly ListedResourceTemplate[]): string[] {
  if (resources.length + templates.length === 0) {
    return [];
  }
  return [
    '## Resources',
    '',
    ...resources.map((resource) => `- \`${resource.uri}\`: ${titledText(resource.title, resource.description)}`),
    ...templates.map((template) => `- \`${template.uriTemplate}\`: ${titledText(template.title, template.description)}`),
    '',
  ];
}

function variantsOf(node: SchemaNode): SchemaNode[] {
  return [...arrayAt(node, 'anyOf'), ...arrayAt(node, 'oneOf')].map(asNode);
}

function hasComplexVariants(node: SchemaNode): boolean {
  const variants = variantsOf(node);
  return variants.some((variant) => hasProperties(variant) || hasComplexVariants(variant));
}

function hasProperties(node: SchemaNode): boolean {
  return Object.keys(recordAt(node, 'properties')).length > 0;
}

function listedChoices(choices: readonly unknown[]): string {
  return listedAlternatives(choices.map((choice) => JSON.stringify(choice)));
}

function listedAlternatives(alternatives: readonly string[]): string {
  if (alternatives.length <= 1) {
    return alternatives.join('');
  }
  return `${alternatives.slice(0, -1).join(', ')} or ${alternatives.at(-1) ?? ''}`;
}

function pluralOf(typeName: string): string {
  return `${typeName}s`;
}

function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function typeAt(node: SchemaNode): unknown {
  return node['type'];
}

function textAt(node: SchemaNode, key: string): string {
  const value = node[key];
  return typeof value === 'string' ? value : '';
}

function finiteNumberAt(node: SchemaNode, key: string): number | undefined {
  const value = node[key];
  return typeof value === 'number' && Math.abs(value) < Number.MAX_SAFE_INTEGER ? value : undefined;
}

function arrayAt(node: SchemaNode, key: string): readonly unknown[] {
  const value = node[key];
  return Array.isArray(value) ? value : [];
}

function recordAt(node: SchemaNode, key: string): SchemaNode {
  return asNode(node[key]);
}

function asNode(value: unknown): SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as SchemaNode) : {};
}
