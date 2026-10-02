import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInstagramSynthesisDocument, classifyInstagramSource, instagramCollectionStats, instagramDuplicateCandidates, instagramProcessingCoverage, suggestInstagramCollections } from '../src/instagram-knowledge.js'

const source=(id,caption,media=[])=>({id,kind:'instagram',url:`https://instagram.com/p/${id}/`,instagram:{caption,owner:{username:id},media}})

test('processing coverage distinguishes OCR and video transcript work',()=>{
  const s=source('a','',[
    {index:0,kind:'image',ocrText:'готово'},
    {index:1,kind:'video',transcriptText:''},
    {index:2,kind:'image'}
  ])
  const c=instagramProcessingCoverage(s)
  assert.equal(c.processable,3);assert.equal(c.processed,1);assert.equal(c.percent,33);assert.deepEqual(c.missing.map(x=>x.kind),['transcript','ocr'])
})

test('content classifier and collection suggestions use extracted evidence',()=>{
  const s=source('food','Рецепт: ингредиенты, 300 грамм, готовим в духовке')
  const c=classifyInstagramSource(s)
  assert.equal(c.id,'recipe');assert.ok(c.confidence>.5);assert.ok(suggestInstagramCollections(s).includes('Рецепты'))
})

test('duplicate detector finds strongly overlapping saved ideas',()=>{
  const a=source('a','мобильный дизайн типографика интерфейс шрифт размер текст иконки навигация')
  const b=source('b','интерфейс мобильный дизайн шрифт типографика размер текст иконки навигация')
  const c=source('c','рецепт паста сыр томаты духовка')
  const found=instagramDuplicateCandidates(a,[a,b,c])
  assert.equal(found[0].source.id,'b');assert.equal(found[0].likelyDuplicate,true)
})

test('collection stats and synthesis preserve source labels',()=>{
  const a=source('a','дизайн');a.instagram.collections=['Референсы','Дизайн']
  const b=source('b','шрифт');b.instagram.collections=['Референсы']
  assert.equal(instagramCollectionStats([a,b])[0].name,'Референсы')
  const text=buildInstagramSynthesisDocument([a,b])
  assert.match(text,/\[IG1\]/);assert.match(text,/\[IG2\]/);assert.match(text,/URL:/)
})
