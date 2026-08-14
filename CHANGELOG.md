# История изменений

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версия проекта следует [Semantic Versioning](https://semver.org/lang/ru/).

## [0.2.0] — 2026-08-14

### Добавлено

- новый тёмный интерфейс popup на общей дизайн-системе с ReqVault;
- отдельные экраны готовности, записи, обработки и результата;
- карточки WEBM, TXT и safe HAR с повторным скачиванием каждого файла;
- встроенные SVG-иконки без внешнего CDN;
- воспроизводимый product screenshot из production build;
- GitHub Issue templates, pull request template и документация дизайн-системы;
- тест browser adapter для скачивания файлов.

### Изменено

- скачивание перенесено из offscreen document в service worker;
- offscreen document теперь отвечает только за MediaRecorder, Blob и подготовку object URL;
- README и структура документации приведены к общему формату проектов pavel-duke;
- основной цвет, сетка, типографика и состояния фокуса синхронизированы с ReqVault.

### Исправлено

- устранена ошибка `Cannot read properties of undefined (reading 'download')` после остановки записи;
- автоматическое и повторное скачивание теперь вызывают `chrome.downloads.download()` в поддерживаемом контексте расширения;

### Безопасность

- Blob URL автоматически отзываются через две минуты;
- тела запросов и ответов по-прежнему не собираются;
- `npm audit` не обнаружил известных уязвимостей.

## [0.1.0] — 2026-08-14

### Добавлено

- Manifest V3 расширение для Яндекс Браузера, Chrome, Edge и Chromium;
- запись текущей вкладки через `tabCapture`, offscreen document и MediaRecorder;
- сбор Network через Chrome DevTools Protocol;
- сбор Console errors, warnings и ошибок страницы;
- sanitizer чувствительных заголовков, query-параметров и известных секретов;
- TXT-отчёт, safe HAR и WEBM;
- production ZIP и автоматизация GitHub Release;
- русская документация установки.

[0.2.0]: https://github.com/pavel-duke/bugcapture/releases/tag/v0.2.0
[0.1.0]: https://github.com/pavel-duke/bugcapture/releases/tag/v0.1.0
