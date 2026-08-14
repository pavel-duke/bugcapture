import { createWriteStream } from 'node:fs';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZipArchive } from 'archiver';

const projectRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const releaseDirectory = resolve(projectRoot, 'release');
const archivePath = resolve(releaseDirectory, `BugCapture-v${packageJson.version}-chromium.zip`);
await mkdir(releaseDirectory, { recursive: true });
await rm(archivePath, { force: true });

await new Promise((resolvePromise, rejectPromise) => {
  const output = createWriteStream(archivePath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolvePromise);
  output.on('error', rejectPromise);
  archive.on('error', rejectPromise);
  archive.pipe(output);
  archive.directory(resolve(projectRoot, 'dist'), false);
  void archive.finalize();
});

console.log(`Готовый архив: ${archivePath}`);
