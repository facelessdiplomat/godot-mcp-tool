import { bbcodeToMarkdown, summarize } from '../../docs/BbcodeMarkdown.js';
import { type ClassDoc, type EnumDoc, globalScopeName, type MethodDoc, type ParameterDoc, type PropertyDoc, type SignalDoc } from '../../docs/ClassDoc.js';
import { type DocsLibrary, descriptionOf, type MemberEntry, type MemberMatch, propertyAccessors, type SearchHit } from '../../docs/DocsLibrary.js';

const memberSummaryLength = 110;
const enumValueSummaryLength = 200;
const maximumDescriptionLength = 2500;
const maximumOverviewLength = 24_000;
const shortSummaryLength = 60;
const enumValuesInOverview = 8;
const missingDescription = 'There is no description yet.';

interface OverviewLayout {
  readonly summaryLength: number;
  readonly entriesPerSection: number;
}

const overviewLayouts: readonly OverviewLayout[] = [
  { summaryLength: memberSummaryLength, entriesPerSection: Number.POSITIVE_INFINITY },
  { summaryLength: shortSummaryLength, entriesPerSection: Number.POSITIVE_INFINITY },
  { summaryLength: 0, entriesPerSection: Number.POSITIVE_INFINITY },
  { summaryLength: 0, entriesPerSection: 80 },
  { summaryLength: 0, entriesPerSection: 50 },
  { summaryLength: 0, entriesPerSection: 30 },
  { summaryLength: 0, entriesPerSection: 15 },
];

export function formatClassReference(library: DocsLibrary, classDoc: ClassDoc): string {
  let text = '';
  for (const layout of overviewLayouts) {
    text = renderOverview(library, classDoc, layout);
    if (text.length <= maximumOverviewLength) {
      break;
    }
  }
  return text;
}

function renderOverview(library: DocsLibrary, classDoc: ClassDoc, layout: OverviewLayout): string {
  const ancestors = library.ancestors(classDoc);
  const accessors = propertyAccessors(classDoc);
  const methods = classDoc.methods.filter((method) => !accessors.has(method.name));
  const lines = [`${classDoc.name} — ${kindOf(classDoc)}`];
  if (ancestors.length > 0) {
    lines.push(`Inherits: ${ancestors.map((ancestor) => ancestor.name).join(' < ')}`);
  }
  const brief = bbcodeToMarkdown(classDoc.brief);
  if (brief !== '') {
    lines.push(brief);
  }
  const description = shortened(bbcodeToMarkdown(classDoc.description));
  if (description !== '') {
    lines.push('', description);
  }
  const line = (signature: string, memberDescription: string): string =>
    layout.summaryLength > 0 ? memberLine(signature, memberDescription, layout.summaryLength) : `- ${signature}`;
  const sections = [
    section('Constructors', classDoc.constructors.map((constructor) => line(constructorSignature(constructor), constructor.description)), layout),
    section('Properties', classDoc.properties.map((property) => line(propertySignature(property), property.description)), layout),
    section(classDoc.name === globalScopeName ? 'Functions' : 'Methods', methods.map((method) => line(methodSignature(method), method.description)), layout),
    section('Signals', classDoc.signals.map((signal) => line(signalSignature(signal), signal.description)), layout),
    section('Enums', classDoc.enums.map((enumeration) => `- ${enumOverview(enumeration)}`), layout),
    section('Constants', classDoc.constants.map((constant) => line(`${constant.name} = ${constant.value}`, constant.description)), layout),
  ];
  const sectionLines = sections.flatMap((rendered) => rendered.lines);
  if (sectionLines.length > 0) {
    lines.push('', ...sectionLines);
  }
  lines.push('', closingNote(ancestors, methods.length < classDoc.methods.length));
  if (layout.summaryLength === 0) {
    lines.push('Members are listed without summaries because the class is large.');
  } else if (layout.summaryLength < memberSummaryLength) {
    lines.push('Member summaries are shortened because the class is large.');
  }
  if (sections.some((rendered) => rendered.isTruncated)) {
    lines.push(`Some members are not listed; find them with docs_search, such as "${classDoc.name} <word>".`);
  }
  return lines.join('\n');
}

export function formatMemberReference(requested: ClassDoc, match: MemberMatch): string {
  const { owner, entry } = match;
  const inheritance = owner === requested ? '' : `, inherited by ${requested.name}`;
  const lines = [`${owner.name}.${signatureOf(entry)}`, `${memberKindOf(owner, entry)} of ${ownerLabelOf(owner, entry)}${inheritance}.`, ''];
  if (entry.kind === 'enum') {
    lines.push(...entry.doc.values.map((value) => memberLine(`${value.name} = ${value.value}`, value.description, enumValueSummaryLength)));
  } else {
    const description = bbcodeToMarkdown(descriptionOf(entry));
    lines.push(description === '' ? missingDescription : description);
  }
  return lines.join('\n');
}

export function formatSearchHits(query: string, hits: readonly SearchHit[]): string {
  if (hits.length === 0) {
    return `Nothing in the reference matches "${query}". Try a shorter word, such as part of a class name.`;
  }
  const lines = hits.map((hit) =>
    hit.entry === undefined
      ? withSummary(`${hit.owner.name} (${searchKindOf(hit.owner)})`, hit.owner.brief)
      : withSummary(`${hit.owner.name}.${searchSignatureOf(hit.entry)}`, descriptionOf(hit.entry)),
  );
  return [`Results for "${query}":`, ...lines.map((line) => `- ${line}`), '', 'docs_class shows a class; pass member to read one entry in full.'].join('\n');
}

