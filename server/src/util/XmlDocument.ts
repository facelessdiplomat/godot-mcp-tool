export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

interface OpenElement {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: XmlElement[];
  text: string;
}

const tokenPattern = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
const attributePattern = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
const namedEntities: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function parseXml(source: string): XmlElement {
  const document: OpenElement = { name: '', attributes: {}, children: [], text: '' };
  const stack: OpenElement[] = [document];
  for (const token of source.matchAll(tokenPattern)) {
    const [, characterData, closingName, openingName, attributeText, selfClosing, text] = token;
    const current = stack.at(-1) ?? document;
    if (characterData !== undefined) {
      current.text += characterData;
    } else if (text !== undefined) {
      current.text += decodeEntities(text);
    } else if (openingName !== undefined) {
      const element: OpenElement = { name: openingName, attributes: readAttributes(attributeText ?? ''), children: [], text: '' };
      current.children.push(element);
      if (selfClosing !== '/') {
        stack.push(element);
      }
    } else if (closingName !== undefined) {
      if (stack.length < 2 || current.name !== closingName) {
        throw new Error(`Unexpected </${closingName}> while <${current.name}> is open`);
      }
      stack.pop();
    }
  }
  const [root] = document.children;
  if (root === undefined || stack.length !== 1) {
    throw new Error('The XML document is incomplete');
  }
  return root;
}

function readAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, value] of text.matchAll(attributePattern)) {
    if (name !== undefined) {
      attributes[name] = decodeEntities(value ?? '');
    }
  }
  return attributes;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (entity, body: string) => {
    if (body.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return namedEntities[body] ?? entity;
  });
}
