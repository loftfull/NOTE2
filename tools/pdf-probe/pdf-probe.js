// Стенд для проверки извлечения текста из PDF в настоящем браузере.
//
// extractPdfText нельзя вызвать из Node: он грузит воркер через
// `import('...?url')`, а это возможность сборщика, а не рантайма. Поэтому
// модуль собирается как есть и вызывается на странице — то же, что делает
// приложение, без подмены pdfjs заглушкой.
import { extractPdfText } from '../../src/pdf-text.js'
window.extractPdfText = async bytes => extractPdfText(new Uint8Array(bytes).buffer)
window.__probeReady = true
