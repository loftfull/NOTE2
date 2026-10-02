import test from 'node:test'
import assert from 'node:assert/strict'
import { extractArchiveText, listZipEntries } from '../src/archive-text.js'
import { deflateRawSync } from 'node:zlib'

const enc = new TextEncoder()
function put16(view,o,v){view.setUint16(o,v,true)}
function put32(view,o,v){view.setUint32(o,v,true)}

function makeZip(files, method = 0) {
  const items = Object.entries(files).map(([name,text]) => {
    const data=enc.encode(text)
    const compressed=method===8?new Uint8Array(deflateRawSync(data)):data
    return { name:enc.encode(name), data, compressed, label:name }
  })
  const localSize = items.reduce((n,x)=>n+30+x.name.length+x.compressed.length,0)
  const centralSize = items.reduce((n,x)=>n+46+x.name.length,0)
  const bytes = new Uint8Array(localSize+centralSize+22)
  const view = new DataView(bytes.buffer)
  let localOffset=0
  const offsets=[]
  for(const item of items){
    offsets.push(localOffset)
    put32(view,localOffset,0x04034b50);put16(view,localOffset+4,20);put16(view,localOffset+8,method);put32(view,localOffset+18,item.compressed.length);put32(view,localOffset+22,item.data.length);put16(view,localOffset+26,item.name.length)
    bytes.set(item.name,localOffset+30);bytes.set(item.compressed,localOffset+30+item.name.length)
    localOffset+=30+item.name.length+item.compressed.length
  }
  const centralOffset=localOffset
  let c=centralOffset
  items.forEach((item,i)=>{
    put32(view,c,0x02014b50);put16(view,c+4,20);put16(view,c+6,20);put16(view,c+10,method);put32(view,c+20,item.compressed.length);put32(view,c+24,item.data.length);put16(view,c+28,item.name.length);put32(view,c+42,offsets[i]);bytes.set(item.name,c+46);c+=46+item.name.length
  })
  put32(view,c,0x06054b50);put16(view,c+8,items.length);put16(view,c+10,items.length);put32(view,c+12,centralSize);put32(view,c+16,centralOffset)
  return bytes
}

test('ZIP reader lists stored entries', () => {
  const zip=makeZip({'a.txt':'A','b.txt':'B'})
  assert.deepEqual(listZipEntries(zip).map(x=>x.name),['a.txt','b.txt'])
})

test('DOCX extractor preserves paragraph text from deflated ZIP entries', async () => {
  const zip=makeZip({'word/document.xml':'<w:document><w:body><w:p><w:r><w:t>Hello world</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>'},8)
  const out=await extractArchiveText(zip,'docx')
  assert.match(out.text,/Hello world/)
  assert.match(out.text,/Second paragraph/)
  assert.equal(out.sections.length,1)
})

test('XLSX extractor resolves shared strings and rows', async () => {
  const zip=makeZip({
    'xl/sharedStrings.xml':'<sst><si><t>Name</t></si><si><t>Alice</t></si></sst>',
    'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c><v>42</v></c></row></sheetData></worksheet>'
  })
  const out=await extractArchiveText(zip,'xlsx')
  assert.match(out.text,/Name\tAlice/)
  assert.match(out.text,/42/)
})
