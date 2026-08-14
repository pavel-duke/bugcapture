import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageJson = JSON.parse(await readFile(resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));
const expectedTag = `v${packageJson.version}`;
const actualTag = process.env.GITHUB_REF_NAME;

if (!actualTag) throw new Error('Переменная GITHUB_REF_NAME не задана.');
if (actualTag !== expectedTag) {
  throw new Error(`Тег ${actualTag} не совпадает с версией package.json (${expectedTag}).`);
}

console.log(`Тег ${actualTag} совпадает с версией проекта.`);
