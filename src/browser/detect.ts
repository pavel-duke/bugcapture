import type { BrowserInfo } from '../types';

const WINDOWS_VERSIONS: Record<string, string> = {
  '10.0': 'Windows 10/11',
  '6.3': 'Windows 8.1',
  '6.2': 'Windows 8',
  '6.1': 'Windows 7',
};

export function detectBrowser(userAgent: string): Pick<BrowserInfo, 'name' | 'version'> {
  const candidates: Array<[RegExp, string]> = [
    [/YaBrowser\/([\d.]+)/i, 'Яндекс Браузер'],
    [/EdgA?\/([\d.]+)/i, 'Microsoft Edge'],
    [/OPR\/([\d.]+)/i, 'Opera'],
    [/Chrome\/([\d.]+)/i, 'Google Chrome'],
    [/Chromium\/([\d.]+)/i, 'Chromium'],
  ];

  for (const [pattern, name] of candidates) {
    const match = userAgent.match(pattern);
    if (match?.[1]) return { name, version: match[1] };
  }

  return { name: 'Chromium-совместимый браузер', version: 'не определена' };
}

export function detectOperatingSystem(userAgent: string): string {
  const windows = userAgent.match(/Windows NT ([\d.]+)/i);
  if (windows?.[1]) return WINDOWS_VERSIONS[windows[1]] ?? `Windows NT ${windows[1]}`;
  const mac = userAgent.match(/Mac OS X ([\d_]+)/i);
  if (mac?.[1]) return `macOS ${mac[1].replaceAll('_', '.')}`;
  const android = userAgent.match(/Android ([\d.]+)/i);
  if (android?.[1]) return `Android ${android[1]}`;
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'не определена';
}
