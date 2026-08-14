# Безопасность

## Сообщить об уязвимости

Не публикуй реальные токены, cookie, приватные URL или диагностические файлы в открытом Issue.

Для приватного сообщения используй GitHub Security Advisories репозитория. Если пример не содержит чувствительных данных, можно создать обычный Issue с минимальным сценарием и только фиктивными значениями.

## Local-first

BugCapture не использует backend, аналитику, телеметрию, рекламу, trackers, WebSocket, `sendBeacon`, удалённый JavaScript или CDN-код. Диагностика не отправляется разработчику и хранится только в памяти расширения до локального экспорта.

Production bundle автоматически проверяется на `eval`, `new Function`, remote import, remote script, неожиданный `fetch`, `XMLHttpRequest`, WebSocket, `sendBeacon`, известные trackers и sourcemaps.

## Pipeline очистки

```text
raw event
→ нормализация и ограничения размера
→ ранняя sanitization
→ безопасное представление в памяти
→ финальная sanitization preview/TXT/HAR
→ локальный экспорт
```

Network URL и headers очищаются до помещения завершённого запроса во внутреннюю коллекцию. Console object сериализуется и очищается до отправки из MAIN world. Перед Network preview, TXT и safe HAR выполняется повторная полная очистка.

Request body и response body не запрашиваются. `Network.getResponseBody` не используется. Cookie storage, `localStorage`, `sessionStorage`, IndexedDB, значения полей и нажатия клавиш не читаются.

## Что скрывает sanitizer

Значение полностью заменяется на `[REDACTED]`, если имя header, query parameter или object field содержит чувствительный термин. Учитываются регистр, snake_case, kebab-case, camelCase и `X-*` headers.

Основные термины: `authorization`, `auth`, `token`, `ticket`, `tvm`, `blackbox`, `secret`, `key`, `credential`, `password`, `session`, `cookie`, `csrf`, `xsrf`, `signature`, `private`, `bearer`.

Также распознаются:

- JWT, Bearer и Basic Auth;
- GitHub и Telegram tokens;
- AWS access keys;
- распространённые OAuth access/refresh tokens;
- длинные случайные credential;
- username/password в URL;
- signed URL и signature query params;
- секреты во fragment, вложенном и URL-encoded URL.

Обычный UUID или публичный SHA-256 без чувствительного контекста не считается секретом. Безопасные нестандартные поля можно добавить в явный allowlist sanitizer.

## Ограничения Console

Sanitizer поддерживает string, object, array, Error, Promise rejection, Map, Set, вложенный JSON и cyclic object. По умолчанию ограничиваются глубина, число элементов коллекции, общее число элементов и длина строк. Getter не выполняется.

За одну запись принимается не более 1000 Console events и 5000 Network events. Это защищает память расширения от огромного payload.

## Permissions

- `activeTab` — доступ к выбранной вкладке после явного нажатия пользователя;
- `debugger` — Network events через CDP;
- `downloads` — локальное сохранение файлов;
- `offscreen`, `tabCapture` — фоновая запись выбранной вкладки;
- `scripting` — динамическое подключение Console bridge;
- `http://*/*`, `https://*/*` — повторное подключение bridge после навигации записываемой вкладки.

Разрешение `tabs`, `<all_urls>` и постоянные content scripts не используются. Bridge подключается только при старте записи и отключается при остановке.

## Автоматические проверки

- 267 security regression-кейсов sanitizer и дополнительные функциональные тесты;
- deterministic fuzz-варианты имён полей;
- `npm audit` с порогом HIGH;
- Gitleaks по полной git history;
- CodeQL `security-extended`;
- Dependabot для npm и GitHub Actions;
- проверка production bundle и состава ZIP;
- CycloneDX SBOM и SHA-256 каждого release ZIP.

Проверки не используют `continue-on-error`.

## Границы sanitizer

Sanitizer существенно снижает риск типичных утечек, но не является полноценной DLP-системой и не может гарантировать распознавание любого неизвестного формата. Перед передачей файлов третьему лицу всё равно проверь TXT, safe HAR и Network preview.
