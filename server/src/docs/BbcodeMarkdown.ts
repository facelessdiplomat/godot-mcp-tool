const tagPattern = /\[(\/?)([A-Za-z_@][A-Za-z0-9_@.]*)(?:([ =])([^\]]*))?\]/g;
const referencePattern = /^[A-Za-z_@][A-Za-z0-9_@.]*$/;
const defaultSummaryLength = 120;
const defaultCodeLanguage = 'gdscript';

const emphasisMarks: Readonly<Record<string, string>> = { b: '**', i: '*', s: '~~' };
const layoutTags = new Set(['center', 'color', 'font', 'font_size', 'u', 'indent', 'ul', 'ol', 'li']);
const callableReferenceTags = new Set(['method', 'constructor']);
const plainReferenceTags = new Set(['member', 'signal', 'constant', 'enum', 'param', 'theme_item', 'annotation', 'operator']);
const rawContentTags = new Set(['code', 'kbd', 'codeblock', 'codeblocks', 'gdscript', 'csharp', 'img']);

interface Tag {
  readonly closing: boolean;
  readonly name: string;
  readonly separator: string | undefined;
  readonly argument: string | undefined;
  readonly source: string;
}

export function bbcodeToMarkdown(text: string): string {
  const pattern = new RegExp(tagPattern.source, 'g');
  const links: string[] = [];
  let output = '';
  let position = 0;
  for (;;) {
    pattern.lastIndex = position;
    const match = pattern.exec(text);
    if (match === null) {
      break;
    }
    output += text.slice(position, match.index);
    position = match.index + match[0].length;
    const tag: Tag = { closing: match[1] === '/', name: match[2] ?? '', separator: match[3], argument: match[4], source: match[0] };
    if (!tag.closing && holdsRawContent(tag)) {
      const closingTag = `[/${tag.name}]`;
      const end = text.indexOf(closingTag, position);
      const content = text.slice(position, end === -1 ? text.length : end);
      position = end === -1 ? text.length : end + closingTag.length;
      output += renderRawContent(tag, content);
      continue;
    }
    output += renderTag(tag, links);
  }
  output += text.slice(position);
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

export function summarize(markdown: string, limit: number = defaultSummaryLength): string {
  const firstLine = markdown.split('\n', 1)[0] ?? '';
  if (firstLine.startsWith('```')) {
    return '';
  }
  return shorten(firstSentence(firstLine), limit);
}

function renderTag(tag: Tag, links: string[]): string {
  if (tag.closing) {
    if (tag.name === 'url') {
      return `](${links.pop() ?? ''})`;
    }
    if (tag.name in emphasisMarks) {
      return emphasisMarks[tag.name] ?? '';
    }
    return layoutTags.has(tag.name) ? '' : tag.source;
  }
  if (tag.name === 'br') {
    return '\n';
  }
  if (tag.name === 'lb') {
    return '[';
  }
  if (tag.name === 'rb') {
    return ']';
  }
  if (tag.name in emphasisMarks) {
    return emphasisMarks[tag.name] ?? '';
  }
  if (layoutTags.has(tag.name)) {
    return '';
  }
  if (tag.name === 'url' && tag.separator === '=') {
    links.push(tag.argument ?? '');
    return '[';
  }
  if (tag.separator === ' ' && tag.argument !== undefined && callableReferenceTags.has(tag.name)) {
    return `\`${tag.argument}()\``;
  }
  if (tag.separator === ' ' && tag.argument !== undefined && plainReferenceTags.has(tag.name)) {
    return `\`${tag.argument}\``;
  }
  if (tag.separator === undefined && referencePattern.test(tag.name)) {
    return `\`${tag.name}\``;
  }
  return tag.source;
}

function holdsRawContent(tag: Tag): boolean {
  return rawContentTags.has(tag.name) || (tag.name === 'url' && tag.separator !== '=');
}

function renderRawContent(tag: Tag, content: string): string {
  switch (tag.name) {
    case 'code':
    case 'kbd':
      return `\`${content}\``;
    case 'url':
      return `<${content}>`;
    case 'codeblock':
      return fence(content, languageOf(tag) ?? defaultCodeLanguage);
    case 'codeblocks':
      return renderCodeExamples(content);
    case 'gdscript':
      return fence(content, defaultCodeLanguage);
    default:
      return '';
  }
}

function renderCodeExamples(content: string): string {
  const example = /\[gdscript[^\]]*\]([\s\S]*?)\[\/gdscript\]/.exec(content)?.[1];
  return example === undefined ? '' : fence(example, defaultCodeLanguage);
}

function languageOf(tag: Tag): string | undefined {
  return /(?:^|\s)lang=(\w+)/.exec(tag.argument ?? '')?.[1];
}

function fence(code: string, language: string): string {
  return `\`\`\`${language}\n${dedent(code.replace(/^\r?\n/, '').trimEnd())}\n\`\`\``;
}

function dedent(code: string): string {
  const lines = code.split('\n');
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^[\t ]*/.exec(line)?.[0].length ?? 0);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(common, line.length))).join('\n');
}

function firstSentence(line: string): string {
  let insideCode = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '`') {
      insideCode = !insideCode;
    } else if (character === '.' && !insideCode && (index + 1 === line.length || line[index + 1] === ' ')) {
      return line.slice(0, index + 1);
    }
  }
  return line;
}

function shorten(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  const cut = text.lastIndexOf(' ', limit);
  return `${text.slice(0, cut > 0 ? cut : limit).trimEnd()}…`;
}