function closingNote(ancestors: readonly ClassDoc[], hidesAccessors: boolean): string {
  const unlisted = [
    hidesAccessors ? 'Setters and getters of properties' : undefined,
    ancestors.length === 0 ? undefined : `inherited members of ${listOf(ancestors.map((ancestor) => ancestor.name))}`,
  ].filter((part) => part !== undefined);
  if (unlisted.length === 0) {
    return 'docs_class with member shows one member in full.';
  }
  const subject = unlisted.join(' and ');
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} are not listed; docs_class with member shows any member in full.`;
}

function kindOf(classDoc: ClassDoc): string {
  if (classDoc.name === globalScopeName) {
    return 'global scope';
  }
  switch (classDoc.origin) {
    case 'builtin':
      return 'built-in type';
    case 'project':
      return classDoc.scriptPath === undefined ? 'class of this project' : `class of this project, ${classDoc.scriptPath}`;
    case 'engine':
      return 'engine class';
  }
}

function searchKindOf(classDoc: ClassDoc): string {
  if (classDoc.name === globalScopeName) {
    return 'global scope';
  }
  switch (classDoc.origin) {
    case 'builtin':
      return 'built-in type';
    case 'project':
      return 'class of this project';
    case 'engine':
      return 'class';
  }
}

function memberKindOf(owner: ClassDoc, entry: MemberEntry): string {
  switch (entry.kind) {
    case 'method':
      return owner.name === globalScopeName ? 'Function' : 'Method';
    case 'property':
      return 'Property';
    case 'signal':
      return 'Signal';
    case 'constant':
      return 'Constant';
    case 'enum':
      return 'Enum';
    case 'enum value':
      return 'Value of the enum';
  }
}

function ownerLabelOf(owner: ClassDoc, entry: MemberEntry): string {
  return entry.kind === 'enum value' ? `${owner.name}.${entry.enumName}` : owner.name;
}

function signatureOf(entry: MemberEntry): string {
  switch (entry.kind) {
    case 'method':
      return methodSignature(entry.doc);
    case 'property':
      return propertySignature(entry.doc);
    case 'signal':
      return signalSignature(entry.doc);
    case 'enum':
      return entry.doc.name;
    case 'constant':
    case 'enum value':
      return `${entry.doc.name} = ${entry.doc.value}`;
  }
}

function searchSignatureOf(entry: MemberEntry): string {
  switch (entry.kind) {
    case 'signal':
      return `${signalSignature(entry.doc)} (signal)`;
    case 'enum':
      return `${entry.doc.name} (enum)`;
    default:
      return signatureOf(entry);
  }
}

function methodSignature(method: MethodDoc): string {
  const qualifiers = method.qualifiers.length === 0 ? '' : ` ${method.qualifiers.join(' ')}`;
  return `${method.name}(${parametersText(method.parameters)})${qualifiers} -> ${method.returnType}`;
}

function constructorSignature(constructor: MethodDoc): string {
  return `${constructor.name}(${parametersText(constructor.parameters)})`;
}

function propertySignature(property: PropertyDoc): string {
  return property.defaultValue === undefined ? `${property.name}: ${property.type}` : `${property.name}: ${property.type} = ${property.defaultValue}`;
}

function signalSignature(signal: SignalDoc): string {
  return `${signal.name}(${parametersText(signal.parameters)})`;
}

function parametersText(parameters: readonly ParameterDoc[]): string {
  return parameters
    .map((parameter) => (parameter.defaultValue === undefined ? `${parameter.name}: ${parameter.type}` : `${parameter.name}: ${parameter.type} = ${parameter.defaultValue}`))
    .join(', ');
}

function enumOverview(enumeration: EnumDoc): string {
  const shown = enumeration.values.slice(0, enumValuesInOverview).map((value) => `${value.name} = ${value.value}`);
  const hidden = enumeration.values.length - shown.length;
  return `${enumeration.name}: ${shown.join(', ')}${hidden > 0 ? `, … ${String(hidden)} more` : ''}`;
}

function memberLine(signature: string, description: string, summaryLength: number = memberSummaryLength): string {
  return `- ${withSummary(signature, description, summaryLength)}`;
}

function withSummary(label: string, description: string, summaryLength: number = memberSummaryLength): string {
  const summary = summarize(bbcodeToMarkdown(description), summaryLength);
  return summary === '' ? label : `${label} — ${summary}`;
}

function section(title: string, entries: readonly string[], layout: OverviewLayout): { readonly lines: string[]; readonly isTruncated: boolean } {
  if (entries.length === 0) {
    return { lines: [], isTruncated: false };
  }
  const shown = entries.slice(0, layout.entriesPerSection);
  const hidden = entries.length - shown.length;
  return { lines: [`${title}:`, ...shown, ...(hidden > 0 ? [`- … ${String(hidden)} more ${title.toLowerCase()}`] : [])], isTruncated: hidden > 0 };
}

function shortened(markdown: string): string {
  if (markdown.length <= maximumDescriptionLength) {
    return markdown;
  }
  let cut = markdown.lastIndexOf('\n', maximumDescriptionLength);
  if (cut <= 0) {
    cut = maximumDescriptionLength;
  }
  const fencesBefore = markdown.slice(0, cut).split('```').length - 1;
  if (fencesBefore % 2 === 1) {
    cut = markdown.lastIndexOf('```', cut);
  }
  return `${markdown.slice(0, cut).trimEnd()}\n…`;
}

function listOf(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}
