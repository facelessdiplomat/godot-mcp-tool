import { describe, expect, it } from 'vitest';
import { readProjectClassDoc } from '../../src/docs/ProjectClassDocs.js';

const goblinXml = `<?xml version="1.0" encoding="UTF-8" ?>
<class name="Goblin" inherits="CharacterBody3D" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<brief_description>
		A small enemy that chases the player.
	</brief_description>
	<description>
		Goblins walk toward the nearest player.
		[codeblock]
		func _ready():
			chase(player)
		[/codeblock]
	</description>
	<tutorials>
	</tutorials>
	<methods>
		<method name="chase">
			<return type="void" />
			<param index="0" name="target" type="Node3D" />
			<param index="1" name="urgency" type="float" default="1.0" />
			<description>
				Makes the goblin chase [param target].
			</description>
		</method>
		<method name="count" qualifiers="static">
			<return type="int" />
			<description>
			</description>
		</method>
	</methods>
	<members>
		<member name="speed" type="float" setter="" getter="" default="3.5">
			How fast the goblin walks.
		</member>
	</members>
	<signals>
		<signal name="hit">
			<param index="0" name="damage" type="int" />
			<description>
				Emitted when the goblin hits the player.
			</description>
		</signal>
	</signals>
	<constants>
		<constant name="MAX_HEALTH" value="10">
		</constant>
		<constant name="IDLE" value="0" enum="State">
			Standing still.
		</constant>
		<constant name="CHASING" value="1" enum="State">
		</constant>
	</constants>
</class>
`;

describe('readProjectClassDoc', () => {
  it('reads a documented class of the project', () => {
    const goblin = readProjectClassDoc(goblinXml, 'res://enemies/goblin.gd');

    expect(goblin).toEqual({
      name: 'Goblin',
      inherits: 'CharacterBody3D',
      origin: 'project',
      scriptPath: 'res://enemies/goblin.gd',
      brief: 'A small enemy that chases the player.',
      description: 'Goblins walk toward the nearest player.\n[codeblock]\nfunc _ready():\n\tchase(player)\n[/codeblock]',
      constructors: [],
      properties: [{ name: 'speed', type: 'float', defaultValue: '3.5', description: 'How fast the goblin walks.' }],
      methods: [
        {
          name: 'chase',
          returnType: 'void',
          parameters: [
            { name: 'target', type: 'Node3D' },
            { name: 'urgency', type: 'float', defaultValue: '1.0' },
          ],
          qualifiers: [],
          description: 'Makes the goblin chase [param target].',
        },
        { name: 'count', returnType: 'int', parameters: [], qualifiers: ['static'], description: '' },
      ],
      signals: [{ name: 'hit', parameters: [{ name: 'damage', type: 'int' }], description: 'Emitted when the goblin hits the player.' }],
      constants: [{ name: 'MAX_HEALTH', value: '10', description: '' }],
      enums: [
        {
          name: 'State',
          isBitfield: false,
          values: [
            { name: 'IDLE', value: '0', description: 'Standing still.' },
            { name: 'CHASING', value: '1', description: '' },
          ],
        },
      ],
    });
  });

  it('leaves out scripts without a class name', () => {
    expect(readProjectClassDoc('<class name="&quot;helper.gd&quot;" inherits="Node"></class>', undefined)).toBeUndefined();
  });
});
