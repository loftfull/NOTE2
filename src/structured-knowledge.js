import { classifyInstagramSource } from './instagram-knowledge.js'
import { instagramEvidenceDocument } from './instagram-analysis.js'


const FIELD_LABELS={title:'Название',ingredients:'Ингредиенты',steps:'Шаги',time:'Время',servings:'Порции',name:'Название',brand:'Бренд',model:'Модель',price:'Цена',specs:'Характеристики',address:'Адрес',phone:'Телефон',notes:'Заметки',author:'Автор',isbn:'ISBN',ideas:'Ключевые идеи',goal:'Цель',materials:'Материалы',warnings:'Предупреждения',actions:'Действия'}
export function structuredFieldLabel(key=''){return FIELD_LABELS[key]||String(key||'')}

const TYPE_LABELS={recipe:'Рецепт',product:'Товар',place:'Место',book:'Книга',howto:'Инструкция',design:'Дизайн-референс',travel:'Путешествие',study:'Учебный материал',general:'Идея',unknown:'Материал'}
const UNIT_RE='(?:г|гр|кг|мг|мл|л|шт|ч\\.?\\s*л\\.?|ст\\.?\\s*л\\.?|ложк[аи]?|стакан(?:а|ов)?|чашк[аи]?|cup|tbsp|tsp)'

function clean(value=''){return String(value||'').replace(/\s+/g,' ').trim()}
function lines(value=''){return String(value||'').split(/\r?\n/).map(clean).filter(Boolean)}
function unique(values=[]){return [...new Set(values.filter(Boolean))]}
function scalar(value,evidence=[]){return {value,evidence:unique(evidence)}}

export function instagramEvidenceSegments(source={}){
  const meta=source.instagram||{}
  const out=[]
  if(meta.caption)out.push({label:'[CAPTION]',text:meta.caption,locator:{instagram:'caption'}})
  for(const item of meta.media||[]){
    const n=Number(item.index||0)+1
    if(item.alt)out.push({label:`[MEDIA ${n} ALT]`,text:item.alt,locator:{instagramItem:item.index,kind:'alt'}})
    if(item.ocrText)out.push({label:`[MEDIA ${n} OCR]`,text:item.ocrText,locator:{instagramItem:item.index,kind:'ocr'}})
    if(item.transcriptText)out.push({label:`[MEDIA ${n} TRANSCRIPT]`,text:item.transcriptText,locator:{instagramItem:item.index,kind:'transcript'}})
  }
  return out
}

function evidenceFor(value,segments){
  const needle=clean(value).toLowerCase();if(!needle)return[]
  const words=needle.split(/\s+/).filter(w=>w.length>3).slice(0,4)
  const found=segments.filter(seg=>{const t=seg.text.toLowerCase();return t.includes(needle)||words.filter(w=>t.includes(w)).length>=Math.min(2,words.length)}).map(x=>x.label)
  return unique(found).slice(0,4)
}

function firstUsefulLine(segments){
  for(const seg of segments){for(const line of lines(seg.text)){if(line.length>=4&&line.length<=120)return {line,label:seg.label}}}
  return {line:'',label:''}
}

function numberedLines(segments){
  const result=[]
  for(const seg of segments){
    for(const line of lines(seg.text))if(/^(?:шаг\s*)?\d+[.)\s:-]|^(?:сначала|затем|потом|далее|после этого|finally|then)\b/i.test(line))result.push({value:line.replace(/^(?:шаг\s*)?\d+[.)\s:-]*/i,''),evidence:[seg.label]})
  }
  return result.slice(0,24)
}

function extractRecipe(segments){
  const ingredientRe=new RegExp(`(?:^|\\s)\\d+(?:[.,]\\d+)?\\s*${UNIT_RE}(?:\\s|$)`,'i')
  const ingredients=[]
  for(const seg of segments)for(const line of lines(seg.text))if(ingredientRe.test(line)||/ингредиент/i.test(line))ingredients.push({value:line,evidence:[seg.label]})
  const all=segments.map(x=>x.text).join('\n')
  const time=all.match(/\d+(?:[.,]\d+)?\s*(?:мин(?:ут[ыа]?)?|час(?:а|ов)?|minutes?|hours?)/i)?.[0]||''
  const servings=all.match(/\b(?:на\s*)?(\d+)\s*(?:порц|servings?)\w*/i)?.[0]||''
  const title=firstUsefulLine(segments)
  return {title:scalar(title.line,title.label?[title.label]:[]),ingredients:scalar(unique(ingredients.map(x=>x.value)),unique(ingredients.flatMap(x=>x.evidence))),steps:scalar(numberedLines(segments).map(x=>x.value),unique(numberedLines(segments).flatMap(x=>x.evidence))),time:scalar(time,evidenceFor(time,segments)),servings:scalar(servings,evidenceFor(servings,segments))}
}

