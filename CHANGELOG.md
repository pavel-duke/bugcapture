# История изменений

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версия проекта следует [Semantic Versioning](https://semver.org/lang/ru/).

## [0.4.0] — 2026-08-14

### Добавлено

- локальный Network Explorer с поиском по URL, method, status и host;
- фильтры All, Errors, 2xx, 3xx, 4xx, 5xx, Failed и быстрый режим проблемных запросов;
- безопасная карточка запроса с headers, duration, resource type, timestamp и initiator без bodies;
- 267 security regression-кейсов sanitizer и deterministic fuzz-варианты;
- CodeQL, Gitleaks, Dependabot, production bundle security check и release content check;
- SHA-256 и CycloneDX SBOM для release artifact;
- Prettier format check в обязательный CI.

### Изменено

- экспорт запускается пользователем после локального просмотра Network;
- Network URL и headers очищаются во время сбора, Console — до передачи из страницы;
- preview, TXT и safe HAR выполняют отдельную финальную sanitization;
- sanitizer учитывает sensitive field names в snake_case, kebab-case, camelCase, любом регистре и `X-*` headers;
- URL sanitizer очищает credentials, fragment, signed URL, nested URL и encoded значения;
- Console sanitizer ограничивает глубину, число элементов и размер и поддерживает Error, Map, Set и cyclic object;
- GitHub Actions закреплены на точных commit SHA.

### Безопасность

- удалено разрешение `tabs`;
- `<all_urls>` заменён на точные HTTP/HTTPS host permissions;
- постоянные content scripts удалены из manifest и подключаются только во время записи;
- добавлены лимиты 1000 Console events и 5000 Network events;
- обычный UUID без чувствительного контекста больше не маскируется;
- `npm audit` не обнаружил известных уязвимостей;
- Gitleaks не обнаружил реальных секретов в полной истории репозитория.

### Исправлено

- закрыт обход sanitizer через вложенный JSON и чувствительные object fields;
- экспорт больше не доверяет только очистке, выполненной во время сбора.

## [0.3.0] — 2026-08-14

### Добавлено

- кнопка **Отметить момент** в активной записи;
- аккуратная ссылка на профиль автора в GitHub в нижней части popup;
- roadmap проекта до версии 1.5.0.

### Изменено

- popup упрощён до одного главного действия на каждом этапе;
- экран готовности теперь содержит только вкладку, кнопку записи и короткое описание источников;
- во время записи оставлены таймер, отметка момента и остановка;
- экран результата показывает одну кнопку повторного скачивания всего пакета;
- высота popup уменьшена, удалены карточки, технические метрики и декоративный шум.

### Исправлено

- сценарий скачивания версии 0.2.0 сохранён: готовые WEBM, TXT и safe HAR загружаются через service worker без обращения к недоступному `downloads` в offscreen document.

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

[0.4.0]: https://github.com/pavel-duke/bugcapture/releases/tag/v0.4.0
[0.3.0]: https://github.com/pavel-duke/bugcapture/releases/tag/v0.3.0
[0.2.0]: https://github.com/pavel-duke/bugcapture/releases/tag/v0.2.0
[0.1.0]: https://github.com/pavel-duke/bugcapture/releases/tag/v0.1.0
