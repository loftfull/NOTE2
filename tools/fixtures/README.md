# Набор файлов для проверки импорта

`test/fixtures/files` — четырнадцать настоящих файлов, на которых
проверяется добавление источников. Они лежат в репозитории, а не
генерируются при каждом прогоне: генераторы office-форматов весят десятки
мегабайт, нужны один раз, и воспроизводимость важнее. Весь набор — 88 КБ.

| файл | формат | что проверяет |
|---|---|---|
| `article.txt` | текст | базовый разбор, подсчёт слов |
| `table.csv` | текст | разделители не теряются |
| `zametka.md` | текст | Markdown хранится как есть |
| `page.html` | HTML | `<script>`, `<style>`, `<title>`, строчный `<b>` перед двоеточием |
| `protokol.docx` | Word | заголовки, списки, жирный текст |
| `raskhody.xlsx` | Excel | строки и столбцы, общие строки (sharedStrings) |
| `otchet.pptx` | PowerPoint | два слайда, порядок слайдов |
| `konspekt.odt` | OpenDocument | текстовый ODF |
| `smeta.ods` | OpenDocument | табличный ODF |
| `kniga.epub` | EPUB 3 | две главы, отсев оглавления, `<title>` в `<head>` |
| `quarterly-report.pdf` | PDF | текстовый слой, две страницы |
| `scan-bez-teksta.pdf` | PDF | **нет** текстового слоя — обязан дать `needs-ocr` |
| `snimok.png` | PNG | изображение: нужен внешний сервис |
| `proshivka.bin` | двоичный | неизвестный формат: отказ без выдумывания |

## Как пересобрать

Набор делится на две части.

**Контейнеры, PNG и текст** — `make-containers.mjs`, зависимостей нет,
всё собирается по спецификациям (OpenDocument 1.2 часть 3, EPUB 3, PNG):

```
node tools/fixtures/make-containers.mjs test/fixtures/files
```

**Office-форматы и PDF** — `make-office.mjs`, нужны настоящие генераторы.
Ставятся отдельно и в зависимости проекта не входят:

```
npm i --no-save docx exceljs pptxgenjs pdfkit
node tools/fixtures/make-office.mjs test/fixtures/files
```

Версии, которыми собран текущий набор: `docx 9.7.2`, `exceljs 4.4.0`,
`pptxgenjs 4.0.1`, `pdfkit 0.20.2` — все MIT.

LibreOffice для этого не используется: в контейнере, где набор собирался,
он отвечает `source file could not be loaded` на любой вход, включая
двухстрочный `.txt`.

PDF с текстовым слоем — латиницей: встроенный в pdfkit Helvetica работает
в кодировке WinAnsi и кириллицу не содержит. Проверяется извлечение
текстового слоя, а не шрифт.