function extractProduct(segments){
  const all=segments.map(x=>x.text).join('\n');const first=firstUsefulLine(segments)
  const price=all.match(/(?:\d[\d ]*(?:[.,]\d{1,2})?\s*(?:₽|руб(?:лей|ля)?|€|\$|USD|EUR|GBP)|(?:₽|€|\$)\s*\d[\d ]*(?:[.,]\d{1,2})?)/i)?.[0]||''
  const brand=all.match(/(?:бренд|brand)\s*[:—-]\s*([^\n,;]{2,50})/i)?.[1]||''
  const model=all.match(/(?:модель|model)\s*[:—-]\s*([^\n,;]{2,70})/i)?.[1]||''
  const specs=[]
  for(const seg of segments)for(const line of lines(seg.text))if(/^[^:]{2,35}:\s*[^:]{2,90}$/.test(line)&&!/https?:/i.test(line))specs.push(line)
  return {name:scalar(first.line,first.label?[first.label]:[]),brand:scalar(clean(brand),evidenceFor(brand,segments)),model:scalar(clean(model),evidenceFor(model,segments)),price:scalar(price,evidenceFor(price,segments)),specs:scalar(unique(specs).slice(0,16),unique(specs.flatMap(x=>evidenceFor(x,segments))))}
}

function extractPlace(segments){
  const all=segments.map(x=>x.text).join('\n');const first=firstUsefulLine(segments)
  const addressLine=lines(all).find(line=>/(?:ул\.?|улица|проспект|пр-т|переулок|наб\.?|шоссе|boulevard|street|avenue|road)\s/i.test(line))||''
  const phone=all.match(/(?:\+?\d[\d\s()\-]{8,}\d)/)?.[0]||''
  return {name:scalar(first.line,first.label?[first.label]:[]),address:scalar(addressLine,evidenceFor(addressLine,segments)),phone:scalar(phone,evidenceFor(phone,segments)),notes:scalar([],[])}
}

function extractBook(segments){
  const all=segments.map(x=>x.text).join('\n');const first=firstUsefulLine(segments)
  const author=all.match(/(?:автор|author)\s*[:—-]\s*([^\n,;]{3,80})/i)?.[1]||''
  const isbn=all.match(/\b(?:ISBN[-:\s]*)?(97[89][-\s]?)?\d[-\d\s]{8,16}\d\b/i)?.[0]||''
  const ideas=segments.flatMap(seg=>lines(seg.text).filter(line=>line.length>28&&line.length<220).slice(0,4).map(value=>({value,evidence:[seg.label]}))).slice(0,10)
  return {title:scalar(first.line,first.label?[first.label]:[]),author:scalar(clean(author),evidenceFor(author,segments)),isbn:scalar(isbn,evidenceFor(isbn,segments)),ideas:scalar(unique(ideas.map(x=>x.value)),unique(ideas.flatMap(x=>x.evidence)))}
}

function extractHowTo(segments){const first=firstUsefulLine(segments);const steps=numberedLines(segments);return {goal:scalar(first.line,first.label?[first.label]:[]),steps:scalar(steps.map(x=>x.value),unique(steps.flatMap(x=>x.evidence))),materials:scalar([],[]),warnings:scalar([],[])}}
function extractIdeas(segments){const first=firstUsefulLine(segments);const ideas=segments.flatMap(seg=>lines(seg.text).filter(x=>x.length>18&&x.length<220).slice(0,5).map(value=>({value,evidence:[seg.label]}))).slice(0,12);return {title:scalar(first.line,first.label?[first.label]:[]),ideas:scalar(unique(ideas.map(x=>x.value)),unique(ideas.flatMap(x=>x.evidence))),actions:scalar([],[])}}

export function deterministicStructuredInstagram(source={}){
  const segments=instagramEvidenceSegments(source)
  const category=classifyInstagramSource(source)
  const type=['recipe','product','place','book','howto'].includes(category.id)?category.id:['design','travel','study'].includes(category.id)?category.id:'general'
  let fields
  if(type==='recipe')fields=extractRecipe(segments)
  else if(type==='product')fields=extractProduct(segments)
  else if(type==='place')fields=extractPlace(segments)
  else if(type==='book')fields=extractBook(segments)
  else if(type==='howto')fields=extractHowTo(segments)
  else fields=extractIdeas(segments)
  return {version:1,type,label:TYPE_LABELS[type]||TYPE_LABELS.general,confidence:category.confidence||.25,generatedBy:'deterministic',updatedAt:Date.now(),fields,sourceId:source.id||'',shortcode:source.instagram?.shortcode||''}
}

export function structuredExtractionSystem(type='general'){
  const schema={recipe:['title','ingredients','steps','time','servings'],product:['name','brand','model','price','specs'],place:['name','address','phone','notes'],book:['title','author','isbn','ideas'],howto:['goal','steps','materials','warnings'],design:['title','ideas','actions'],travel:['title','ideas','actions'],study:['title','ideas','actions'],general:['title','ideas','actions']}[type]||['title','ideas','actions']
  return `Извлеки структурированные данные ТОЛЬКО из evidence-документа Instagram. Верни только JSON без markdown. Формат: {"type":"${type}","confidence":0..1,"fields":{...}}. Разрешённые поля: ${schema.join(', ')}. Каждое поле обязано иметь форму {"value": значение или массив, "evidence":["[CAPTION]","[MEDIA 2 OCR]"]}. Не заполняй поле догадкой: используй пустую строку/массив. Не добавляй внешние сведения. Evidence labels должны существовать во входе.`
}

