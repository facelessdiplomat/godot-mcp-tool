export interface ParameterDoc {
  readonly name: string;
  readonly type: string;
  readonly defaultValue?: string;
}

export interface MethodDoc {
  readonly name: string;
  readonly returnType: string;
  readonly parameters: readonly ParameterDoc[];
  readonly qualifiers: readonly string[];
  readonly description: string;
}

export interface PropertyDoc {
  readonly name: string;
  readonly type: string;
  readonly defaultValue?: string;
  readonly setter?: string;
  readonly getter?: string;
  readonly description: string;
}

export interface SignalDoc {
  readonly name: string;
  readonly parameters: readonly ParameterDoc[];
  readonly description: string;
}

export interface ConstantDoc {
  readonly name: string;
  readonly value: string;
  readonly description: string;
}

export interface EnumDoc {
  readonly name: string;
  readonly isBitfield: boolean;
  readonly values: readonly ConstantDoc[];
}

export type ClassOrigin = 'engine' | 'builtin' | 'project';

export interface ClassDoc {
  readonly name: string;
  readonly inherits?: string;
  readonly origin: ClassOrigin;
  readonly scriptPath?: string;
  readonly brief: string;
  readonly description: string;
  readonly constructors: readonly MethodDoc[];
  readonly properties: readonly PropertyDoc[];
  readonly methods: readonly MethodDoc[];
  readonly signals: readonly SignalDoc[];
  readonly constants: readonly ConstantDoc[];
  readonly enums: readonly EnumDoc[];
}

export const globalScopeName = '@GlobalScope';

export function readableType(apiType: string): string {
  const separator = apiType.indexOf('::');
  if (separator === -1) {
    return apiType;
  }
  const kind = apiType.slice(0, separator);
  const subject = apiType.slice(separator + 2);
  switch (kind) {
    case 'typedarray':
      return `Array[${subject}]`;
    case 'typeddictionary':
      return `Dictionary[${subject.split(';').join(', ')}]`;
    default:
      return subject;
  }
}

export function parameterOf(name: string, type: string, defaultValue: string | undefined): ParameterDoc {
  return defaultValue === undefined ? { name, type } : { name, type, defaultValue };
}
