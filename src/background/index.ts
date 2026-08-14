import { CaptureController, isRuntimeRequest } from './controller';
import type { RuntimeRequest, RuntimeResponse } from '../types';

const controller = new CaptureController();
let keepAlivePort: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'bugcapture-keepalive') return;
  keepAlivePort = port;
  port.onMessage.addListener(() => undefined);
  port.onDisconnect.addListener(() => {
    if (keepAlivePort === port) keepAlivePort = null;
  });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRuntimeRequest(message)) return;
  void handleRequest(message)
    .then((data) => sendResponse({ ok: true, data } satisfies RuntimeResponse))
    .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) } satisfies RuntimeResponse));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') void controller.handleTabUpdated(tabId);
});

async function handleRequest(message: RuntimeRequest): Promise<unknown> {
  switch (message.type) {
    case 'GET_STATUS':
      return controller.getSummary();
    case 'START_CAPTURE':
      return controller.start();
    case 'STOP_CAPTURE':
      return controller.stop();
    case 'MARK_PROBLEM':
      controller.markProblem();
      return controller.getSummary();
    case 'DOWNLOAD_ARTIFACT':
      await controller.download(message.kind);
      return true;
    case 'DOWNLOAD_ALL':
      await controller.download();
      return true;
    case 'CONTENT_EVENT':
      controller.addContentEvent(message.sessionId, message.event);
      return true;
    case 'OFFSCREEN_READY':
    case 'RECORDING_STARTED':
      return true;
    default:
      return true;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
