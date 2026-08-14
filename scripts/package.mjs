import { createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZipArchive } from 'archiver';

const projectRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const releaseDirectory = resolve(projectRoot, 'release');
const archivePath = resolve(releaseDirectory, `BugCapture-v${packageJson.version}-chromium.zip`);
const checksumPath = `${archivePath}.sha256`;
const sbomPath = resolve(releaseDirectory, `BugCapture-v${packageJson.version}-sbom.cdx.json`);
await mkdir(releaseDirectory, { recursive: true });
await rm(archivePath, { force: true });
await rm(checksumPath, { force: true });
await rm(sbomPath, { force: true });

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

const archive = await readFile(archivePath);
const digest = createHash('sha256').update(archive).digest('hex');
await writeFile(checksumPath, `${digest}  ${archivePath.split(/[\\/]/).at(-1)}\n`);
await writeFile(sbomPath, `${JSON.stringify(await createSbom(), null, 2)}\n`);

console.log(`Готовый архив: ${archivePath}`);
console.log(`SHA-256: ${digest}`);
console.log(`SBOM: ${sbomPath}`);

async function createSbom() {
  const lock = JSON.parse(await readFile(resolve(projectRoot, 'package-lock.json'), 'utf8'));
  const components = Object.entries(lock.packages ?? {})
    .filter(([path, metadata]) => path && metadata && typeof metadata === 'object' && metadata.version)
    .map(([path, metadata]) => {
      const name = path
        .replace(/^node_modules\//, '')
        .split('/node_modules/')
        .at(-1);
      return {
        type: 'library',
        'bom-ref': `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`,
        name,
        version: metadata.version,
        scope: metadata.dev ? 'optional' : 'required',
        purl: `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        'bom-ref': `pkg:npm/bugcapture@${packageJson.version}`,
        name: 'bugcapture',
        version: packageJson.version,
        licenses: [{ license: { id: 'MIT' } }],
        purl: `pkg:npm/bugcapture@${packageJson.version}`,
      },
    },
    components,
  };
}
