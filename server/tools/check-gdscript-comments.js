import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findGdscriptComments } from './gdscriptComments.js';

function listGdscriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const entryPath = join(directory, entry);
    const entryStats = lstatSync(entryPath);
    if (entryStats.isDirectory()) {
      files.push(...listGdscriptFiles(entryPath));
    } else if (entryStats.isFile() && entry.endsWith('.gd')) {
      files.push(entryPath);
    }
  }
  return files;
}

const directories = process.argv.slice(2);
const violations = directories.flatMap((directory) =>
  listGdscriptFiles(directory).flatMap((file) =>
    findGdscriptComments(readFileSync(file, 'utf8')).map((comment) => `${file}:${String(comment.line)}:${String(comment.column)}`),
  ),
);

if (violations.length > 0) {
  console.error('Comments are not allowed in GDScript. Make the code self-explanatory with clear names instead:');
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  process.exit(1);
}

console.log(`No comments found in GDScript files under: ${directories.join(', ')}`);
