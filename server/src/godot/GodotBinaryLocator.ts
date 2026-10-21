import { posix, win32 } from 'node:path';

export type BinarySource = 'GODOT_BIN' | 'running editor' | 'PATH' | 'default location';

export type BinaryLookup =
  | { readonly found: true; readonly path: string; readonly source: BinarySource }
  | { readonly found: false; readonly reason: string };

export interface BinaryLocator {
  locate(runningEditorExecutable?: string): BinaryLookup;
}

export interface BinaryLocatorEnvironment {
  readonly variables: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly isExecutableFile: (path: string) => boolean;
}

export class GodotBinaryLocator implements BinaryLocator {
  constructor(private readonly environment: BinaryLocatorEnvironment) {}

  locate(runningEditorExecutable?: string): BinaryLookup {
    const configuredBinary = this.environment.variables['GODOT_BIN'];
    if (configuredBinary !== undefined && configuredBinary !== '') {
      return this.environment.isExecutableFile(configuredBinary)
        ? { found: true, path: configuredBinary, source: 'GODOT_BIN' }
        : { found: false, reason: `GODOT_BIN points to ${configuredBinary}, which is not an executable file.` };
    }

    if (runningEditorExecutable !== undefined && this.environment.isExecutableFile(runningEditorExecutable)) {
      return { found: true, path: runningEditorExecutable, source: 'running editor' };
    }

    const binaryOnPath = this.findOnPath();
    if (binaryOnPath !== undefined) {
      return { found: true, path: binaryOnPath, source: 'PATH' };
    }

    const binaryInDefaultLocation = this.defaultLocations().find((candidate) => this.environment.isExecutableFile(candidate));
    if (binaryInDefaultLocation !== undefined) {
      return { found: true, path: binaryInDefaultLocation, source: 'default location' };
    }

    return {
      found: false,
      reason: 'No Godot executable was found. Set GODOT_BIN to the path of the Godot executable, or open the project in the Godot editor.',
    };
  }

  private get isWindows(): boolean {
    return this.environment.platform === 'win32';
  }

  private findOnPath(): string | undefined {
    const searchPath = this.environment.variables['PATH'] ?? this.environment.variables['Path'] ?? '';
    const directories = searchPath.split(this.isWindows ? win32.delimiter : posix.delimiter).filter((directory) => directory !== '');
    const executableNames = this.isWindows ? ['godot.exe', 'godot4.exe'] : ['godot', 'godot4'];
    const platformPath = this.isWindows ? win32 : posix;
    for (const directory of directories) {
      for (const executableName of executableNames) {
        const candidate = platformPath.join(directory, executableName);
        if (this.environment.isExecutableFile(candidate)) {
          return candidate;
        }
      }
    }
    return undefined;
  }

  private defaultLocations(): string[] {
    const { platform, homeDirectory } = this.environment;
    if (platform === 'darwin') {
      return [
        '/Applications/Godot.app/Contents/MacOS/Godot',
        posix.join(homeDirectory, 'Applications', 'Godot.app', 'Contents', 'MacOS', 'Godot'),
      ];
    }
    if (platform === 'linux') {
      return ['/usr/local/bin/godot', '/usr/bin/godot', posix.join(homeDirectory, '.local', 'bin', 'godot')];
    }
    return [];
  }
}
