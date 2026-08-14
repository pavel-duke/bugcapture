import { sanitizeConsoleValue } from '../sanitizer';

interface BridgeWindow extends Window {
  __BUGCAPTURE_BRIDGE_INSTALLED__?: boolean;
}

const bridgeWindow = window as BridgeWindow;

if (!bridgeWindow.__BUGCAPTURE_BRIDGE_INSTALLED__) {
  bridgeWindow.__BUGCAPTURE_BRIDGE_INSTALLED__ = true;
  let active = false;
  let originalError = console.error;
  let originalWarn = console.warn;

  const emit = (level: string, message: string, details: Record<string, unknown> = {}) => {
    if (!active) return;
    window.dispatchEvent(
      new CustomEvent('bugcapture-page-event', {
        detail: { level, message: message.slice(0, 20_000), timestamp: Date.now(), ...details },
      }),
    );
  };

  const serialize = (value: unknown): string => {
    return sanitizeConsoleValue(value).value;
  };

  const start = () => {
    if (active) return;
    active = true;
    originalError = console.error;
    originalWarn = console.warn;
    console.error = (...args: unknown[]) => {
      emit('error', args.map(serialize).join(' '));
      originalError.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      emit('warn', args.map(serialize).join(' '));
      originalWarn.apply(console, args);
    };
  };

  const stop = () => {
    if (!active) return;
    active = false;
    console.error = originalError;
    console.warn = originalWarn;
  };

  window.addEventListener('bugcapture-control', (event) => {
    const action = (event as CustomEvent<{ action?: string }>).detail?.action;
    if (action === 'start') start();
    if (action === 'stop') stop();
  });

  window.addEventListener('error', (event) => {
    emit('page-error', event.message || 'Unknown page error', {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    emit('unhandled-rejection', serialize(event.reason));
  });
}
