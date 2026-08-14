# Архитектура BugCapture

## Поток данных

```text
Popup
  ↓ команда пользователя
Service worker
  ├─ browser adapter
  ├─ Network collector (CDP)
  ├─ content/page bridge (Console)
  └─ offscreen document (MediaRecorder)
          ↓ raw события только в памяти
       sanitizer
          ↓
  TXT + safe HAR + WEBM
          ↓
chrome.downloads в service worker
```

## Контексты расширения

### Popup

Показывает состояние и отправляет команды. После закрытия popup запись продолжается.

### Service worker

Владеет сессией, подключает debugger, собирает Network, формирует отчёты и запускает скачивание. Браузерные API изолированы в `src/browser`.

### Offscreen document

Получает stream ID, запускает MediaRecorder и держит Blob до завершения сессии. Он не вызывает `chrome.downloads`: этот API недоступен в offscreen-контексте части Chromium-браузеров.

### Content scripts

MAIN world bridge перехватывает только `console.error` и `console.warn`, а также ошибки страницы. Isolated world пересылает события service worker только во время активной записи.

## Приватность

Raw Network и Console существуют только в оперативной памяти. На диск попадают только данные после sanitizer. Cookie storage, localStorage, sessionStorage, IndexedDB и значения полей не читаются.
