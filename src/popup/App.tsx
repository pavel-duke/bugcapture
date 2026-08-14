import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BUGCAPTURE_VERSION } from '../generated/version';
import { sanitizeNetworkEvent } from '../sanitizer';
import type { ArtifactKind, CaptureSummary, HeaderEntry, NetworkEvent } from '../types';
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
  const [explorerOpen, setExplorerOpen] = useState(false);

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
    void client
      .getStatus()
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
    <main className={explorerOpen ? 'app explorer-mode' : 'app'}>
      <Header />

      <div className="app-content">
        {explorerOpen && summary.status === 'completed' && summary.result ? (
          <NetworkExplorer
            events={summary.result.network}
            busy={busy}
            downloadsStarted={summary.downloadsStarted}
            onBack={() => setExplorerOpen(false)}
            onDownload={() => void download()}
          />
        ) : loading ? (
          <LoadingView />
        ) : summary.status === 'starting' || summary.status === 'processing' ? (
          <ProcessingView />
        ) : summary.status === 'recording' ? (
          <RecordingView
            summary={summary}
            busy={busy}
            onMark={() => void run(() => client.markProblem())}
            onStop={() => void run(() => client.stop())}
          />
        ) : summary.status === 'completed' && summary.result ? (
          <CompletedView
            summary={summary}
            busy={busy}
            onExplore={() => setExplorerOpen(true)}
            onDownload={() => void download()}
          />
        ) : (
          <ReadyView summary={summary} busy={busy} onStart={() => void run(() => client.start())} />
        )}

        {(actionError || summary.error) && (
          <div className="alert" role="alert">
            <AlertIcon />
            <span>{actionError || summary.error}</span>
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="header">
      <div className="brand">
        <BrandIcon />
        <strong>BugCapture</strong>
      </div>
      <span className="version">v{BUGCAPTURE_VERSION}</span>
    </header>
  );
}

function ReadyView({ summary, busy, onStart }: { summary: CaptureSummary; busy: boolean; onStart: () => void }) {
  return (
    <section className="state ready-view">
      <div className="target">
        <span className="target-dot" />
        <span>{summary.currentTab?.hostname || 'Откройте веб-страницу'}</span>
        <span className="sr-only">Браузер: {summary.browser?.name || 'не определён'}</span>
      </div>

      <button className="record-button" disabled={busy || !summary.currentTab} onClick={onStart}>
        <span className="record-dot" />
        <span>{busy ? 'Запускаем…' : 'Начать запись'}</span>
      </button>

      <p className="capture-note">Экран · Network · Console</p>
    </section>
  );
}

function RecordingView({
  summary,
  busy,
  onMark,
  onStop,
}: {
  summary: CaptureSummary;
  busy: boolean;
  onMark: () => void;
  onStop: () => void;
}) {
  return (
    <section className="state recording-view" aria-live="polite">
      <div className="recording-status">
        <span />
        Запись
      </div>
      <div className="timer">{formatDuration(summary.duration)}</div>
      <p className="recording-target">{summary.currentTab?.hostname}</p>

      <div className="recording-actions">
        <button className="mark-button" disabled={busy} onClick={onMark}>
          <MarkerIcon />
          <span>{busy ? 'Отмечаем…' : 'Отметить момент'}</span>
        </button>
        <button className="stop-button" disabled={busy} onClick={onStop}>
          <span className="stop-icon" />
          <span>{busy ? 'Останавливаем…' : 'Остановить'}</span>
        </button>
      </div>
    </section>
  );
}

function ProcessingView() {
  return (
    <section className="state processing-view" aria-live="polite">
      <span className="loader" />
      <h2>Готовим файлы</h2>
      <p>Очищаем данные и сохраняем отчёт</p>
    </section>
  );
}

function CompletedView({
  summary,
  busy,
  onExplore,
  onDownload,
}: {
  summary: CaptureSummary;
  busy: boolean;
  onExplore: () => void;
  onDownload: () => void;
}) {
  return (
    <section className="state completed-view">
      <span className="complete-icon">
        <CheckIcon />
      </span>
      <h2>Готово</h2>
      <p>
        {formatDuration(summary.duration)} · {summary.requestCount} запросов
      </p>
      <span className="download-status">
        {summary.downloadsStarted ? 'Пакет скачан' : 'Проверьте Network перед экспортом'}
      </span>
      <button className="explore-button" onClick={onExplore}>
        <NetworkIcon />
        <span>Посмотреть Network</span>
      </button>
      <button className="download-button" disabled={busy} onClick={onDownload}>
        <DownloadIcon />
        <span>
          {busy ? 'Скачиваем…' : summary.downloadsStarted ? 'Скачать пакет повторно' : 'Экспортировать файлы'}
        </span>
      </button>
    </section>
  );
}

