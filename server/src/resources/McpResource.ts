export type ResourceVariables = Readonly<Record<string, string>>;

export interface ResourceDefinition {
  readonly name: string;
  readonly uri: string;
  readonly title: string;
  readonly description: string;
}

export interface ListedResource {
  readonly uri: string;
  readonly name: string;
}

export interface McpResource {
  readonly definition: ResourceDefinition;
  read(variables: ResourceVariables): Promise<string>;
  readonly list?: (() => readonly ListedResource[]) | undefined;
}
