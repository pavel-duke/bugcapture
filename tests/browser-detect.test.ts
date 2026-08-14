import { describe, expect, it } from 'vitest';
import { detectBrowser, detectOperatingSystem } from '../src/browser/detect';

describe('определение браузера', () => {
  it.each([
    ['Chrome/151.0.0.0 YaBrowser/26.6.4.760', 'Яндекс Браузер', '26.6.4.760'],
    ['Chrome/151.0.0.0 Edg/151.0.0.0', 'Microsoft Edge', '151.0.0.0'],
    ['Chrome/151.0.7922.110 Safari/537.36', 'Google Chrome', '151.0.7922.110'],
    ['Chromium/151.0.0.0', 'Chromium', '151.0.0.0'],
  ])('определяет %s', (userAgent, name, version) => {
    expect(detectBrowser(userAgent)).toEqual({ name, version });
  });

  it('определяет Windows', () => {
    expect(detectOperatingSystem('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows 10/11');
  });
});
