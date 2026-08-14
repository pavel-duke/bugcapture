interface OffscreenMessage {
  target?: 'offscreen';
  action?: 'START_RECORDING' | 'STOP_RECORDING' | 'STORE_TEXT_ARTIFACTS' | 'DOWNLOAD_ARTIFACT' | 'DOWNLOAD_ALL';
  streamId?: string;
  baseFilename?: string;
  report?: string;
  har?: string;
  kind?: 'video' | 'report' | 'har';
}

let recorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let chunks: Blob[] = [];
let videoBlob: Blob | null = null;
let reportText = '';
let harText = '';
let baseFilename = '';
let startedAt = 0;

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  void handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

function connectKeepAlive(): void {
  const port = chrome.runtime.connect({ name: 'bugcapture-keepalive' });
  const timer = window.setInterval(() => port.postMessage({ timestamp: Date.now() }), 20_000);
  port.onDisconnect.addListener(() => {
    window.clearInterval(timer);
    window.setTimeout(connectKeepAlive, 1_000);
  });
}
connectKeepAlive();

async function handleMessage(message: OffscreenMessage): Promise<unknown> {
  switch (message.action) {
    case 'START_RECORDING':
      return startRecording(required(message.streamId, 'Не передан MediaStream ID.'), required(message.baseFilename, 'Не задано имя файла.'));
    case 'STOP_RECORDING':
      return stopRecording();
    case 'STORE_TEXT_ARTIFACTS':
      reportText = message.report ?? '';
      harText = message.har ?? '';
      baseFilename = required(message.baseFilename, 'Не задано имя файла.');
      return true;
    case 'DOWNLOAD_ARTIFACT':
      await downloadArtifact(required(message.kind, 'Не выбран тип файла.'));
      return true;
    case 'DOWNLOAD_ALL':
      for (const kind of ['video', 'report', 'har'] as const) await downloadArtifact(kind);
      return true;
    default:
      throw new Error('Неизвестная команда offscreen document.');
  }
}

async function startRecording(streamId: string, filename: string): Promise<{ mimeType: string }> {
  if (recorder && recorder.state !== 'inactive') throw new Error('Запись уже идёт.');
  chunks = [];
  videoBlob = null;
  reportText = '';
  harText = '';
  baseFilename = filename;

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  } as unknown as MediaStreamConstraints;
  mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  const mimeType = selectMimeType();
  recorder = new MediaRecorder(mediaStream, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined);
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  recorder.addEventListener('error', (event) => {
    console.error('MediaRecorder error', event);
  });
  startedAt = Date.now();
  recorder.start(1_000);
  return { mimeType: recorder.mimeType };
}

async function stopRecording(): Promise<{ duration: number; size: number }> {
  if (!recorder || recorder.state === 'inactive') throw new Error('Активная запись не найдена.');
  const currentRecorder = recorder;
  await new Promise<void>((resolve, reject) => {
    currentRecorder.addEventListener('stop', () => resolve(), { once: true });
    currentRecorder.addEventListener('error', () => reject(new Error('MediaRecorder не смог завершить запись.')), { once: true });
    currentRecorder.stop();
  });
  for (const track of mediaStream?.getTracks() ?? []) track.stop();
  videoBlob = new Blob(chunks, { type: currentRecorder.mimeType || 'video/webm' });
  recorder = null;
  mediaStream = null;
  chunks = [];
  return { duration: Date.now() - startedAt, size: videoBlob.size };
}

async function downloadArtifact(kind: 'video' | 'report' | 'har'): Promise<void> {
  let blob: Blob;
  let filename: string;
  if (kind === 'video') {
    if (!videoBlob) throw new Error('Видео ещё не готово.');
    blob = videoBlob;
    filename = `${baseFilename}.webm`;
  } else if (kind === 'report') {
    if (!reportText) throw new Error('Отчёт ещё не готов.');
    blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    filename = `${baseFilename}.txt`;
  } else {
    if (!harText) throw new Error('Safe HAR ещё не готов.');
    blob = new Blob([harText], { type: 'application/json;charset=utf-8' });
    filename = `${baseFilename}.safe.har`;
  }
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' });
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function selectMimeType(): string {
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === '') throw new Error(message);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
