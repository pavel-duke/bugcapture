import { deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Версия ${version} должна иметь формат X.Y.Z`);
}

const publicDirectory = resolve(projectRoot, 'public');
const iconsDirectory = resolve(publicDirectory, 'icons');
const generatedDirectory = resolve(projectRoot, 'src', 'generated');
await mkdir(iconsDirectory, { recursive: true });
await mkdir(generatedDirectory, { recursive: true });

const manifest = {
  manifest_version: 3,
  name: 'BugCapture',
  short_name: 'BugCapture',
  version,
  description: 'Записывает проблему во вкладке и создаёт безопасный диагностический отчёт.',
  minimum_chrome_version: '116',
  permissions: [
    'activeTab',
    'debugger',
    'downloads',
    'offscreen',
    'scripting',
    'tabCapture',
  ],
  host_permissions: ['http://*/*', 'https://*/*'],
  background: {
    service_worker: 'assets/background.js',
    type: 'module',
  },
  action: {
    default_popup: 'popup.html',
    default_title: 'BugCapture',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
};

await writeFile(resolve(publicDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  resolve(generatedDirectory, 'version.ts'),
  `// Этот файл создаётся scripts/sync-version.mjs.\nexport const BUGCAPTURE_VERSION = '${version}';\n`,
);

for (const size of [16, 32, 48, 128]) {
  await writeFile(resolve(iconsDirectory, `icon-${size}.png`), createIcon(size));
}

console.log(`Версия ${version} синхронизирована с manifest.json и интерфейсом.`);

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (Math.floor(y) * size + Math.floor(x)) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3] ?? 255;
  };
  const circle = (cx, cy, radius, color) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) setPixel(x, y, color);
      }
    }
  };
  const line = (x1, y1, x2, y2, width, color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
    }
  };

  const center = size / 2;
  const background = [35, 38, 68, 255];
  const accent = [93, 226, 190, 255];
  const dark = [35, 38, 68, 255];
  circle(center, center, size * 0.47, background);
  circle(center, center + size * 0.04, size * 0.24, accent);
  circle(center, center - size * 0.18, size * 0.14, accent);
  line(center, center - size * 0.28, center - size * 0.12, center - size * 0.4, size * 0.045, accent);
  line(center, center - size * 0.28, center + size * 0.12, center - size * 0.4, size * 0.045, accent);
  for (const offset of [-0.14, 0, 0.14]) {
    line(center - size * 0.22, center + size * offset, center - size * 0.37, center + size * (offset - 0.04), size * 0.05, accent);
    line(center + size * 0.22, center + size * offset, center + size * 0.37, center + size * (offset - 0.04), size * 0.05, accent);
  }
  line(center, center - size * 0.07, center, center + size * 0.28, size * 0.035, dark);

  const scanline = size * 4 + 1;
  const raw = Buffer.alloc((scanline) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * scanline] = 0;
    pixels.copy(raw, y * scanline + 1, y * size * 4, (y + 1) * size * 4);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