type NetworkFilter = 'all' | 'errors' | '2xx' | '3xx' | '4xx' | '5xx' | 'failed';

const NETWORK_FILTERS: Array<{ value: NetworkFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'errors', label: 'Ошибки' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' },
  { value: 'failed', label: 'Failed' },
];

function NetworkExplorer({
  events,
  busy,
  downloadsStarted,
  onBack,
  onDownload,
}: {
  events: NetworkEvent[];
  busy: boolean;
  downloadsStarted?: boolean;
  onBack: () => void;
  onDownload: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NetworkFilter>('all');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const safeEvents = useMemo(() => events.map((event) => sanitizeNetworkEvent(event).value), [events]);
  const stats = useMemo(() => networkStats(safeEvents), [safeEvents]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return safeEvents.filter((event) => {
      if (problemsOnly && !isProblemRequest(event)) return false;
      if (!matchesFilter(event, filter)) return false;
      if (!normalizedQuery) return true;
      return [event.url, event.method, String(event.status), event.host].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [filter, problemsOnly, query, safeEvents]);
  const selected = filtered.find((event) => event.requestId === selectedId) ?? filtered[0];

  return (
    <section className="network-explorer">
      <div className="explorer-heading">
        <button className="back-button" onClick={onBack} aria-label="Назад к результату">
          <BackIcon />
        </button>
        <div>
          <h2>Network</h2>
          <span>Локальный просмотр</span>
        </div>
        <button
          className="compact-download"
          disabled={busy}
          onClick={onDownload}
          aria-label={downloadsStarted ? 'Скачать пакет повторно' : 'Экспортировать файлы'}
        >
          <DownloadIcon />
        </button>
      </div>

      <div className="network-summary" aria-label="Сводка Network">
        <NetworkMetric label="Всего" value={stats.total} />
        <NetworkMetric label="Ошибки" value={stats.errors} danger />
        <NetworkMetric label="4xx" value={stats.clientErrors} />
        <NetworkMetric label="5xx" value={stats.serverErrors} danger />
        <NetworkMetric label="Failed" value={stats.failed} danger />
      </div>

      <label className="network-search">
        <SearchIcon />
        <span className="sr-only">Поиск по URL, method, status или host</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="URL, method, status или host"
        />
      </label>

      <div className="network-filters" aria-label="Фильтры Network">
        {NETWORK_FILTERS.map((item) => (
          <button
            key={item.value}
            className={filter === item.value ? 'active' : ''}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="problem-toggle">
        <input type="checkbox" checked={problemsOnly} onChange={(event) => setProblemsOnly(event.target.checked)} />
        <span>Показать только проблемные</span>
      </label>

      <div className="network-workspace">
        <div className="request-list" aria-label="Список запросов">
          {filtered.length ? (
            filtered.map((event) => (
              <button
                key={`${event.requestId}-${event.timestamp}`}
                className={selected?.requestId === event.requestId ? 'request-row selected' : 'request-row'}
                onClick={() => setSelectedId(event.requestId)}
              >
                <span className={`status-code ${statusTone(event)}`}>{event.status || 'ERR'}</span>
                <span className="request-copy">
                  <strong>
                    {event.method} {event.path || event.url}
                  </strong>
                  <small>{event.host}</small>
                </span>
                <span className="request-duration">{Math.round(event.duration)} ms</span>
              </button>
            ))
          ) : (
            <p className="empty-network">Запросы не найдены</p>
          )}
        </div>

        {selected && <RequestDetails event={selected} />}
      </div>
    </section>
  );
}

function NetworkMetric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={danger && value > 0 ? 'metric danger' : 'metric'}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RequestDetails({ event }: { event: NetworkEvent }) {
  return (
    <article className="request-details">
      <div className="details-title">
        <span className={`status-code ${statusTone(event)}`}>{event.status || 'ERR'}</span>
        <strong>{event.method}</strong>
        <span>{Math.round(event.duration)} ms</span>
      </div>
      <p className="details-url">{event.url}</p>
      <dl>
        <div>
          <dt>Тип</dt>
          <dd>{event.resourceType || 'Other'}</dd>
        </div>
        <div>
          <dt>Время</dt>
          <dd>{formatTimestamp(event.timestamp)}</dd>
        </div>
        {event.initiator && (
          <div>
            <dt>Initiator</dt>
            <dd>{event.initiator}</dd>
          </div>
        )}
        {event.error && (
          <div className="error-detail">
            <dt>Ошибка</dt>
            <dd>{event.error}</dd>
          </div>
        )}
      </dl>
      <HeaderDetails title="Request headers" headers={event.requestHeaders} />
      <HeaderDetails title="Response headers" headers={event.responseHeaders} />
    </article>
  );
}

function HeaderDetails({ title, headers }: { title: string; headers: HeaderEntry[] }) {
  return (
    <details>
      <summary>
        {title} <span>{headers.length}</span>
      </summary>
      <div className="header-list">
        {headers.length ? (
          headers.map((header, index) => (
            <p key={`${header.name}-${index}`}>
              <strong>{header.name}</strong>
              <span>{header.value}</span>
            </p>
          ))
        ) : (
          <p>Нет данных</p>
        )}
      </div>
    </details>
  );
}

function networkStats(events: NetworkEvent[]) {
  return {
    total: events.length,
    errors: events.filter((event) => event.status >= 400).length,
    clientErrors: events.filter((event) => event.status >= 400 && event.status < 500).length,
    serverErrors: events.filter((event) => event.status >= 500).length,
    failed: events.filter(isFailedRequest).length,
  };
}

function matchesFilter(event: NetworkEvent, filter: NetworkFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'errors') return event.status >= 400;
  if (filter === 'failed') return isFailedRequest(event);
  const hundred = Number(filter[0]);
  return event.status >= hundred * 100 && event.status < (hundred + 1) * 100;
}

function isFailedRequest(event: NetworkEvent): boolean {
  return Boolean(event.error) || event.status === 0;
}

function isProblemRequest(event: NetworkEvent): boolean {
  return event.status >= 400 || isFailedRequest(event);
}

function statusTone(event: NetworkEvent): string {
  if (isFailedRequest(event) || event.status >= 500) return 'status-danger';
  if (event.status >= 400) return 'status-warning';
  if (event.status >= 300) return 'status-redirect';
  return 'status-success';
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function LoadingView() {
  return (
    <section className="state loading-view" aria-live="polite">
      <span className="loader" />
      <p>Подключаемся…</p>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <a href="https://github.com/pavel-duke" target="_blank" rel="noreferrer">
        <GithubIcon />
        <span>github.com/pavel-duke</span>
      </a>
      <span>Данные остаются на устройстве</span>
    </footer>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

function BrandIcon() {
  return (
    <span className="brand-icon">
      <Icon>
        <path d="M8.3 5.5 6.8 3.7M15.7 5.5l1.5-1.8M5.7 9H3.2m15.1 0h2.5M5.5 14H3m15.5 0H21M8.1 19.2 6.5 21m9.4-1.8 1.6 1.8" />
        <path d="M7 8.8A5 5 0 0 1 12 4a5 5 0 0 1 5 4.8v5.7a5 5 0 0 1-10 0V8.8Z" />
        <path d="M7 11h10M12 4v15.3" />
      </Icon>
    </span>
  );
}
function MarkerIcon() {
  return (
    <Icon>
      <path d="M6 4.5h12v16L12 17l-6 3.5v-16Z" />
    </Icon>
  );
}
function AlertIcon() {
  return (
    <Icon>
      <path d="M12 3.5 21 20H3l9-16.5Z" />
      <path d="M12 9v5m0 3h.01" />
    </Icon>
  );
}
function CheckIcon() {
  return (
    <Icon>
      <path d="m5 12.5 4.3 4.3L19 7" />
    </Icon>
  );
}
function DownloadIcon() {
  return (
    <Icon>
      <path d="M12 4v11m-4-4 4 4 4-4M5 20h14" />
    </Icon>
  );
}
function NetworkIcon() {
  return (
    <Icon>
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <path d="m7.8 15.6 8.4-7.2M7.5 7.5h4v4" />
    </Icon>
  );
}
function BackIcon() {
  return (
    <Icon>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}
function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}
function GithubIcon() {
  return (
    <Icon>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a12 12 0 0 0-6 0C5.8.1 4.7.5 4.7.5A5 5 0 0 0 4.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.3 3.5 6.5 6.8 6.9a4.8 4.8 0 0 0-1 3.4v4" />
      <path d="M9 18c-3 .9-3-1.5-4.2-2" />
    </Icon>
  );
}
