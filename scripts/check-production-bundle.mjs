import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const distDirectory = resolve(projectRoot, 'dist');
const files = await listFiles(distDirectory);
const violations = [];

const prohibitedPatterns = [
  ['eval', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\b/],
  ['sendBeacon', /\bsendBeacon\s*\(/],
  ['WebSocket', /\bnew\s+WebSocket\s*\(/],
  ['EventSource', /\bnew\s+EventSource\s*\(/],
  ['XMLHttpRequest', /\bnew\s+XMLHttpRequest\b/],
  ['remote dynamic import', /\bimport\s*\(\s*['"]https?:\/\//],
  ['remote script', /<script[^>]+src\s*=\s*['"]https?:\/\//i],
  ['known tracker', /google-analytics|googletagmanager|segment\.com|mixpanel|amplitude|sentry\.io/i],
];

const allowedRemoteUrls = [
  'https://github.com/pavel-duke',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1998/Math/MathML',
  'https://react.dev/errors/',
];

for (const file of files) {
  const name = relative(distDirectory, file).replaceAll('\\', '/');
  if (name.endsWith('.map')) violations.push(`${name}: source map не должен попадать в production`);
  if (!['.js', '.html', '.css', '.json'].includes(extname(name))) continue;
  const content = await readFile(file, 'utf8');

  for (const [label, pattern] of prohibitedPatterns) {
    if (pattern.test(content)) violations.push(`${name}: найдена запрещённая конструкция ${label}`);
  }

  if (/\bfetch\s*\(/.test(content) && !name.startsWith('assets/modulepreload-polyfill-')) {
    violations.push(`${name}: найден неожиданный fetch`);
  }

  for (const match of (name === 'manifest.json' ? '' : content).matchAll(/https?:\/\/[^\s'"`<>)]+/g)) {
    const url = match[0].replace(/[.,;]+$/, '');
    if (!allowedRemoteUrls.some((allowed) => url.startsWith(allowed))) {
      violations.push(`${name}: неожиданный внешний URL ${url}`);
    }
  }
}

const manifest = JSON.parse(await readFile(resolve(distDirectory, 'manifest.json'), 'utf8'));
if (manifest.content_security_policy?.extension_pages !== "script-src 'self'; object-src 'self'") {
  violations.push('manifest.json: ослаблена Content Security Policy');
}
if (manifest.content_scripts) violations.push('manifest.json: постоянные content scripts не должны быть включены');

if (violations.length) {
  throw new Error(`Production bundle не прошёл security check:\n- ${violations.join('\n- ')}`);
}

console.log(
  `Production bundle проверен: ${files.length} файлов, скрытый outbound traffic и запрещённый код не найдены.`,
);

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
