export type ProjectCommand = 'install-addon' | 'update-addon' | 'doctor';

export type CommandLineRequest =
  | { readonly kind: 'serve' }
  | { readonly kind: ProjectCommand; readonly projectPath: string | undefined }
  | { readonly kind: 'check-edited-script' }
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'invalid'; readonly reason: string };

const projectCommands: readonly ProjectCommand[] = ['install-addon', 'update-addon', 'doctor'];
const hookCommand = 'check-edited-script';
const helpArguments = new Set(['--help', '-h', 'help']);
const versionArguments = new Set(['--version', '-v']);

export const usage = [
  'Usage: godot-mcp-tool [command] [project folder]',
  '',
  'Without a command, godot-mcp-tool runs the MCP server that connects Claude Code to the Godot editor.',
  '',
  'Commands:',
  '  install-addon [folder]  Copy the addon into the Godot project and enable its plugin',
  '  update-addon [folder]   Replace the addon of the project with the version of this package',
  '  doctor [folder]         Check Node.js, Godot, the addon, the plugin and the connection to the editor',
  '  check-edited-script    Check the .gd file named in the Claude Code hook input on standard input;',
  '                         the hook of the Claude Code plugin runs it after Claude writes or edits a file',
  '',
  'The project folder is the folder with project.godot. By default it is GODOT_PROJECT_PATH, or the',
  'current folder or the nearest folder above it that has a project.godot.',
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
  if (first === hookCommand) {
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
