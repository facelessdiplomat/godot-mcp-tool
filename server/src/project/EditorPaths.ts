import { posix } from 'node:path';

const resourcePrefix = 'res://';
const fileScheme = 'file://';
const drivePattern = /^[A-Za-z]:/;
const driveInUriPathPattern = /^\/[A-Za-z]:/;

export function editorPathOf(projectPath: string, resourcePath: string): string {
  return posix.join(projectPath, resourcePath.slice(resourcePrefix.length));
}

export function resourcePathOfEditorPath(projectPath: string, editorPath: string): string | undefined {
  const projectFolder = `${canonicalEditorPath(projectPath)}/`;
  const path = canonicalEditorPath(editorPath);
  return path.startsWith(projectFolder) ? `${resourcePrefix}${path.slice(projectFolder.length)}` : undefined;
}

export function fileUriOf(editorPath: string): string {
  const uri = new URL(`${fileScheme}/`);
  uri.pathname = (editorPath.startsWith('/') ? editorPath : `/${editorPath}`).replaceAll('%', '%25').replaceAll('#', '%23').replaceAll('?', '%3F');
  return uri.href;
}

export function editorPathOfUri(uri: string): string {
  const path = decodeURIComponent(new URL(uri).pathname);
  return canonicalEditorPath(driveInUriPathPattern.test(path) ? path.slice(1) : path);
}

export function canonicalEditorPath(path: string): string {
  const withForwardSlashes = path.replaceAll('\\', '/');
  const normalized = withForwardSlashes.length > 1 ? posix.normalize(withForwardSlashes).replace(/\/$/, '') : withForwardSlashes;
  return drivePattern.test(normalized) ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : normalized;
}

export function isSameEditorPath(left: string, right: string): boolean {
  return canonicalEditorPath(left) === canonicalEditorPath(right);
}
