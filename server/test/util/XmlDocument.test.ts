import { describe, expect, it } from 'vitest';
import { parseXml } from '../../src/util/XmlDocument.js';

describe('parseXml', () => {
  it('reads elements, attributes and text', () => {
    const root = parseXml(
      [
        '<?xml version="1.0" encoding="UTF-8" ?>',
        '<class name="Goblin" inherits="CharacterBody3D">',
        '\t<brief_description>',
        '\t\tA small enemy.',
        '\t</brief_description>',
        '\t<methods>',
        '\t\t<method name="chase">',
        '\t\t\t<return type="void" />',
        '\t\t\t<param index="0" name="target" type="Node3D" />',
        '\t\t</method>',
        '\t</methods>',
        '</class>',
      ].join('\n'),
    );

    expect(root.name).toBe('class');
    expect(root.attributes).toEqual({ name: 'Goblin', inherits: 'CharacterBody3D' });
    expect(root.children.map((child) => child.name)).toEqual(['brief_description', 'methods']);
    expect(root.children[0]?.text).toBe('\n\t\tA small enemy.\n\t');
    const method = root.children[1]?.children[0];
    expect(method?.children.map((child) => [child.name, child.attributes['type']])).toEqual([
      ['return', 'void'],
      ['param', 'Node3D'],
    ]);
  });

  it('decodes entities in text and attributes', () => {
    const root = parseXml('<member name="&quot;quoted&quot;" default="&lt;1&gt;">a &amp; b &apos;c&apos; &#65;&#x42;</member>');

    expect(root.attributes['name']).toBe('"quoted"');
    expect(root.attributes['default']).toBe('<1>');
    expect(root.text).toBe("a & b 'c' AB");
  });

  it('keeps the content of CDATA sections as it is', () => {
    const root = parseXml('<failure message="failed"><![CDATA[[<Node3D>] expected & got\n    at line 9]]></failure>');

    expect(root.text).toBe('[<Node3D>] expected & got\n    at line 9');
  });

  it('skips comments', () => {
    expect(parseXml('<a><!-- note --><b /></a>').children.map((child) => child.name)).toEqual(['b']);
  });

  it('reports a closing tag that does not match', () => {
    expect(() => parseXml('<a><b></a>')).toThrow('</a>');
  });
});