function stripFence(text=''){return String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()}
export function parseStructuredKnowledgeOutput(text='',fallback=null){
  try{const parsed=JSON.parse(stripFence(text));if(!parsed||typeof parsed!=='object'||!parsed.fields||typeof parsed.fields!=='object')throw new Error('invalid');return parsed}catch{return fallback}
}

export function normalizeStructuredKnowledge(candidate,source={}){
  const fallback=deterministicStructuredInstagram(source);const raw=candidate&&typeof candidate==='object'?candidate:fallback
  const type=raw.type||fallback.type;const allowed=new Set(instagramEvidenceSegments(source).map(x=>x.label))
  const fields={}
  for(const [key,entry] of Object.entries(raw.fields||fallback.fields||{})){
    const value=entry&&typeof entry==='object'&&'value'in entry?entry.value:entry
    const evidence=entry&&typeof entry==='object'&&Array.isArray(entry.evidence)?entry.evidence.filter(x=>allowed.has(x)):[]
    fields[key]={value:value??'',evidence:unique(evidence)}
  }
  return {version:1,type,label:TYPE_LABELS[type]||fallback.label,confidence:Math.max(0,Math.min(1,Number(raw.confidence??fallback.confidence)||0)),generatedBy:raw.generatedBy||'ai',updatedAt:Date.now(),fields,sourceId:source.id||'',shortcode:source.instagram?.shortcode||''}
}

export function structuredKnowledgeText(structured={}){
  const rows=[]
  for(const [key,entry] of Object.entries(structured.fields||{})){
    const value=entry?.value
    if(Array.isArray(value)){if(value.length)rows.push(`${key}:\n${value.map(x=>`- ${x}`).join('\n')}`)}
    else if(clean(value))rows.push(`${key}: ${clean(value)}`)
  }
  return rows.join('\n\n')
}

export function structuredKnowledgeMarkdown(structured={},source={}){
  const title=structured.label||'Структурированные данные';const body=[]
  body.push(`## ${title}`)
  for(const [key,entry] of Object.entries(structured.fields||{})){
    const value=entry?.value;if(Array.isArray(value)){if(value.length)body.push(`### ${key}\n${value.map(x=>`- ${x}`).join('\n')}`)}else if(clean(value))body.push(`**${key}:** ${clean(value)}`)
    if(entry?.evidence?.length)body.push(`Источник: ${entry.evidence.join(', ')}`)
  }
  if(source.url)body.push(`Оригинал: ${source.url}`)
  return body.join('\n\n')
}

export function instagramMediaNoteBlock(source={},index=0){
  const item=(source.instagram?.media||[]).find(x=>Number(x.index)===Number(index))||(source.instagram?.media||[])[index]
  if(!item)return''
  const n=Number(item.index||0)+1;const user=source.instagram?.owner?.username?`@${source.instagram.owner.username}`:'Instagram'
  const extracted=item.kind==='video'?item.transcriptText:item.ocrText
  const label=item.kind==='video'?`[MEDIA ${n} TRANSCRIPT]`:`[MEDIA ${n} OCR]`
  return [`> **Instagram · ${user} · ${item.kind==='video'?'видео':'слайд'} ${n}**`,extracted?`${label}\n${extracted}`:'Текст ещё не извлечён.',`Источник: ${source.url}${source.url?.includes('?')?'&':'?'}note2_media=${n}`].join('\n\n')
}

export function structuredSourceDocument(source={}){return instagramEvidenceDocument(source)+(source.instagram?.structuredKnowledge?`\n\n[STRUCTURED]\n${structuredKnowledgeText(source.instagram.structuredKnowledge)}`:'')}

function sameStructuredValue(a,b){
  if(Array.isArray(a)||Array.isArray(b))return JSON.stringify(Array.isArray(a)?a:[])===JSON.stringify(Array.isArray(b)?b:[])
  return clean(a)===clean(b)
}

export function applyStructuredUserEdits(structured={},edits={}){
  const fields={}
  for(const [key,entry] of Object.entries(structured.fields||{})){
    const current=entry?.value
    let next=Object.prototype.hasOwnProperty.call(edits,key)?edits[key]:current
    if(Array.isArray(current)){
      next=Array.isArray(next)?next:String(next||'').split(/\r?\n/).map(clean).filter(Boolean)
    }else next=clean(next)
    const changed=!sameStructuredValue(current,next)
    fields[key]={...entry,value:next,evidence:changed?[]:[...(entry?.evidence||[])],userEdited:changed||Boolean(entry?.userEdited)}
  }
  return {...structured,fields,generatedBy:'user',updatedAt:Date.now()}
}
