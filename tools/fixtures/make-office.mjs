// Настоящие файлы настоящими генераторами: docx (docx 9.7.2),
// xlsx (exceljs 4.4.0), pptx (pptxgenjs 4.0.1), pdf (pdfkit 0.20.2).
// LibreOffice в этом контейнере не работает ("source file could not be
// loaded" на любом входе), поэтому office-файлы делают библиотеки.
import fs from 'node:fs'
import path from 'node:path'
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import PDFDocument from 'pdfkit'

const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const at = name => path.join(OUT, name)

// ── DOCX ───────────────────────────────────────────────────────────────
const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ text: 'Протокол встречи 26 сентября', heading: HeadingLevel.HEADING_1 }),
      new Paragraph('Присутствовали: владелец продукта, инженер.'),
      new Paragraph({ text: 'Что решили', heading: HeadingLevel.HEADING_2 }),
      new Paragraph('Разметку в заметке показывать через санитайзер.'),
      new Paragraph('Тёмную тему не делать — это решение владельца.'),
      new Paragraph({ children: [
        new TextRun('Следующая проверка — после смены палитры. '),
        new TextRun({ text: 'Срок: 14 октября.', bold: true }),
      ] }),
    ],
  }],
})
fs.writeFileSync(at('protokol.docx'), await Packer.toBuffer(doc))

// ── XLSX ───────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Расходы')
ws.addRow(['месяц', 'расход', 'примечание'])
ws.addRow(['июль', 412000, 'базовый уровень'])
ws.addRow(['август', 486000, 'перенос медиа-узла'])
ws.addRow(['сентябрь', 487200, 'без изменений'])
await wb.xlsx.writeFile(at('raskhody.xlsx'))

// ── PPTX ───────────────────────────────────────────────────────────────
const pptx = new PptxGenJS()
const s1 = pptx.addSlide()
s1.addText('Квартальный отчёт', { x: 0.5, y: 0.6, fontSize: 32, bold: true })
s1.addText('Инфраструктура: плюс 18 процентов', { x: 0.5, y: 1.6, fontSize: 18 })
const s2 = pptx.addSlide()
s2.addText('Решения к обсуждению', { x: 0.5, y: 0.6, fontSize: 28, bold: true })
s2.addText('Оставить отдельный узел обработки медиа', { x: 0.5, y: 1.5, fontSize: 16 })
s2.addText('Либо вернуть обработку в основной процесс', { x: 0.5, y: 2.1, fontSize: 16 })
await pptx.writeFile({ fileName: at('otchet.pptx') })

// ── PDF с текстовым слоем ──────────────────────────────────────────────
// Кириллица во встроенном Helvetica недоступна (WinAnsi), поэтому этот файл
// латиницей: проверяется извлечение текстового слоя, не шрифт.
await new Promise(resolve => {
  const pdf = new PDFDocument({ size: 'A4', margin: 56 })
  const out = fs.createWriteStream(at('quarterly-report.pdf'))
  pdf.pipe(out)
  pdf.fontSize(20).text('Quarterly infrastructure report', { align: 'left' })
  pdf.moveDown()
  pdf.fontSize(12).text('Infrastructure spend grew by 18 percent against Q3. The driver was moving media processing onto a separate node.')
  pdf.moveDown()
  pdf.fontSize(12).text('Options: keep the node and cut the advertising budget, or move processing back and accept the latency.')
  pdf.addPage()
  pdf.fontSize(16).text('Page two: owner and deadline')
  pdf.fontSize(12).text('Owner: Liviy. Deadline: 14 October.')
  pdf.end()
  out.on('finish', resolve)
})

// ── PDF без текстового слоя («сканированный») ───────────────────────────
// Только изображение. Локальное извлечение обязано вернуть needs-ocr, а не
// пустой «готовый» источник.
await new Promise(resolve => {
  const pdf = new PDFDocument({ size: [300, 200], margin: 0 })
  const out = fs.createWriteStream(at('scan-bez-teksta.pdf'))
  pdf.pipe(out)
  pdf.rect(0, 0, 300, 200).fill('#d9d2c5')
  pdf.rect(30, 40, 240, 12).fill('#8a7f6d')
  pdf.rect(30, 70, 200, 12).fill('#8a7f6d')
  pdf.rect(30, 100, 220, 12).fill('#8a7f6d')
  pdf.end()
  out.on('finish', resolve)
})

console.log('готово:', fs.readdirSync(OUT).sort().join(' '))
