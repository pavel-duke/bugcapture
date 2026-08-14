import type { CaptureResult, ConsoleEvent, NetworkEvent } from '../types';

const formatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function createTextReport(result: CaptureResult): string {
  const { metadata, network, console, timeline } = result;
  const counts = {
    success: network.filter((event) => event.status >= 200 && event.status < 300).length,
    redirect: network.filter((event) => event.status >= 300 && event.status < 400).length,
    clientError: network.filter((event) => event.status >= 400 && event.status < 500).length,
    serverError: network.filter((event) => event.status >= 500).length,
  };
  const networkErrors = network.filter((event) => event.status >= 400 || event.error);
  const lines = [
    'BugCapture Report',
    '=================',
    '',
    `Дата и начало: ${formatter.format(metadata.startTime)}`,
    `Конец: ${formatter.format(metadata.endTime)}`,
    `Длительность: ${formatDuration(metadata.duration)}`,
    '',
    `Страница: ${metadata.pageUrl}`,
    `Заголовок: ${metadata.pageTitle}`,
    `Браузер: ${metadata.browser.name}`,
    `Версия браузера: ${metadata.browser.version}`,
    `ОС: ${metadata.browser.os}`,
    `Viewport: ${metadata.viewport.width}×${metadata.viewport.height} @${metadata.viewport.devicePixelRatio}x`,
    `Версия BugCapture: ${metadata.extensionVersion}`,
    `Session ID: ${metadata.sessionId}`,
    '',
    'СВОДКА',
    '=================',
    '',
    `Network requests: ${network.length}`,
    `2xx: ${counts.success}`,
    `3xx: ${counts.redirect}`,
    `4xx: ${counts.clientError}`,
    `5xx: ${counts.serverError}`,
    '',
    `Console errors: ${countConsole(console, ['error', 'page-error', 'unhandled-rejection'])}`,
    `Console warnings: ${countConsole(console, ['warn'])}`,
    `Скрыто чувствительных значений: ${result.redactionCount}`,
    '',
    'NETWORK ERRORS',
    '=================',
    '',
    ...(networkErrors.length ? networkErrors.flatMap(formatNetworkEvent) : ['Ошибок не зафиксировано.', '']),
    'CONSOLE',
    '=================',
    '',
    ...(console.length ? console.flatMap(formatConsoleEvent) : ['Событий не зафиксировано.', '']),
    'TIMELINE',
    '=================',
    '',
    ...timeline.map((event) => `${formatOffset(event.timestamp - metadata.startTime)} ${event.text}`),
    '',
    'ПРИВАТНОСТЬ',
    '=================',
    '',
    'Тела запросов и ответов не собирались.',
    'Cookie storage, localStorage, sessionStorage и IndexedDB не читались.',
    'Чувствительные заголовки, параметры URL и известные форматы секретов очищены.',
    '',
  ];
  return lines.join('\n');
}

function formatNetworkEvent(event: NetworkEvent): string[] {
  const path = `${event.path}${event.query ? `?${event.query}` : ''}`;
  return [
    `[${formatTime(event.timestamp)}]`,
    `${event.method} ${path}`,
    `Host: ${event.host}`,
    `Status: ${event.status || 'нет ответа'}${event.statusText ? ` ${event.statusText}` : ''}`,
    `Duration: ${Math.round(event.duration)} ms`,
    ...(event.error ? [`Error: ${event.error}`] : []),
    '',
    'Request headers:',
    ...formatHeaders(event.requestHeaders),
    '',
  ];
}

function formatConsoleEvent(event: ConsoleEvent): string[] {
  return [`[${formatTime(event.timestamp)}] ${event.level.toUpperCase()}`, event.message, ''];
}

function formatHeaders(headers: Array<{ name: string; value: string }>): string[] {
  if (!headers.length) return ['(нет)'];
  return headers.map((header) => `${header.name.toLowerCase()}: ${header.value}`);
}

function countConsole(events: ConsoleEvent[], levels: ConsoleEvent['level'][]): number {
  return events.filter((event) => levels.includes(event.level)).length;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds < 60 ? `${seconds} сек` : `${Math.floor(seconds / 60)} мин ${seconds % 60} сек`;
}

function formatOffset(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', { hour12: false, fractionalSecondDigits: 3 });
}
