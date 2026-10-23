import { readConfigSections } from '../project/ConfigText.js';

export const addonPluginPath = 'res://addons/godot_mcp_tool/plugin.cfg';

const pluginsSectionName = 'editor_plugins';
const enabledKey = 'enabled';
const sectionHeaderPattern = /^\[(?<name>[^\]]+)\]$/;
const quotedPathPattern = /"(?<path>(?:[^"\\]|\\.)*)"/g;

export function isPluginEnabled(projectText: string): boolean {
  return enabledPlugins(projectText).includes(addonPluginPath);
}

export function withPluginEnabled(projectText: string): string {
  const plugins = enabledPlugins(projectText);
  if (plugins.includes(addonPluginPath)) {
    return projectText;
  }
  const enabledLine = `${enabledKey}=PackedStringArray(${[...plugins, addonPluginPath].map((plugin) => `"${plugin}"`).join(', ')})`;
  const lines = projectText.split('\n');
  const sectionStart = lines.findIndex((line) => sectionNameOf(line) === pluginsSectionName);
  if (sectionStart === -1) {
    return withNewSection(lines, enabledLine).join('\n');
  }
  const sectionEnd = nextSectionStart(lines, sectionStart + 1);
  const enabledLineIndex = lines.findIndex((line, index) => index > sectionStart && index < sectionEnd && line.startsWith(`${enabledKey}=`));
  if (enabledLineIndex === -1) {
    lines.splice(sectionStart + 2, 0, enabledLine, '');
  } else {
    lines[enabledLineIndex] = enabledLine;
  }
  return lines.join('\n');
}

function enabledPlugins(projectText: string): string[] {
  const enabledValue = readConfigSections(projectText)
    .find((section) => section.name === pluginsSectionName)
    ?.values.get(enabledKey);
  return enabledValue === undefined ? [] : [...enabledValue.matchAll(quotedPathPattern)].map((match) => match.groups?.['path'] ?? '');
}

function withNewSection(lines: readonly string[], enabledLine: string): string[] {
  const section = [`[${pluginsSectionName}]`, '', enabledLine, ''];
  const followingSection = lines.findIndex((line) => {
    const name = sectionNameOf(line);
    return name !== undefined && name > pluginsSectionName;
  });
  if (followingSection !== -1) {
    return [...lines.slice(0, followingSection), ...section, ...lines.slice(followingSection)];
  }
  const content = lines.at(-1) === '' ? lines.slice(0, -1) : [...lines];
  return [...content, ...(content.at(-1) === '' ? [] : ['']), ...section];
}

function nextSectionStart(lines: readonly string[], from: number): number {
  const index = lines.findIndex((line, lineIndex) => lineIndex >= from && sectionNameOf(line) !== undefined);
  return index === -1 ? lines.length : index;
}

function sectionNameOf(line: string): string | undefined {
  return sectionHeaderPattern.exec(line.trim())?.groups?.['name'];
}
