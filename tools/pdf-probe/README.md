# Стенд проверки извлечения текста из PDF

`extractPdfText` нельзя вызвать из Node: он грузит воркер через
`import('pdfjs-dist/build/pdf.worker.mjs?url')`, а это возможность сборщика, а
не рантайма. Поэтому модуль собирается как есть и вызывается на странице — то
же, что делает приложение, без подмены pdfjs заглушкой.

Стенд лежит в `tools/`, а не в `test/`, чтобы `node --test` не принимал его
файлы за тесты.

## Запуск

```bash
npx vite build --config tools/pdf-probe/vite.probe.config.js
npx serve .probe-dist        # или любой статический сервер
```

Открыть страницу и в консоли:

```js
const bytes = [...new Uint8Array(await (await fetch('/sample-two-pages.pdf')).arrayBuffer())]
await window.extractPdfText(bytes)
```

Фикстура: `test/fixtures/sample-two-pages.pdf` — две страницы, сгенерирована
без внешних библиотек, поэтому воспроизводима.

## Что стенд подтвердил

Обновление `pdfjs-dist` 5.7.284 → 6.3.289 (закрытие GHSA-hq66-cqwq-w95j,
выполнение произвольного JavaScript при открытии вредоносного PDF) не изменило
вывод ни на байт:

```
страниц   : 2
  [Page 1] locator={"page":1} → "Pecept hleba na zakvaske\nMuka 500 g, voda 350 g.\nRasstoyka 4 chasa."
  [Page 2] locator={"page":2} → "Stranica dva\nHolodnaya noch v holodilnike."
```

Чистая часть разбора — `joinTextItems` — покрыта обычными тестами в
`test/pdf-text.test.mjs` и проверяется через `npm test`.
