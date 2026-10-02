import test from 'node:test'
import assert from 'node:assert/strict'
import { deterministicStructuredInstagram, instagramEvidenceSegments, instagramMediaNoteBlock, normalizeStructuredKnowledge, parseStructuredKnowledgeOutput, structuredKnowledgeText } from '../src/structured-knowledge.js'

const src=(caption,media=[])=>({id:'instagram:test',kind:'instagram',url:'https://www.instagram.com/p/test/',instagram:{shortcode:'test',caption,owner:{username:'demo'},media}})

test('recipe structure extracts ingredients, steps, time and evidence',()=>{
  const s=src('Рецепт пасты\n200 г пасты\n2 ст. л. масла\n20 минут\n1. Сварить пасту\n2. Добавить масло')
  const out=deterministicStructuredInstagram(s)
  assert.equal(out.type,'recipe')
  assert.ok(out.fields.ingredients.value.some(x=>x.includes('200 г')))
  assert.ok(out.fields.steps.value.length>=2)
  assert.match(out.fields.time.value,/20 минут/)
  assert.ok(out.fields.ingredients.evidence.includes('[CAPTION]'))
})

test('product structure extracts explicit price/model without inventing fields',()=>{
  const s=src('Обзор товара\nБренд: Xiaomi\nМодель: 14 Pro\nЦена: 89 990 руб\nЭкран: AMOLED')
  const out=deterministicStructuredInstagram(s)
  assert.equal(out.type,'product')
  assert.equal(out.fields.brand.value,'Xiaomi')
  assert.equal(out.fields.model.value,'14 Pro')
  assert.match(out.fields.price.value,/89 990/)
  assert.ok(out.fields.specs.value.includes('Экран: AMOLED'))
})

test('normalizer drops fabricated evidence labels',()=>{
  const s=src('Книга\nАвтор: Иван Иванов',[{index:0,kind:'image',ocrText:'ISBN 978-5-00000-000-1'}])
  const candidate={type:'book',confidence:.8,fields:{author:{value:'Иван Иванов',evidence:['[CAPTION]','[MEDIA 9 OCR]']}}}
  const out=normalizeStructuredKnowledge(candidate,s)
  assert.deepEqual(out.fields.author.evidence,['[CAPTION]'])
})

test('structured JSON parser accepts fences and falls back safely',()=>{
  const fallback={type:'general',fields:{}}
  assert.equal(parseStructuredKnowledgeOutput('```json\n{"type":"book","fields":{}}\n```',fallback).type,'book')
  assert.equal(parseStructuredKnowledgeOutput('not json',fallback),fallback)
})

test('media note block keeps exact carousel evidence locator',()=>{
  const s=src('',[{index:1,kind:'image',ocrText:'Текст второго слайда'}]);s.instagram.requestedMediaIndex=1
  const block=instagramMediaNoteBlock(s,1)
  assert.match(block,/слайд 2/)
  assert.match(block,/\[MEDIA 2 OCR\]/)
  assert.match(block,/note2_media=2/)
})

test('structured text is indexable without raw JSON noise',()=>{
  const text=structuredKnowledgeText({fields:{brand:{value:'Volvo',evidence:['[CAPTION]']},specs:{value:['Мощность: 250'],evidence:[]}}})
  assert.match(text,/brand: Volvo/)
  assert.match(text,/Мощность: 250/)
})

test('manual structured edits clear source evidence only for changed fields',async()=>{
  const {applyStructuredUserEdits}=await import('../src/structured-knowledge.js')
  const structured={type:'product',generatedBy:'ai',fields:{model:{value:'X100',evidence:['[CAPTION]']},price:{value:'1000 руб',evidence:['[MEDIA 1 OCR]']}}}
  const edited=applyStructuredUserEdits(structured,{model:'X200',price:'1000 руб'})
  assert.equal(edited.fields.model.value,'X200')
  assert.deepEqual(edited.fields.model.evidence,[])
  assert.equal(edited.fields.model.userEdited,true)
  assert.deepEqual(edited.fields.price.evidence,['[MEDIA 1 OCR]'])
  assert.equal(edited.generatedBy,'user')
})
