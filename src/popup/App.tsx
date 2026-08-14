import { useCallback, useEffect, useState } from 'react';
import { BUGCAPTURE_VERSION } from '../generated/version';
import type { ArtifactKind, CaptureSummary } from '../types';
import { popupClient, type PopupClient } from './client';

const EMPTY_SUMMARY: CaptureSummary = {
  status: 'idle',
  duration: 0,
  requestCount: 0,
  httpErrorCount: 0,
  consoleErrorCount: 0,
  consoleWarningCount: 0,
};

export interface AppProps {
  client?: PopupClient;
}

export function App({ client = popupClient }: AppProps) {
  const [summary, setSummary] = useState<CaptureSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSummary(await client.getStatus());
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void client.getStatus()
      .then((nextSummary) => {
        if (active) setSummary(nextSummary);
      })
      .catch((error: unknown) => {
        if (active) setActionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (summary.status !== 'recording' && summary.status !== 'processing') return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, summary.status]);

  const run = async (action: () => Promise<CaptureSummary>) => {
    setBusy(true);
    setActionError('');
    try {
      setSummary(await action());
    } catch (error) {
      setActionError(errorMessage(error));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const download = async (kind?: ArtifactKind) => {
    setBusy(true);
    setActionError('');
    try {
      await client.download(kind);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">B</span>
        <div>
          <h1>BugCapture</h1>
          <p>Диагностика ошибки без DevTools</p>
        </div>
      </header>

      {loading ? (
        <section className="card centered" aria-live="polite">Проверяем текущую вкладку…</section>
      ) : summary.status === 'recording' || summary.status === 'processing' || summary.status === 'starting' ? (
        <RecordingView summary={summary} busy={busy} onMark={() => void run(() => client.markProblem())} onStop={() => void run(() => client.stop())} />
      ) : summary.status === 'completed' && summary.result ? (
        <CompletedView summary={summary} busy={busy} onDownload={download} />
      ) : (
        <ReadyView summary={summary} busy={busy} onStart={() => void run(() => client.start())} />
      )}

      {(actionError || summary.error) && (
        <div className="alert" role="alert">{actionError || summary.error}</div>
      )}

      <footer>Версия {BUGCAPTURE_VERSION} · Все данные остаются на компьютере</footer>
    </main>
  );
}

function ReadyView({ summary, busy, onStart }: { summary: CaptureSummary; busy: boolean; onStart: () => void }) {
  return (
    <>
      <section className="card tab-card">
        <span className="label">Текущая вкладка</span>
        <strong>{summary.currentTab?.hostname || 'Вкладка недоступна'}</strong>
        <span className="muted ellipsis">{summary.currentTab?.title}</span>
        <div className="divider" />
        <span className="label">Браузер</span>
        <strong>{summary.browser?.name || 'Не определён'}</strong>
        <span className="muted">{summary.browser?.version}</span>
      </section>

      <section className="card options">
        <h2>Записывать</h2>
        <Feature icon="▣" text="Видео текущей вкладки" />
        <Feature icon="↗" text="Network-запросы" />
        <Feature icon="!" text="Console errors и warnings" />
        <p className="privacy-note">Тела запросов и ответов, cookie-хранилище и значения полей не собираются.</p>
      </section>

      <button className="primary" disabled={busy || !summary.currentTab} onClick={onStart}>
        {busy ? 'Запускаем…' : 'Начать запись'}
      </button>
      <p className="hint">Браузер покажет плашку режима отладки — она нужна для сбора Network.</p>
    </>
  );
}

function RecordingView({ summary, busy, onMark, onStop }: { summary: CaptureSummary; busy: boolean; onMark: () => void; onStop: () => void }) {
  const isProcessing = summary.status === 'processing' || summary.status === 'starting';
  return (
    <section className="card recording-card" aria-live="polite">
      <div className="recording-status"><span className="record-dot" />{isProcessing ? 'Обработка' : 'Запись'}</div>
      <div className="timer">{formatDuration(summary.duration)}</div>
      <dl className="stats">
        <Stat label="Запросов" value={summary.requestCount} />
        <Stat label="HTTP-ошибок" value={summary.httpErrorCount} danger />
        <Stat label="Console errors" value={summary.consoleErrorCount} danger />
      </dl>
      {!isProcessing && (
        <>
          <button className="secondary" disabled={busy} onClick={onMark}>Отметить проблему</button>
          <button className="stop" disabled={busy} onClick={onStop}>{busy ? 'Обрабатываем…' : 'Остановить'}</button>
        </>
      )}
      {isProcessing && <p className="centered muted">Подготавливаем безопасные файлы…</p>}
    </section>
  );
}

function CompletedView({ summary, busy, onDownload }: { summary: CaptureSummary; busy: boolean; onDownload: (kind?: ArtifactKind) => void }) {
  const result = summary.result!;
  return (
    <section className="card completed-card">
      <div className="success-mark">✓</div>
      <h2>Запись готова</h2>
      <p className="muted">{formatDuration(summary.duration)} · {summary.requestCount} запросов · {summary.httpErrorCount} HTTP-ошибок</p>
      <div className="safe-message">Чувствительные данные очищены: {result.redactionCount}</div>
      {summary.downloadsStarted && <p className="downloaded">WEBM, TXT и safe HAR уже скачиваются.</p>}
      <button className="primary" disabled={busy} onClick={() => onDownload()}>{busy ? 'Скачиваем…' : 'Скачать всё повторно'}</button>
      <div className="artifact-buttons">
        <button disabled={busy} onClick={() => onDownload('video')}>Видео</button>
        <button disabled={busy} onClick={() => onDownload('report')}>Отчёт</button>
        <button disabled={busy} onClick={() => onDownload('har')}>Safe HAR</button>
      </div>
    </section>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return <div className="feature"><span>{icon}</span><span>{text}</span><b>✓</b></div>;
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div><dt>{label}</dt><dd className={danger && value ? 'danger' : ''}>{value}</dd></div>;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
