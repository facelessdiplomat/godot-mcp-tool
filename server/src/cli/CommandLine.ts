export type ProjectCommand = 'init' | 'install-addon' | 'update-addon' | 'doctor';

export type HookCommand = 'check-edited-script' | 'check-scene-edit';

export type CommandLineRequest =
  | { readonly kind: 'serve' }
  | { readonly kind: ProjectCommand; readonly projectPath: string | undefined }
  | { readonly kind: HookCommand }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'invalid'; readonly reason: string };

const projectCommands: readonly ProjectCommand[] = ['init', 'install-addon', 'update-addon', 'doctor'];
const hookCommands: readonly HookCommand[] = ['check-edited-script', 'check-scene-edit'];
const helpArguments = new Set(['--help', '-h', 'help']);
const versionArguments = new Set(['--version', '-v']);

export const usage = [
  'Usage: godot-mcp-tool [command] [project folder]',
  '',
  'Without a command, godot-mcp-tool runs the MCP server that connects Claude Code to the Godot editor.',
  '',
  'Commands:',
  '  init [folder]          Create a Godot project with the addon enabled in an empty or new folder',
  '  install-addon [folder]  Copy the addon into the Godot project and enable its plugin',
  '  update-addon [folder]   Replace the addon of the project with the version of this package',
  '  doctor [folder]         Check Node.js, Godot, the addon, the plugin and the connection to the editor',
  '  check-edited-script    Check the .gd or .gdshader file named in the Claude Code hook input on standard input;',
  '                         the hook of the Claude Code plugin runs it after Claude writes or edits a file',
  '  check-scene-edit       Deny the edit of the .tscn or .tres file named in the Claude Code hook input on standard',
  '                         input while the Godot editor has the project open; the hook of the Claude Code plugin',
  '                         runs it before Claude writes or edits a file',
  '',
  'The project folder is the folder with project.godot. By default it is GODOT_PROJECT_PATH, or the',
  'current folder or the nearest folder above it that has a project.godot, or else the one project in',
  'the folders up to three levels below it.',
  '',
  'Options:',
  '  --help, -h     Show this help',
  '  --version, -v  Show the version',
].join('\n');

export function parseCommandLine(commandLineArguments: readonly string[]): CommandLineRequest {
  const [first, ...rest] = commandLineArguments;
  if (first === undefined) {
    return { kind: 'serve' };
  }
  if (commandLineArguments.some((argument) => helpArguments.has(argument))) {
    return { kind: 'help' };
  }
  if (versionArguments.has(first)) {
    return { kind: 'version' };
  }
  const hookCommand = hookCommands.find((candidate) => candidate === first);
  if (hookCommand !== undefined) {
    return rest.length === 0 ? { kind: hookCommand } : { kind: 'invalid', reason: `${hookCommand} reads the hook input from standard input and takes no arguments.` };
  }
  const command = projectCommands.find((candidate) => candidate === first);
  if (command === undefined) {
    return { kind: 'invalid', reason: first.startsWith('-') ? `Unknown option "${first}".` : `Unknown command "${first}".` };
  }
  const option = rest.find((argument) => argument.startsWith('-'));
  if (option !== undefined) {
    return { kind: 'invalid', reason: `Unknown option "${option}".` };
  }
  if (rest.length > 1) {
    return { kind: 'invalid', reason: `${command} takes one project folder, but got: ${rest.join(' ')}.` };
  }
  return { kind: command, projectPath: rest[0] };
}
