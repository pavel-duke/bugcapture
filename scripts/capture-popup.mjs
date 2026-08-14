import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const projectRoot = resolve(import.meta.dirname, '..');
const distDirectory = resolve(projectRoot, 'dist');
const screenshotDirectory = resolve(projectRoot, 'docs', 'screenshots');
const screenshotPath = resolve(screenshotDirectory, 'bugcapture-popup.png');
const networkScreenshotPath = resolve(screenshotDirectory, 'bugcapture-network.png');
const executablePath = findBrowser();

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const relativePath = pathname === '/' ? 'popup.html' : decodeURIComponent(pathname.slice(1));
    const filePath = resolve(distDirectory, relativePath);
    if (!filePath.startsWith(distDirectory)) throw new Error('Недопустимый путь.');
    const content = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader('Content-Type', mimeType(filePath));
    response.end(content);
  } catch {
    response.statusCode = 404;
    response.end('Not found');
  }
});

await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Не удалось запустить preview server.');

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 420, height: 610 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const readySummary = {
      status: 'idle',
      duration: 0,
      requestCount: 0,
      httpErrorCount: 0,
      consoleErrorCount: 0,
      consoleWarningCount: 0,
      currentTab: {
        id: 1,
        url: 'https://tracker.example.ru/issues/BC-142',
        title: 'BC-142 — Ошибка загрузки вложения',
        hostname: 'tracker.example.ru',
        windowId: 1,
      },
      browser: {
        name: 'Яндекс Браузер',
        version: '26.6.4.760',
        os: 'Windows 11',
        userAgent: 'YaBrowser/26.6.4.760',
      },
    };
    const network = [
      networkEvent('1', 'GET', 'https://tracker.example.ru/api/issues/BC-142', 200, 84),
      networkEvent('2', 'POST', 'https://tracker.example.ru/api/attachments', 500, 1482),
      networkEvent('3', 'GET', 'https://cdn.example.ru/upload/chunk', 0, 30000, 'net::ERR_TIMED_OUT'),
      networkEvent('4', 'GET', 'https://tracker.example.ru/api/profile', 304, 28),
    ];
    const completedSummary = {
      ...readySummary,
      status: 'completed',
      duration: 38_000,
      requestCount: network.length,
      httpErrorCount: 2,
      result: {
        metadata: {
          sessionId: 'screenshot-session',
          startTime: Date.now() - 38_000,
          endTime: Date.now(),
          duration: 38_000,
          pageUrl: readySummary.currentTab.url,
          pageTitle: readySummary.currentTab.title,
          browser: readySummary.browser,
          viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
          extensionVersion: '0.4.0',
        },
        network,
        console: [],
        timeline: [],
        redactionCount: 4,
        baseFilename: 'bugcapture-demo',
      },
    };
    const runtime = {
      sendMessage: async () => ({
        ok: true,
        data:
          window.sessionStorage.getItem('bugcapture-screenshot-state') === 'completed'
            ? completedSummary
            : readySummary,
      }),
    };
    if (window.chrome) {
      Object.defineProperty(window.chrome, 'runtime', { configurable: true, value: runtime });
    } else {
      Object.defineProperty(window, 'chrome', { configurable: true, value: { runtime } });
    }

    function networkEvent(requestId, method, url, status, duration, error = '') {
      const parsed = new URL(url);
      return {
        requestId,
        timestamp: Date.now() - 30_000 + Number(requestId) * 2_000,
        method,
        url,
        host: parsed.host,
        path: parsed.pathname,
        query: parsed.search.slice(1),
        status,
        statusText: status === 500 ? 'Internal Server Error' : status === 200 ? 'OK' : '',
        duration,
        requestHeaders: [{ name: 'accept', value: 'application/json' }],
        responseHeaders: [{ name: 'content-type', value: 'application/json' }],
        mimeType: 'application/json',
        resourceType: 'Fetch',
        requestSize: 128,
        responseSize: status ? 512 : 0,
        error,
        initiator: 'https://tracker.example.ru/app.js',
      };
    }
  });
  await page.goto(`http://127.0.0.1:${address.port}/popup.html`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Начать запись' }).waitFor();
  await mkdir(screenshotDirectory, { recursive: true });
  await page.locator('.app').screenshot({ path: screenshotPath });
  await page.evaluate(() => window.sessionStorage.setItem('bugcapture-screenshot-state', 'completed'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Посмотреть Network' }).click();
  await page.getByRole('heading', { name: 'Network' }).waitFor();
  await page.locator('.app').screenshot({ path: networkScreenshotPath });
  await context.close();
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
}

console.log(`Скриншот сохранён: ${screenshotPath}`);
console.log(`Скриншот Network Explorer сохранён: ${networkScreenshotPath}`);

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome/Edge не найден. Укажите путь в CHROME_PATH.');
  return found;
}

function mimeType(path) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
  };
  return types[extname(path)] ?? 'application/octet-stream';
}
