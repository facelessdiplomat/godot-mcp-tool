import * as z from 'zod/v4';
import { type ClassDoc, type ConstantDoc, type EnumDoc, globalScopeName, type MethodDoc, parameterOf, type PropertyDoc, readableType } from './ClassDoc.js';

const argumentSchema = z.object({ name: z.string(), type: z.string(), default_value: z.string().optional() });

type ApiArgument = z.infer<typeof argumentSchema>;

const methodSchema = z.object({
  name: z.string(),
  is_const: z.boolean().optional(),
  is_static: z.boolean().optional(),
  is_virtual: z.boolean().optional(),
  is_vararg: z.boolean().optional(),
  return_value: z.object({ type: z.string() }).optional(),
  return_type: z.string().optional(),
  arguments: z.array(argumentSchema).optional(),
  description: z.string().optional(),
});

type ApiMethod = z.infer<typeof methodSchema>;

const valueSchema = z.object({ name: z.string(), value: z.union([z.number(), z.string()]), description: z.string().optional() });

type ApiValue = z.infer<typeof valueSchema>;

const enumSchema = z.object({ name: z.string(), is_bitfield: z.boolean().optional(), values: z.array(valueSchema) });

type ApiEnum = z.infer<typeof enumSchema>;

const propertySchema = z.object({ name: z.string(), type: z.string(), setter: z.string().optional(), getter: z.string().optional(), description: z.string().optional() });

type ApiProperty = z.infer<typeof propertySchema>;

const descriptions = { brief_description: z.string().optional(), description: z.string().optional() };

const classSchema = z.object({
  name: z.string(),
  inherits: z.string().optional(),
  methods: z.array(methodSchema).optional(),
  properties: z.array(propertySchema).optional(),
  signals: z.array(z.object({ name: z.string(), arguments: z.array(argumentSchema).optional(), description: z.string().optional() })).optional(),
  constants: z.array(valueSchema).optional(),
  enums: z.array(enumSchema).optional(),
  ...descriptions,
});

const builtinClassSchema = z.object({
  name: z.string(),
  members: z.array(propertySchema).optional(),
  constants: z.array(valueSchema).optional(),
  enums: z.array(enumSchema).optional(),
  methods: z.array(methodSchema).optional(),
  constructors: z.array(z.object({ arguments: z.array(argumentSchema).optional(), description: z.string().optional() })).optional(),
  ...descriptions,
});

const extensionApiSchema = z.object({
  classes: z.array(classSchema),
  builtin_classes: z.array(builtinClassSchema),
  utility_functions: z.array(methodSchema),
  global_enums: z.array(enumSchema),
  global_constants: z.array(valueSchema).optional(),
});

export function readEngineDocs(extensionApi: unknown): ClassDoc[] {
  const api = extensionApiSchema.parse(extensionApi);
  const classes = api.classes.map(
    (apiClass): ClassDoc => ({
      name: apiClass.name,
      ...(apiClass.inherits === undefined ? {} : { inherits: apiClass.inherits }),
      origin: 'engine',
      brief: apiClass.brief_description ?? '',
      description: apiClass.description ?? '',
      constructors: [],
      properties: (apiClass.properties ?? []).map((property) => propertyDoc(property, apiClass.methods ?? [])),
      methods: (apiClass.methods ?? []).map(methodDoc),
      signals: (apiClass.signals ?? []).map((signal) => ({ name: signal.name, parameters: parametersOf(signal.arguments), description: signal.description ?? '' })),
      constants: (apiClass.constants ?? []).map(constantDoc),
      enums: (apiClass.enums ?? []).map(enumDoc),
    }),
  );
  const builtinClasses = api.builtin_classes.map(
    (builtin): ClassDoc => ({
      name: builtin.name,
      origin: 'builtin',
      brief: builtin.brief_description ?? '',
      description: builtin.description ?? '',
      constructors: (builtin.constructors ?? []).map((constructor) => ({
        name: builtin.name,
        returnType: builtin.name,
        parameters: parametersOf(constructor.arguments),
        qualifiers: [],
        description: constructor.description ?? '',
      })),
      properties: (builtin.members ?? []).map((member) => ({ name: member.name, type: readableType(member.type), description: member.description ?? '' })),
      methods: (builtin.methods ?? []).map(methodDoc),
      signals: [],
      constants: (builtin.constants ?? []).map(constantDoc),
      enums: (builtin.enums ?? []).map(enumDoc),
    }),
  );
  const globalScope: ClassDoc = {
    name: globalScopeName,
    origin: 'engine',
    brief: 'Global functions, enums and constants that are available everywhere.',
    description: '',
    constructors: [],
    properties: [],
    methods: api.utility_functions.map(methodDoc),
    signals: [],
    constants: (api.global_constants ?? []).map(constantDoc),
    enums: api.global_enums.map(enumDoc),
  };
  return [...classes, ...builtinClasses, globalScope];
}

function propertyDoc(property: ApiProperty, methods: readonly ApiMethod[]): PropertyDoc {
  const setterValueType = methods.find((method) => method.name === property.setter)?.arguments?.at(-1)?.type;
  const isEnumSetter = setterValueType !== undefined && (setterValueType.startsWith('enum::') || setterValueType.startsWith('bitfield::'));
  return {
    name: property.name,
    type: readableType(isEnumSetter ? setterValueType : property.type),
    ...(property.setter === undefined || property.setter === '' ? {} : { setter: property.setter }),
    ...(property.getter === undefined || property.getter === '' ? {} : { getter: property.getter }),
    description: property.description ?? '',
  };
}

function methodDoc(method: ApiMethod): MethodDoc {
  const qualifiers = [
    method.is_static === true ? 'static' : undefined,
    method.is_const === true ? 'const' : undefined,
    method.is_virtual === true ? 'virtual' : undefined,
    method.is_vararg === true ? 'vararg' : undefined,
  ].filter((qualifier) => qualifier !== undefined);
  return {
    name: method.name,
    returnType: readableType(method.return_value?.type ?? method.return_type ?? 'void'),
    parameters: parametersOf(method.arguments),
    qualifiers,
    description: method.description ?? '',
  };
}

function parametersOf(apiArguments: readonly ApiArgument[] | undefined): MethodDoc['parameters'] {
  return (apiArguments ?? []).map((argument) => parameterOf(argument.name, readableType(argument.type), argument.default_value));
}

function constantDoc(value: ApiValue): ConstantDoc {
  return { name: value.name, value: String(value.value), description: value.description ?? '' };
}

function enumDoc(apiEnum: ApiEnum): EnumDoc {
  return { name: apiEnum.name, isBitfield: apiEnum.is_bitfield === true, values: apiEnum.values.map(constantDoc) };
}
