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
          ↓ ранняя очистка и ограничения
  safe internal representation
          ↓ финальная очистка
  Network preview + TXT + safe HAR + WEBM
          ↓
  chrome.downloads в service worker
```

## Контексты расширения

### Popup

Показывает состояние и отправляет команды. После закрытия popup запись продолжается.

### Service worker

Владеет сессией, подключает debugger, собирает уже очищенные Network events, повторно очищает итоговый результат, формирует отчёты и запускает скачивание только по команде пользователя. Браузерные API изолированы в `src/browser`.

### Offscreen document

Получает stream ID, запускает MediaRecorder и держит Blob до завершения сессии. Он не вызывает `chrome.downloads`: этот API недоступен в offscreen-контексте части Chromium-браузеров.

### Network Explorer

Работает внутри popup и получает только безопасное `CaptureResult`. Перед preview каждый Network event снова проходит sanitizer. Поиск и фильтрация не используют сеть и не сохраняют состояние на диск.

### Content scripts

MAIN world bridge подключается через `chrome.scripting` только после начала записи. Он перехватывает `console.error`, `console.warn`, ошибки страницы и Promise rejection, ограничивает структуру и очищает её до передачи. Isolated world пересылает не более 1000 событий service worker только во время активной записи. Постоянных content scripts в manifest нет.

## Приватность

Незавершённый Network request кратковременно существует в памяти collector, но URL и headers очищаются сразу при поступлении. Завершённые Network events и Console хранятся только в безопасном виде. Перед preview и экспортом выполняется ещё один проход sanitizer. Cookie storage, localStorage, sessionStorage, IndexedDB и значения полей не читаются.
