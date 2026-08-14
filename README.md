# BugCapture

Расширение для браузера, которое помогает собрать диагностику ошибки.

Нажимаешь запись, воспроизводишь проблему и получаешь видео, текстовый отчёт и очищенный HAR.

Работает локально и никуда не отправляет собранные данные.

[Скачать BugCapture](https://github.com/pavel-duke/bugcapture/releases/latest) · [Установка](INSTALL.md) · [Roadmap](docs/roadmap.md)

> BugCapture 0.4.0 добавляет локальный Network Explorer и усиливает очистку секретов на всех этапах — от сбора до финального TXT/HAR.

Поддерживаемые браузеры:

- Яндекс Браузер;
- Google Chrome;
- Microsoft Edge;
- Chromium 116 и новее.

## Как выглядит расширение

До записи видны только текущая вкладка и одна главная кнопка. Во время записи доступны таймер, отметка момента и остановка. Интерфейс использует общую дизайн-систему с [ReqVault](https://github.com/pavel-duke/reqvault).

![Минималистичный интерфейс BugCapture 0.4.0](docs/screenshots/bugcapture-popup.png)

После остановки можно найти проблемный запрос до экспорта:

![Network Explorer BugCapture 0.4.0](docs/screenshots/bugcapture-network.png)

## Что умеет

- записывает видео текущей вкладки в WEBM;
- собирает метод, URL, статус, заголовки и время Network-запросов;
- собирает `console.error`, `console.warn`, ошибки страницы и необработанные Promise;
- определяет Яндекс Браузер, Chrome, Edge и версию браузера;
- создаёт понятный TXT-отчёт и совместимый с HAR 1.2 файл `*.safe.har`;
- показывает локальный Network Explorer с поиском, фильтрами и безопасной карточкой запроса;
- экспортирует WEBM, TXT и safe HAR после просмотра результата;
- скрывает чувствительные headers, object fields, query, fragment, URL credentials и известные форматы секретов;
- повторно очищает все данные непосредственно перед TXT/HAR-экспортом;
- работает без сервера, аккаунта, аналитики и телеметрии.

## Установка

Открой [последний GitHub Release](https://github.com/pavel-duke/bugcapture/releases/latest) и скачай файл вида:

```text
BugCapture-v0.4.0-chromium.zip
```

Не скачивай автоматически созданный GitHub файл `Source code.zip`: это исходники для разработчиков.

Распакуй архив и загрузи получившуюся папку в браузер. Подробные инструкции для каждого браузера находятся в [INSTALL.md](INSTALL.md).

## Быстрый старт

1. Открой страницу, на которой возникает проблема.
2. Нажми значок BugCapture на панели браузера.
3. Нажми **Начать запись**.
4. Воспроизведи проблему.
5. При необходимости нажми **Отметить момент**.
6. Открой BugCapture снова и нажми **Остановить**.
7. Открой **Посмотреть Network**, найди запрос через поиск или фильтр.
8. Вернись к результату и нажми **Экспортировать файлы**.
9. Проверь скачанные WEBM, TXT и safe HAR.

Во время записи браузер показывает системную плашку о том, что BugCapture отлаживает вкладку. Это ожидаемо: режим нужен для чтения Network-событий. Данные при этом никуда не отправляются.

## Что собирается

- время начала, окончания и длительность;
- URL и заголовок стартовой страницы;
- название и версия браузера, ОС и размер видимой области;
- Network: время, метод, URL, host, path, query, статус, длительность, заголовки, MIME type, тип ресурса, размеры, ошибка и безопасный initiator;
- Console: errors, warnings, `window.onerror` и `unhandledrejection`;
- временная шкала записи, сетевых ошибок, Console и пользовательских отметок;
- видео только выбранной вкладки.

## Что не собирается

- request body и response body;
- значения полей формы и нажатия клавиш;
- содержимое `localStorage`, `sessionStorage` и IndexedDB;
- cookie storage;
- история браузера и другие вкладки;
- звук вкладки и микрофон;
- данные вне времени активной записи.

## Безопасность

События хранятся только в оперативной памяти расширения. Network очищается ещё во время сбора, Console — до передачи из страницы. Перед preview и созданием TXT/HAR выполняется повторная финальная очистка. Raw HAR никогда не записывается на диск.

Значение скрывается по имени поля: `authorization`, `token`, `ticket`, `tvm`, `blackbox`, `secret`, `key`, `credential`, `password`, `session`, `cookie`, `csrf`, `signature` и похожим частям имени. Учитываются snake_case, kebab-case, camelCase, регистр и `X-*` headers. Дополнительно распознаются Bearer, Basic Auth, JWT, GitHub tokens, Telegram bot tokens, AWS keys, OAuth tokens и длинные случайные ключи. Обычный UUID без чувствительного контекста не скрывается.

Для Console действуют лимиты глубины, числа элементов и размера строк. Cyclic object, Map, Set, Error и вложенный JSON обрабатываются без обхода sanitizer.

Значение заменяется на:

```text
[REDACTED]
```

Sanitizer уменьшает риск случайной передачи секрета, но не является полноценной DLP-системой. Перед отправкой файлов третьим лицам всё равно рекомендуется просмотреть TXT и safe HAR.

## Разрешения

| Разрешение                  | Зачем нужно                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `activeTab`                 | определить вкладку после явного нажатия пользователя                                      |
| `tabCapture`                | получить видеопоток выбранной вкладки                                                     |
| `offscreen`                 | продолжать MediaRecorder после закрытия popup                                             |
| `debugger`                  | получать Network-события через Chrome DevTools Protocol                                   |
| `downloads`                 | сохранять WEBM, TXT и safe HAR локально                                                   |
| `scripting`                 | подключать Console bridge только на время активной записи                                 |
| `http://*/*`, `https://*/*` | продолжать Console capture после перехода записываемой вкладки на другой HTTP/HTTPS-адрес |

Разрешение `tabs` и постоянные content scripts удалены в 0.4.0. `<all_urls>`, `storage`, `cookies`, `history`, `webRequestBlocking` и доступ к буферу обмена не запрашиваются. Код страницы подключается динамически только после запуска записи и повторно после навигации этой же вкладки.

## Поддерживаемые браузеры

| Браузер              | Статус 0.4.0                                      |
| -------------------- | ------------------------------------------------- |
| Яндекс Браузер       | основной целевой браузер                          |
| Google Chrome        | поддерживается                                    |
| Microsoft Edge       | поддерживается                                    |
| Другие Chromium 116+ | ожидается совместимость, нужна отдельная проверка |
| Firefox              | пока не поддерживается                            |

Минимальная версия Chromium — 116. Именно с неё stream ID, полученный service worker, можно использовать в offscreen document для фоновой записи вкладки. Это соответствует [официальной документации `chrome.tabCapture`](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).

## Известные ограничения

- запись не запускается на внутренних страницах `browser://`, `chrome://`, `edge://` и в магазинах расширений;
- DevTools нельзя одновременно держать подключёнными к той же вкладке: браузер разрешает только одно debugger-соединение;
- аудио пока не записывается;
- при закрытии записываемой вкладки до нажатия Stop часть данных может быть потеряна;
- данные сессии не восстанавливаются после полного закрытия браузера;
- локально установленное расширение обновляется вручную;
- на управляемом рабочем компьютере установка сторонних расширений может быть запрещена политиками организации.

## Архитектура

```text
src/
  background/   координация сессии
  browser/      adapter Chromium API и определение браузера
  content/      безопасный мост Console
  network/      сбор Chrome DevTools Protocol Network events
  popup/        React-интерфейс
  recording/    MediaRecorder в offscreen document
  sanitizer/    очистка чувствительных данных
  report/       TXT-отчёт
  har/          safe HAR 1.2
  types/        общие типы сообщений и данных
```

Бизнес-логика не вызывает браузерные API по всему проекту: основные различия Chromium-браузеров изолированы в `src/browser`.

## Разработка

Нужны Node.js 20.19+ и npm.

```bash
npm ci
npm run dev
```

Для локальной тестовой страницы:

```bash
npm run demo
```

Она откроется по адресу `http://127.0.0.1:4177` и умеет создавать GET 200, GET 404, POST 500, Console error и запрос с тестовым token.

## Сборка

```bash
npm run package
```

Команда создаёт:

```text
release/BugCapture-v0.4.0-chromium.zip
release/BugCapture-v0.4.0-chromium.zip.sha256
release/BugCapture-v0.4.0-sbom.cdx.json
```

В ZIP находятся только готовые файлы расширения. Рядом создаются SHA-256 и CycloneDX SBOM. Версия берётся из `package.json`; скрипт автоматически синхронизирует `manifest.json`, интерфейс и имена артефактов.

## Тесты

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run audit
npm run security:bundle
npm run security:release
```

Или всё одной командой:

```bash
npm run verify
```

Ручной сценарий релиза описан в [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md).

Product screenshot интерфейса создаётся из production build:

```bash
npm run screenshot
```

## Релизы

GitHub Actions запускает format check, lint, typecheck, 291 тест, `npm audit`, production build, bundle security check, Gitleaks и CodeQL. Тег вида `v0.4.0` дополнительно:

1. проверяет совпадение тега с `package.json`;
2. запускает все обязательные проверки без `continue-on-error`;
3. создаёт production build;
4. собирает `BugCapture-v0.4.0-chromium.zip`;
5. создаёт SHA-256 и CycloneDX SBOM;
6. прикладывает все три файла к GitHub Release.

## Roadmap

Network Explorer из этапа 0.4.0 реализован. Следующий этап — общий просмотр Timeline, Network и Console. Остальные планы до 1.5.0 не реализованы.

Полный план: [docs/roadmap.md](docs/roadmap.md).

## Участие в проекте

Ошибки и предложения можно создавать в GitHub Issues. Перед pull request прочитай [CONTRIBUTING.md](CONTRIBUTING.md).

- архитектура: [docs/architecture.md](docs/architecture.md);
- дизайн-система: [docs/design-system.md](docs/design-system.md);
- история изменений: [CHANGELOG.md](CHANGELOG.md);
- безопасность: [SECURITY.md](SECURITY.md).

## Лицензия

[MIT](LICENSE)

## Контакты

Вопросы по проекту и предложения: [Telegram @pavel_duke](https://t.me/pavel_duke).
