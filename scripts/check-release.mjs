import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const distDirectory = resolve(projectRoot, 'dist');
const archiveName = `BugCapture-v${packageJson.version}-chromium.zip`;
const archivePath = resolve(projectRoot, 'release', archiveName);
const checksumPath = `${archivePath}.sha256`;
const sbomPath = resolve(projectRoot, 'release', `BugCapture-v${packageJson.version}-sbom.cdx.json`);

const archive = await readFile(archivePath);
const actualDigest = createHash('sha256').update(archive).digest('hex');
const checksum = await readFile(checksumPath, 'utf8');
if (checksum.trim() !== `${actualDigest}  ${archiveName}`) throw new Error('SHA-256 не совпадает с production ZIP.');

const distFiles = (await listFiles(distDirectory))
  .map((path) => relative(distDirectory, path).replaceAll('\\', '/'))
  .sort();
const zipFiles = listZipEntries(archive)
  .filter((name) => !name.endsWith('/'))
  .sort();
if (JSON.stringify(distFiles) !== JSON.stringify(zipFiles))
  throw new Error('Содержимое ZIP отличается от каталога dist.');

const forbiddenNames =
  /(^|\/)(node_modules|tests?|docs?|\.git|\.env|coverage|src)(\/|$)|\.map$|\.(ts|tsx)$|(^|\/)package(?:-lock)?\.json$/i;
const forbidden = zipFiles.filter((name) => forbiddenNames.test(name) || /^[A-Za-z]:[\\/]/.test(name));
if (forbidden.length) throw new Error(`В ZIP найдены лишние файлы: ${forbidden.join(', ')}`);

for (const required of [
  'manifest.json',
  'popup.html',
  'offscreen.html',
  'assets/background.js',
  'assets/offscreen.js',
]) {
  if (!zipFiles.some((name) => name === required)) throw new Error(`В ZIP отсутствует ${required}.`);
}

const manifest = JSON.parse(await readFile(resolve(distDirectory, 'manifest.json'), 'utf8'));
const expectedPermissions = ['activeTab', 'debugger', 'downloads', 'offscreen', 'scripting', 'tabCapture'];
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(expectedPermissions.sort())) {
  throw new Error(`Неожиданные permissions в manifest: ${manifest.permissions.join(', ')}.`);
}
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(['http://*/*', 'https://*/*'])) {
  throw new Error('Неожиданные host_permissions в manifest.');
}
if (manifest.content_scripts) throw new Error('Постоянные content scripts не должны быть включены.');

const sbom = JSON.parse(await readFile(sbomPath, 'utf8'));
if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.6') throw new Error('SBOM имеет неверный формат.');
if (sbom.metadata?.component?.version !== packageJson.version)
  throw new Error('Версия SBOM не совпадает с package.json.');
if (!Array.isArray(sbom.components) || !sbom.components.length) throw new Error('SBOM не содержит зависимости.');

console.log(`Release проверен: ${zipFiles.length} файлов, SHA-256 ${actualDigest}.`);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

function listZipEntries(buffer) {
  const names = [];
  let offset = 0;
  while (offset <= buffer.length - 46) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!names.length) throw new Error('ZIP не содержит central directory.');
  return names;
}
