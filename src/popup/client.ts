import type { ArtifactKind, CaptureSummary, RuntimeRequest, RuntimeResponse } from '../types';

export interface PopupClient {
  getStatus(): Promise<CaptureSummary>;
  start(): Promise<CaptureSummary>;
  stop(): Promise<CaptureSummary>;
  markProblem(): Promise<CaptureSummary>;
  download(kind?: ArtifactKind): Promise<void>;
}

async function request<T>(message: RuntimeRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  if (!response?.ok) throw new Error(response?.error || 'Расширение не ответило.');
  return response.data as T;
}

export const popupClient: PopupClient = {
  getStatus: () => request<CaptureSummary>({ type: 'GET_STATUS' }),
  start: () => request<CaptureSummary>({ type: 'START_CAPTURE' }),
  stop: () => request<CaptureSummary>({ type: 'STOP_CAPTURE' }),
  markProblem: () => request<CaptureSummary>({ type: 'MARK_PROBLEM' }),
  download: async (kind) => {
    await request(kind ? { type: 'DOWNLOAD_ARTIFACT', kind } : { type: 'DOWNLOAD_ALL' });
  },
};
