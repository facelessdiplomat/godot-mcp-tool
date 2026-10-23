import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectInstalledAddon } from '../addon/InstalledAddon.js';
import { isPluginEnabled } from '../addon/PluginActivation.js';
import type { EditorStatus, EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { BinaryLocator } from '../godot/GodotBinaryLocator.js';
import type { GodotVersion } from '../godot/GodotVersion.js';
import type { ProjectLookup } from '../project/ProjectLocator.js';
import { counted } from '../tools/formatting/counting.js';
import { describeError } from '../util/errors.js';
import type { CommandReport } from './CommandReport.js';

export interface DoctorDependencies {
  readonly nodeVersion: string;
  readonly packageVersion: string;
  readonly project: ProjectLookup;
  readonly editor: EditorStatusProvider;
  readonly binaryLocator: BinaryLocator;
  readonly readVersion: (executablePath: string) => Promise<GodotVersion>;
}

type CheckStatus = 'ok' | 'warning' | 'problem';

interface Check {
  readonly status: CheckStatus;
  readonly text: string;
}

const minimumNodeMajorVersion = 22;
const minimumGodotVersion = { major: 4, minor: 5 };
const statusColumnWidth = 9;

export class Doctor {
  constructor(private readonly dependencies: DoctorDependencies) {}

  async check(): Promise<CommandReport> {
    const { project } = this.dependencies;
    const checks: Check[] = [this.checkNode()];
    if (project.found) {
      const editorStatus = await this.dependencies.editor.status();
      checks.push(
        { status: 'ok', text: `Project ${project.root} (from ${project.source})` },
        await this.checkGodot(editorStatus),
        this.checkAddon(project.root),
        checkPlugin(project.root),
        this.checkEditor(editorStatus),
      );
    } else {
      checks.push({ status: 'problem', text: project.reason }, await this.checkGodot(undefined));
    }
    return reportOf(this.dependencies.packageVersion, checks);
  }

  private checkNode(): Check {
    const { nodeVersion } = this.dependencies;
    const majorVersion = Number.parseInt(nodeVersion.split('.')[0] ?? '', 10);
    return majorVersion >= minimumNodeMajorVersion
      ? { status: 'ok', text: `Node.js ${nodeVersion}` }
      : { status: 'problem', text: `Node.js ${nodeVersion} is too old: Godot MCP Tool needs Node.js ${String(minimumNodeMajorVersion)} or newer.` };
  }

  private async checkGodot(editorStatus: EditorStatus | undefined): Promise<Check> {
    const binary = this.dependencies.binaryLocator.locate(editorStatus?.connected === true ? editorStatus.hello.executablePath : undefined);
    if (!binary.found) {
      return { status: 'problem', text: binary.reason };
    }
    const location = `at ${binary.path} (from ${binary.source})`;
    let version: GodotVersion;
    try {
      version = await this.dependencies.readVersion(binary.path);
    } catch (error) {
      return { status: 'problem', text: `Godot ${location} did not tell its version: ${describeError(error)}` };
    }
    const minimum = `${String(minimumGodotVersion.major)}.${String(minimumGodotVersion.minor)}`;
    return version.isAtLeast(minimumGodotVersion.major, minimumGodotVersion.minor)
      ? { status: 'ok', text: `Godot ${version.toString()} ${location}` }
      : { status: 'warning', text: `Godot ${version.toString()} ${location} is older than ${minimum}, which the addon needs.` };
  }

  private checkAddon(projectRoot: string): Check {
    const { packageVersion } = this.dependencies;
    const addon = inspectInstalledAddon(projectRoot);
    switch (addon.kind) {
      case 'missing':
        return { status: 'problem', text: `Addon not installed in ${addon.path}. Install it with: npx godot-mcp-tool install-addon` };
      case 'broken':
        return { status: 'problem', text: `Addon in ${addon.path} is incomplete: ${addon.reason}. Replace it with: npx godot-mcp-tool update-addon` };
      case 'linked':
        return { status: 'ok', text: `Addon ${addon.version ?? 'without a version'} linked from ${addon.target}` };
      case 'installed':
        return addon.version === packageVersion
          ? { status: 'ok', text: `Addon ${addon.version} in ${addon.path}` }
          : {
              status: 'warning',
              text: `Addon ${addon.version} in ${addon.path} differs from this package (${packageVersion}). Update it with: npx godot-mcp-tool update-addon`,
            };
    }
  }

  private checkEditor(editorStatus: EditorStatus): Check {
    if (!editorStatus.connected) {
      return {
        status: 'warning',
        text: `Editor not connected. ${editorStatus.reason} Open the project in the Godot editor, or ask Claude to start it with editor_launch.`,
      };
    }
    const { hello } = editorStatus;
    const { packageVersion } = this.dependencies;
    return hello.addonVersion === packageVersion
      ? { status: 'ok', text: `Editor connected: Godot ${hello.godotVersion}, addon ${hello.addonVersion}` }
      : {
          status: 'warning',
          text: `Editor connected, but it runs the addon ${hello.addonVersion}, not ${packageVersion}. Restart the editor once the addon is updated.`,
        };
  }
}

function checkPlugin(projectRoot: string): Check {
  const projectFile = join(projectRoot, 'project.godot');
  return isPluginEnabled(readFileSync(projectFile, 'utf8'))
    ? { status: 'ok', text: `Plugin enabled in ${projectFile}` }
    : { status: 'problem', text: `Plugin not enabled in ${projectFile}. Enable "Godot MCP Tool" in Project → Project Settings → Plugins.` };
}

function reportOf(packageVersion: string, checks: readonly Check[]): CommandReport {
  const problems = checks.filter((check) => check.status === 'problem').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  const summary = problems === 0 && warnings === 0 ? 'Everything is set up.' : `${counted(problems, 'problem')}, ${counted(warnings, 'warning')}.`;
  return {
    succeeded: problems === 0,
    lines: [`Checking the setup of Godot MCP Tool ${packageVersion}:`, ...checks.map((check) => `${check.status.padEnd(statusColumnWidth)}${check.text}`), summary],
  };
}
