import { type ClassDoc, type ConstantDoc, type EnumDoc, type MethodDoc, type ParameterDoc, parameterOf } from './ClassDoc.js';
import { parseXml, type XmlElement } from './XmlDocument.js';

export function readProjectClassDoc(xml: string, scriptPath: string | undefined): ClassDoc | undefined {
  const root = parseXml(xml);
  const name = root.attributes['name'] ?? '';
  if (name === '' || name.startsWith('"')) {
    return undefined;
  }
  const constants: ConstantDoc[] = [];
  const enums = new Map<string, ConstantDoc[]>();
  for (const constant of itemsOf(root, 'constants', 'constant')) {
    const entry = { name: constant.attributes['name'] ?? '', value: constant.attributes['value'] ?? '', description: cleanText(constant.text) };
    const enumName = constant.attributes['enum'];
    if (enumName === undefined) {
      constants.push(entry);
    } else {
      enums.set(enumName, [...(enums.get(enumName) ?? []), entry]);
    }
  }
  const inherits = root.attributes['inherits'];
  return {
    name,
    ...(inherits === undefined ? {} : { inherits }),
    origin: 'project',
    ...(scriptPath === undefined ? {} : { scriptPath }),
    brief: cleanText(childNamed(root, 'brief_description')?.text ?? ''),
    description: cleanText(childNamed(root, 'description')?.text ?? ''),
    constructors: [],
    properties: itemsOf(root, 'members', 'member').map((member) => ({
      name: member.attributes['name'] ?? '',
      type: member.attributes['type'] ?? 'Variant',
      ...(member.attributes['default'] === undefined ? {} : { defaultValue: member.attributes['default'] }),
      ...(nonEmpty(member.attributes['setter']) === undefined ? {} : { setter: member.attributes['setter'] }),
      ...(nonEmpty(member.attributes['getter']) === undefined ? {} : { getter: member.attributes['getter'] }),
      description: cleanText(member.text),
    })),
    methods: itemsOf(root, 'methods', 'method').map(methodDoc),
    signals: itemsOf(root, 'signals', 'signal').map((signal) => ({
      name: signal.attributes['name'] ?? '',
      parameters: parametersOf(signal),
      description: descriptionOf(signal),
    })),
    constants,
    enums: [...enums].map(([enumName, values]): EnumDoc => ({ name: enumName, isBitfield: false, values })),
  };
}

function methodDoc(method: XmlElement): MethodDoc {
  const qualifiers = (method.attributes['qualifiers'] ?? '').split(' ').filter((qualifier) => qualifier !== '');
  return {
    name: method.attributes['name'] ?? '',
    returnType: childNamed(method, 'return')?.attributes['type'] ?? 'void',
    parameters: parametersOf(method),
    qualifiers,
    description: descriptionOf(method),
  };
}

function parametersOf(element: XmlElement): ParameterDoc[] {
  return element.children
    .filter((child) => child.name === 'param')
    .sort((left, right) => Number(left.attributes['index'] ?? 0) - Number(right.attributes['index'] ?? 0))
    .map((parameter) => parameterOf(parameter.attributes['name'] ?? '', parameter.attributes['type'] ?? 'Variant', parameter.attributes['default']));
}

function itemsOf(root: XmlElement, groupName: string, itemName: string): XmlElement[] {
  return childNamed(root, groupName)?.children.filter((child) => child.name === itemName) ?? [];
}

function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

function descriptionOf(element: XmlElement): string {
  return cleanText(childNamed(element, 'description')?.text ?? '');
}

function nonEmpty(text: string | undefined): string | undefined {
  return text === undefined || text === '' ? undefined : text;
}

function cleanText(text: string): string {
  const lines = text.split('\n');
  while (lines.length > 0 && lines[0]?.trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines.at(-1)?.trim() === '') {
    lines.pop();
  }
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^[\t ]*/.exec(line)?.[0].length ?? 0);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(common, line.length)).trimEnd()).join('\n');
}
