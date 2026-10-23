import type { EditorSession } from '../bridge/EditorConnection.js';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import { LanguageServerClient } from '../lsp/LanguageServerClient.js';
import type { ProcessRunner } from '../process/ProcessRunner.js';
import { readAutoloadNames } from '../project/ProjectFile.js';
import { ScriptValidator, ValidationUnavailableError } from './ScriptValidator.js';

const checkOnlyTimeoutMs = 60_000;

export interface ScriptValidatorSetup {
  readonly projectRoot: string | undefined;
  readonly editor: EditorSession;
  readonly locateGodot: () => Promise<BinaryLookup>;
  readonly processRunner: ProcessRunner;
  readonly languageServerPort: number | undefined;
}

export function createScriptValidator({ projectRoot, editor, locateGodot, processRunner, languageServerPort }: ScriptValidatorSetup): ScriptValidator {
  return new ScriptValidator({
    projectRoot,
    editor,
    languageServerAddress: async () => {
      const address = await editor.languageServer();
      return address === undefined || languageServerPort === undefined ? address : { ...address, port: languageServerPort };
    },
    connectLanguageServer: (address) => LanguageServerClient.connect(address),
    runCheckOnly: async (resourcePath) => {
      const binary = await locateGodot();
      if (!binary.found || projectRoot === undefined) {
        throw new ValidationUnavailableError(
          `The Godot editor is not connected, and scripts cannot be checked without it: ${binary.found ? 'no Godot project was found.' : binary.reason}`,
        );
      }
      const result = await processRunner.run(binary.path, ['--headless', '--path', projectRoot, '--check-only', '--script', resourcePath], {
        timeoutMs: checkOnlyTimeoutMs,
      });
      return `${result.stdout}\n${result.stderr}`;
    },
    readAutoloadNames: () => (projectRoot === undefined ? [] : readAutoloadNames(projectRoot)),
  });
}
