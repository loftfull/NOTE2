import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bodyToText, charsetFor, decodeEntities, htmlTitle, htmlToText } from '../server/html-text.mjs'

test('decodeEntities handles named, decimal and hex forms', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b')
  assert.equal(decodeEntities('&laquo;цитата&raquo;'), '«цитата»')
  assert.equal(decodeEntities('&#1055;&#1088;&#1080;&#1074;&#1077;&#1090;'), 'Привет')
  assert.equal(decodeEntities('&#x41;&#X42;'), 'AB')
  assert.equal(decodeEntities('&nosuchentity;'), '&nosuchentity;', 'unknown names stay literal')
  assert.equal(decodeEntities('&#xD800;'), '', 'a lone surrogate is dropped, not emitted')
})

test('htmlToText keeps paragraph boundaries', () => {
  const text = htmlToText('<p>Первый абзац.</p><p>Второй абзац.</p>')
  assert.equal(text, 'Первый абзац.\n\nВторой абзац.')
})

test('htmlToText drops script and style content entirely', () => {
  const html = `
    <html><head><style>.a{color:red}</style></head>
    <body><script>var secret = "leak me";</script><p>Видимый текст</p></body></html>`
  const text = htmlToText(html)
  assert.equal(text, 'Видимый текст')
  assert.ok(!text.includes('leak me'), 'script bodies must not become content')
  assert.ok(!text.includes('color:red'), 'style bodies must not become content')
})

test('htmlToText drops an unclosed script tag rather than leaking its body', () => {
  // A truncated fetch can end mid-script. Without the unclosed-tag rule the
  // whole remainder of the document becomes "text".
  const text = htmlToText('<p>До</p><script>var x = 1; leaked_identifier')
  assert.equal(text, 'До')
})

test('htmlToText does not let a comment smuggle markup through', () => {
  assert.equal(htmlToText('<p>A</p><!-- <p>hidden</p> --><p>B</p>'), 'A\n\nB')
})

test('htmlToText separates list items and table cells', () => {
  assert.equal(htmlToText('<ul><li>один</li><li>два</li></ul>'), 'один\n\nдва')
  assert.equal(htmlToText('<table><tr><td>a</td><td>b</td></tr></table>'), 'a\n\nb')
})

test('htmlToText turns <br> into a single newline', () => {
  assert.equal(htmlToText('строка один<br>строка два'), 'строка один\nстрока два')
})

test('htmlToText collapses runs of blank lines', () => {
  assert.equal(htmlToText('<div><div><div><p>x</p></div></div></div>'), 'x')
})

test('htmlTitle prefers <title>, then og:title, then h1', () => {
  assert.equal(htmlTitle('<title>  Заголовок &amp; ещё </title>'), 'Заголовок & ещё')
  assert.equal(htmlTitle('<meta property="og:title" content="OG заголовок">'), 'OG заголовок')
  assert.equal(htmlTitle('<h1>H1 <span>заголовок</span></h1>'), 'H1 заголовок')
  assert.equal(htmlTitle('<p>нет заголовка</p>'), '')
})

test('htmlTitle ignores an empty <title> and falls through', () => {
  assert.equal(htmlTitle('<title>   </title><h1>Реальный</h1>'), 'Реальный')
})

test('bodyToText routes by content type', () => {
  assert.equal(bodyToText(Buffer.from('<p>тело</p>'), 'text/html; charset=utf-8').text, 'тело')
  assert.equal(bodyToText(Buffer.from('обычный текст'), 'text/plain').text, 'обычный текст')
  assert.equal(bodyToText(Buffer.from('{"b":1,"a":2}'), 'application/json').text, '{\n  "b": 1,\n  "a": 2\n}')
  assert.equal(bodyToText(Buffer.from('{not json'), 'application/json').text, '{not json', 'broken JSON stays as text')
})

test('bodyToText sniffs HTML when no content type is given', () => {
  assert.equal(bodyToText(Buffer.from('<html><body><p>x</p></body></html>'), '').text, 'x')
})

test('charsetFor reads the header first, then a meta tag', () => {
  assert.equal(charsetFor('text/html; charset=Windows-1251'), 'windows-1251')
  assert.equal(charsetFor('text/html', Buffer.from('<meta charset="koi8-r">')), 'koi8-r')
  assert.equal(charsetFor('text/html', Buffer.from('<p>нет</p>')), 'utf-8')
})
