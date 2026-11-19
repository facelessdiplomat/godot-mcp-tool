import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packAssetStoreArchive } from './assetStoreArchive.js';

const serverDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const commit = process.argv[2] ?? 'HEAD';

console.log(packAssetStoreArchive({ repositoryRoot: join(serverDirectory, '..'), commit, outputDirectory: join(serverDirectory, 'asset-store') }));
