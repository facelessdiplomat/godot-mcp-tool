import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { applyReportSchema, formatApplyReport, formatPropertyLines, isEmptyApplyReport, propertyDescriptionsSchema } from './formatting/propertyReports.js';
import { propertyValues } from './parameters.js';
import { errorResult, textResult } from './results.js';

const changedResourceSchema = applyReportSchema.extend({ path: z.string(), type: z.string() });

type ChangedResource = z.infer<typeof changedResourceSchema>;

const resourceDescriptionSchema = z.object({
  path: z.string(),
  type: z.string(),
  properties: propertyDescriptionsSchema,
  dependencies: z.array(z.string()),
});

type ResourceDescription = z.infer<typeof resourceDescriptionSchema>;

const resourcePath = z.string().min(1).describe('The resource file, as a res:// path such as "res://materials/ice.tres".');

const resourceCreateInput = z.object({
  path: z
    .string()
    .min(1)
    .describe('Where to save the new resource, as a res:// path ending in .tres, such as "res://materials/ice.tres". Missing folders are created; an existing file is never replaced.'),
  type: z
    .string()
    .min(1)
    .describe('The resource class: an engine class such as "StandardMaterial3D", "PhysicsMaterial", "Environment" or "Curve", or a class_name of the project that extends Resource.'),
  properties: propertyValues.optional(),
});

export function createResourceCreateTool(editor: EditorGateway): BridgeTool<typeof resourceCreateInput, ChangedResource> {
  return new BridgeTool(editor, {
    name: 'resource_create',
    definition: {
      title: 'Create resource',
      description:
        'Create a resource file (.tres) with its properties set at once and save it: a material, physics material, environment, curve, or a resource of a class of the project. Use it for resources that several nodes or scenes share and assign it to them by its res:// path; a resource that only one node uses can be created right in the node property with {"new": "Class", …} instead. The result reports which properties applied.',
      inputSchema: resourceCreateInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'resource.create',
    responseSchema: changedResourceSchema,
    present: (created) => {
      const summary = `Created ${created.path} (${created.type}).`;
      return textResult(isEmptyApplyReport(created) ? summary : `${summary}\n${formatApplyReport(created)}`);
    },
  });
}

const resourceGetInput = z.object({
  path: resourcePath,
  names: z
    .array(z.string())
    .optional()
    .describe('Properties to read, such as ["albedo_color", "roughness"]. Default: every property whose value differs from its default.'),
  include_defaults: z.boolean().default(false).describe('Without names, also list properties at their default values. The list gets long.'),
});

export function createResourceGetTool(editor: EditorGateway): BridgeTool<typeof resourceGetInput, ResourceDescription> {
  return new BridgeTool(editor, {
    name: 'resource_get',
    definition: {
      title: 'Read resource',
      description:
        'Read a resource file such as a material, physics material or environment: its type, the properties that differ from their defaults or the ones named, each with its type in Godot syntax, and the files it depends on. Scenes are read with scene_get_tree instead.',
      inputSchema: resourceGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'resource.get',
    responseSchema: resourceDescriptionSchema,
    present: (resource) => textResult(describeResource(resource)),
  });
}

function describeResource(resource: ResourceDescription): string {
  const lines = [`${resource.path} (${resource.type})`, ...formatPropertyLines(resource.properties)];
  if (resource.dependencies.length > 0) {
    lines.push(`Depends on: ${resource.dependencies.join(', ')}`);
  }
  return lines.join('\n');
}

const resourceSetPropertiesInput = z.object({
  path: resourcePath,
  properties: propertyValues,
});

export function createResourceSetPropertiesTool(editor: EditorGateway): BridgeTool<typeof resourceSetPropertiesInput, ChangedResource> {
  return new BridgeTool(editor, {
    name: 'resource_set_properties',
    definition: {
      title: 'Set resource properties',
      description:
        'Set several properties of a resource file such as a material or physics material as one Undo step and save the file, so the scenes that use it, the game and the tests see the change at once. Every value is read back: the result lists what applied, what was rejected and why, and what the engine changed. Imported files such as textures and models are changed through their import settings instead.',
      inputSchema: resourceSetPropertiesInput,
      annotations: changingAnnotations({ destructive: true, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'resource.set_properties',
    responseSchema: changedResourceSchema,
    present: (updated) => {
      const report = formatApplyReport(updated);
      if (updated.applied.length === 0) {
        return errorResult(`No property of ${updated.path} took the requested value.\n${report}`);
      }
      return textResult(`Updated ${updated.path} (${updated.type}) and saved it.\n${report}`);
    },
  });
}
