import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
const icons=fs.readFileSync(new URL('../src/icons.jsx',import.meta.url),'utf8')
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')

test('v4.10 does not depend on remote Google icon/font assets',()=>{
  assert.doesNotMatch(index,/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  assert.match(app,/import \{ Icon \} from '\.\/icons\.jsx'/)
  assert.match(icons,/<svg viewBox="0 0 24 24"/)
})

test('v4.10 primary icon component never renders icon names as visible text',()=>{
  assert.doesNotMatch(app,/function Icon\(\{ name/)
  assert.doesNotMatch(app,/<span className="material-symbols-rounded"[^>]*>\{name\}<\/span>/)
  assert.match(icons,/function Glyph\(\{name\}\)/)
})

test('v4.10 hardens Today cards against mobile overflow',()=>{
  assert.match(css,/\.quickActionsFlat>button\{min-width:0!important;overflow:hidden\}/)
  assert.match(css,/\.continueText\{min-width:0;overflow:hidden\}/)
  assert.match(css,/\.reviewItem>span:nth-child\(2\)/)
})
