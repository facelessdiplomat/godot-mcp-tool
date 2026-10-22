import * as z from 'zod/v4';

const fileUserSchema = z.object({ path: z.string(), uses: z.array(z.string()) });

export const settingMentionSchema = z.object({ name: z.string(), value: z.string() });

export const codeMentionSchema = z.object({ path: z.string(), line: z.number().int(), text: z.string() });

export const fileUsagesShape = {
  used_by: z.array(fileUserSchema),
  settings: z.array(settingMentionSchema),
  code: z.array(codeMentionSchema),
};

type FileUser = z.infer<typeof fileUserSchema>;

type SettingMention = z.infer<typeof settingMentionSchema>;

type CodeMention = z.infer<typeof codeMentionSchema>;

export interface FileUsages {
  readonly used_by: readonly FileUser[];
  readonly settings: readonly SettingMention[];
  readonly code: readonly CodeMention[];
}

export function hasUses(usages: FileUsages): boolean {
  return usages.used_by.length > 0 || usages.settings.length > 0 || usages.code.length > 0;
}

export function describeUses(usages: FileUsages, onlyTarget?: string): string[] {
  return [
    ...(usages.used_by.length === 0 ? [] : ['Used by:', ...formatUsers(usages.used_by, onlyTarget)]),
    ...(usages.settings.length === 0 ? [] : [`Project settings: ${formatSettings(usages.settings)}`]),
    ...(usages.code.length === 0 ? [] : ['Named in code:', ...formatCodeMentions(usages.code)]),
  ];
}

export function formatUsers(users: readonly FileUser[], onlyTarget?: string): string[] {
  return users.map((user) => (user.uses.length === 1 && user.uses[0] === onlyTarget ? `- ${user.path}` : `- ${user.path}: ${user.uses.join(', ')}`));
}

export function formatSettings(settings: readonly SettingMention[]): string {
  return settings.map((setting) => `${setting.name} = ${setting.value}`).join('; ');
}

export function formatCodeMentions(code: readonly CodeMention[]): string[] {
  return code.map((mention) => `- ${mention.path}:${String(mention.line)}: ${mention.text}`);
}
