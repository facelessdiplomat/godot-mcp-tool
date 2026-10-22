import * as z from 'zod/v4';

export const applyReportSchema = z.object({
  applied: z.array(z.string()),
  rejected: z.array(z.object({ name: z.string(), reason: z.string() })),
  not_applied: z.array(z.object({ name: z.string(), expected: z.unknown(), actual: z.unknown() })),
});

export type ApplyReport = z.infer<typeof applyReportSchema>;

const enumOptionSchema = z.object({ name: z.string(), value: z.number() });

const describedPropertySchema = z.object({
  name: z.string(),
  type: z.string(),
  value: z.unknown(),
  options: z.array(enumOptionSchema).optional(),
});

const unknownPropertySchema = z.object({ name: z.string(), error: z.string() });

export const propertyDescriptionsSchema = z.array(z.union([unknownPropertySchema, describedPropertySchema]));

export type PropertyDescriptions = z.infer<typeof propertyDescriptionsSchema>;

export const propertyListSchema = z.object({
  scene: z.string(),
  path: z.string(),
  type: z.string(),
  properties: propertyDescriptionsSchema,
});

export type PropertyList = z.infer<typeof propertyListSchema>;

type DescribedProperty = z.infer<typeof describedPropertySchema>;

const typesShownAsQuotedText = new Set(['String', 'StringName', 'NodePath', 'Variant']);

export function formatValue(value: unknown, type?: string): string {
  if (value === undefined) {
    return 'null';
  }
  if (typeof value === 'string' && type !== undefined && !typesShownAsQuotedText.has(type)) {
    return value;
  }
  return JSON.stringify(value);
}

export function formatNodePath(path: string): string {
  return path === '.' ? 'the scene root' : path;
}

export function isEmptyApplyReport(report: ApplyReport): boolean {
  return report.applied.length === 0 && report.rejected.length === 0 && report.not_applied.length === 0;
}

export function formatApplyReport(report: ApplyReport): string {
  const lines: string[] = [];
  if (report.applied.length > 0) {
    lines.push(`Applied: ${report.applied.join(', ')}`);
  }
  if (report.rejected.length > 0) {
    lines.push('Rejected:', ...report.rejected.map((rejection) => `- ${rejection.name}: ${rejection.reason}`));
  }
  if (report.not_applied.length > 0) {
    lines.push(
      'Not applied, the engine kept another value:',
      ...report.not_applied.map((mismatch) => `- ${mismatch.name}: wanted ${formatValue(mismatch.expected)}, got ${formatValue(mismatch.actual)}`),
    );
  }
  return lines.length > 0 ? lines.join('\n') : 'No properties were set.';
}

export function formatPropertyList(list: PropertyList): string {
  const header = `${capitalize(formatNodePath(list.path))} (${list.type}) in ${list.scene}`;
  return [header, ...formatPropertyLines(list.properties)].join('\n');
}

export function formatPropertyLines(properties: PropertyDescriptions): string[] {
  if (properties.length === 0) {
    return ['All properties have their default values. Pass include_defaults: true, or names, to list them anyway.'];
  }
  return properties.map((property) =>
    'error' in property ? `${property.name}: ${property.error}` : `${property.name} = ${describeValue(property)}  [${describeType(property)}]`,
  );
}

function describeValue(property: DescribedProperty): string {
  const valueText = formatValue(property.value, property.type);
  const optionName = property.options?.find((option) => option.value === property.value)?.name;
  return optionName === undefined ? valueText : `${valueText} (${optionName})`;
}

function describeType(property: DescribedProperty): string {
  if (property.options === undefined) {
    return property.type;
  }
  return `${property.type}: ${property.options.map((option) => option.name).join(', ')}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
