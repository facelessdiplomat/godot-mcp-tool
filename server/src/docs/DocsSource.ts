import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import { GodotCli } from '../godot/GodotCli.js';
import type { ProcessResult, ProcessRunner } from '../process/ProcessRunner.js';
import { describeError } from '../util/errors.js';
import type { ClassDoc } from './ClassDoc.js';
import { DocsLibrary } from './DocsLibrary.js';
import { readEngineDocs } from './EngineApiDocs.js';
import { readProjectClassDoc } from './ProjectClassDocs.js';

export interface DocsSourceDependencies {
  readonly projectRoot: string | undefined;
  readonly cacheDirectory: string;
  readonly locateBinary: () => Promise<BinaryLookup>;
  readonly processRunner: ProcessRunner;
}

export class DocsUnavailableError extends Error {
  override readonly name = 'DocsUnavailableError';
}

interface ProjectScript {
  readonly resourcePath: string;
  readonly absolutePath: string;
  readonly modifiedMs: number;
}

const dumpFileName = 'extension_api.json';
const projectDocsFolder = join('.godot', 'godot_mcp_tool', 'class_docs');
const signatureFileName = 'signature';
const dumpTimeoutMs = 120_000;
const projectDocsTimeoutMs = 120_000;
const scriptExtension = '.gd';
const classNamePattern = /^\s*class_name\s+([A-Za-z_][A-Za-z0-9_]*)/m;

export class DocsSource {
  private readonly versions = new Map<string, string>();
  private engine: { readonly version: string; readonly classes: readonly ClassDoc[] } | undefined;
  private project: { readonly signature: string; readonly classes: readonly ClassDoc[] } | undefined;
  private library: { readonly version: string; readonly signature: string; readonly library: DocsLibrary } | undefined;
  private loading: Promise<DocsLibrary> | undefined;

  constructor(private readonly dependencies: DocsSourceDependencies) {}

  load(): Promise<DocsLibrary> {
    this.loading ??= this.loadCurrent().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async loadCurrent(): Promise<DocsLibrary> {
    const binary = await this.dependencies.locateBinary();
    if (!binary.found) {
      throw new DocsUnavailableError(`The docs come from the Godot executable of the project, and none was found: ${binary.reason}`);
    }
    const version = await this.versionOf(binary.path);
    const engineClasses = await this.engineClasses(binary.path, version);
    const scripts = this.dependencies.projectRoot === undefined ? [] : projectScripts(this.dependencies.projectRoot);
    const signature = signatureOf(scripts);
    const projectClasses = await this.projectClasses(binary.path, scripts, signature);
    if (this.library?.version !== version || this.library.signature !== signature) {
      this.library = { version, signature, library: new DocsLibrary([...engineClasses, ...projectClasses]) };
    }
    return this.library.library;
  }

  private async versionOf(binaryPath: string): Promise<string> {
    const known = this.versions.get(binaryPath);
    if (known !== undefined) {
      return known;
    }
    let version: string;
    try {
      version = (await new GodotCli(this.dependencies.processRunner, binaryPath).version()).toString();
    } catch (error) {
      throw new DocsUnavailableError(`Could not read the version of ${binaryPath}: ${describeError(error)}`);
    }
    this.versions.set(binaryPath, version);
    return version;
  }

  private async engineClasses(binaryPath: string, version: string): Promise<readonly ClassDoc[]> {
    if (this.engine?.version === version) {
      return this.engine.classes;
    }
    const folder = join(this.dependencies.cacheDirectory, 'docs', version.replace(/[^\w.-]/g, '_'));
    const dumpPath = join(folder, dumpFileName);
    let classes = existsSync(dumpPath) ? readCachedEngineDocs(dumpPath) : undefined;
    if (classes === undefined) {
      mkdirSync(folder, { recursive: true });
      rmSync(dumpPath, { force: true });
      const result = await this.dependencies.processRunner.run(binaryPath, ['--headless', '--dump-extension-api-with-docs'], { timeoutMs: dumpTimeoutMs, cwd: folder });
      classes = existsSync(dumpPath) ? readCachedEngineDocs(dumpPath) : undefined;
      if (classes === undefined) {
        throw new DocsUnavailableError(`${binaryPath} did not write the engine API with its docs: ${lastOutputLines(result)}`);
      }
    }
    this.engine = { version, classes };
    return classes;
  }

  private async projectClasses(binaryPath: string, scripts: readonly ProjectScript[], signature: string): Promise<readonly ClassDoc[]> {
    const projectRoot = this.dependencies.projectRoot;
    if (projectRoot === undefined || scripts.length === 0) {
      return [];
    }
    if (this.project?.signature === signature) {
      return this.project.classes;
    }
    const folder = join(projectRoot, projectDocsFolder);
    const signaturePath = join(folder, signatureFileName);
    if (!existsSync(signaturePath) || readFileSync(signaturePath, 'utf8') !== signature) {
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(folder, { recursive: true });
      await this.dependencies.processRunner
        .run(binaryPath, ['--headless', '--path', projectRoot, '--doctool', folder, '--gdscript-docs', 'res://'], { timeoutMs: projectDocsTimeoutMs })
        .catch(() => undefined);
      writeFileSync(signaturePath, signature);
    }
    const scriptsByClass = classScripts(scripts);
    const classes = readdirSync(folder)
      .filter((fileName) => fileName.endsWith('.xml'))
      .flatMap((fileName) => {
        const className = fileName.slice(0, -'.xml'.length);
        const classDoc = readProjectDocFile(join(folder, fileName), scriptsByClass.get(className.split('.')[0] ?? className));
        return classDoc === undefined ? [] : [classDoc];
      });
    this.project = { signature, classes };
    return classes;
  }
}

function readCachedEngineDocs(dumpPath: string): ClassDoc[] | undefined {
  try {
    return readEngineDocs(JSON.parse(readFileSync(dumpPath, 'utf8')));
  } catch {
    return undefined;
  }
}

function readProjectDocFile(path: string, scriptPath: string | undefined): ClassDoc | undefined {
  try {
    return readProjectClassDoc(readFileSync(path, 'utf8'), scriptPath);
  } catch {
    return undefined;
  }
}

function projectScripts(projectRoot: string): ProjectScript[] {
  const scripts: ProjectScript[] = [];
  const visit = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const entryPath = join(folder, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(scriptExtension)) {
        scripts.push({ resourcePath: `res://${relative(projectRoot, entryPath).split(sep).join('/')}`, absolutePath: entryPath, modifiedMs: statSync(entryPath).mtimeMs });
      }
    }
  };
  visit(projectRoot);
  return scripts.sort((left, right) => left.resourcePath.localeCompare(right.resourcePath));
}

function signatureOf(scripts: readonly ProjectScript[]): string {
  const hash = createHash('sha1');
  for (const script of scripts) {
    hash.update(`${script.resourcePath}\n${String(script.modifiedMs)}\n`);
  }
  return hash.digest('hex');
}

function classScripts(scripts: readonly ProjectScript[]): Map<string, string> {
  const scriptsByClass = new Map<string, string>();
  for (const script of scripts) {
    const className = classNamePattern.exec(readFileSync(script.absolutePath, 'utf8'))?.[1];
    if (className !== undefined) {
      scriptsByClass.set(className, script.resourcePath);
    }
  }
  return scriptsByClass;
}

function lastOutputLines(result: ProcessResult): string {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  return output === '' ? `exit code ${String(result.exitCode)}` : output.split(/\r?\n/).slice(-5).join('\n');
}
