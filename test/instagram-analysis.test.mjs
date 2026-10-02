import test from 'node:test'
import assert from 'node:assert/strict'
import { instagramEvidenceDocument, instagramSearchSections, relatedInstagramSources, instagramTopicGroups } from '../src/instagram-analysis.js'

const reel={id:'instagram:DaszqnpoLCl',kind:'instagram',url:'https://www.instagram.com/reel/DaszqnpoLCl/',instagram:{owner:{username:'demo'},caption:'Описание ролика про дизайн',media:[{index:0,kind:'video',transcriptText:'Первый совет — увеличить читаемость текста. Второй совет — упростить навигацию.',transcriptSections:[{label:'0:00',text:'Первый совет — увеличить читаемость текста.',locator:{startSeconds:0,endSeconds:4}},{label:'0:04',text:'Второй совет — упростить навигацию.',locator:{startSeconds:4,endSeconds:8}}]}]}}
const carousel={id:'instagram:Db7z448jYex',kind:'instagram',url:'https://www.instagram.com/p/Db7z448jYex/',instagram:{owner:{username:'demo2'},caption:'Карусель про дизайн интерфейса',media:[{index:0,kind:'image',ocrText:'Читаемый текст и простая навигация'},{index:1,kind:'image',ocrText:'Увеличьте основной шрифт'}]}}

test('evidence document includes caption, OCR and transcript labels',()=>{
  const text=instagramEvidenceDocument({...reel,instagram:{...reel.instagram,media:[...reel.instagram.media,{index:1,kind:'image',ocrText:'Текст второго кадра'}]}})
  assert.match(text,/\[CAPTION\]/)
  assert.match(text,/\[MEDIA 1 TRANSCRIPT\]/)
  assert.match(text,/\[MEDIA 2 OCR\]/)
})

test('search sections preserve Instagram item and timestamp locators',()=>{
  const sections=instagramSearchSections(reel)
  const timed=sections.find(x=>x.locator?.startSeconds===4)
  assert.equal(timed.locator.instagramItem,0)
  assert.equal(timed.locator.kind,'transcript')
})

test('similarity groups Instagram sources from extracted evidence',()=>{
  const related=relatedInstagramSources(reel,[reel,carousel])
  assert.equal(related[0]?.source.id,'instagram:Db7z448jYex')
  assert.ok(related[0].overlap>0)
  const groups=instagramTopicGroups([reel,carousel])
  assert.ok(groups.some(x=>['дизайн','текст','навигация'].includes(x.topic)))
})
