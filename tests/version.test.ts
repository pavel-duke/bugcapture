import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUGCAPTURE_VERSION } from '../src/generated/version';

describe('версия', () => {
  it('берётся из package.json и синхронизируется с manifest.json', () => {
    const root = resolve(import.meta.dirname, '..');
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(resolve(root, 'public', 'manifest.json'), 'utf8'));

    expect(BUGCAPTURE_VERSION).toBe(packageJson.version);
    expect(manifest.version).toBe(packageJson.version);
  });
});
