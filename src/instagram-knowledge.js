import { instagramEvidenceDocument, instagramTokens } from './instagram-analysis.js'

const CATEGORY_RULES = [
  ['recipe', 'Рецепты', ['рецепт','ингредиент','грамм','ложк','минут','духовк','сковород','готовим','приготов','recipe','ingredient']],
  ['product', 'Товары', ['купить','цена','артикул','модель','бренд','магазин','заказать','скидк','товар','product','price','shop']],
  ['place', 'Места', ['адрес','кафе','ресторан','отель','музей','парк','город','улиц','локац','место','location','restaurant','hotel']],
  ['book', 'Книги', ['книга','автор','глава','читать','прочитал','издатель','book','author','chapter']],
  ['design', 'Дизайн', ['дизайн','интерфейс','типограф','шрифт','цвет','ui','ux','компози','макет','design']],
  ['howto', 'Инструкции', ['шаг','способ','как сделать','инструкц','совет','приём','чек-лист','how to','tutorial','guide']],
  ['travel', 'Путешествия', ['путеше','маршрут','билет','аэропорт','пляж','турист','travel','trip','flight']],
  ['study', 'Обучение', ['урок','учеб','объясн','запомн','экзамен','learn','study','lesson']],
]

function textFor(source){return instagramEvidenceDocument(source).toLowerCase()}

export function instagramProcessingCoverage(source={}){
  const media=source?.instagram?.media||[]
  let processable=0,processed=0,images=0,videos=0
  const missing=[]
  for(const item of media){
    if(item.kind==='image'){
      images++;processable++
      if((item.ocrText||'').trim())processed++;else missing.push({index:item.index,kind:'ocr'})
    }else if(item.kind==='video'){
      videos++;processable++
      if((item.transcriptText||'').trim())processed++;else missing.push({index:item.index,kind:'transcript'})
    }
  }
  const ratio=processable?processed/processable:media.length?1:0
  return {media:media.length,processable,processed,images,videos,missing,ratio,percent:Math.round(ratio*100),complete:processable>0&&processed===processable}
}

export function classifyInstagramSource(source={}){
  const text=textFor(source)
  if(!text.trim())return {id:'unknown',label:'Не определено',confidence:0,matches:[]}
  const scored=CATEGORY_RULES.map(([id,label,terms])=>{
    const matches=terms.filter(term=>text.includes(term))
    return {id,label,matches,score:matches.length/Math.max(3,terms.length*.35)}
  }).filter(x=>x.matches.length).sort((a,b)=>b.score-a.score||b.matches.length-a.matches.length)
  if(!scored.length)return{id:'general',label:'Идеи',confidence:.25,matches:[]}
  const top=scored[0]
  return {...top,confidence:Math.min(.96,.35+top.matches.length*.13)}
}

export function suggestInstagramCollections(source={}){
  const category=classifyInstagramSource(source)
  const suggestions=[category.label]
  const text=textFor(source)
  if(/интерьер|мебел|комнат|квартир/.test(text))suggestions.push('Интерьеры')
  if(/рецепт|ингредиент|готовим|еда|блюд/.test(text))suggestions.push('Рецепты')
  if(/купить|товар|цена|бренд|модель/.test(text))suggestions.push('Покупки')
  if(/маршрут|отель|город|путеше|пляж/.test(text))suggestions.push('Путешествия')
  if(/идея|референс|вдохнов/.test(text))suggestions.push('Референсы')
  return [...new Set(suggestions.filter(Boolean))].slice(0,5)
}

export function instagramDuplicateCandidates(source,sources=[],limit=5){
  const a=new Set(instagramTokens(source))
  if(a.size<3)return[]
  return sources.filter(x=>x?.kind==='instagram'&&x.id!==source.id).map(other=>{
    const b=new Set(instagramTokens(other));if(b.size<3)return null
    let overlap=0;for(const token of a)if(b.has(token))overlap++
    const containment=overlap/Math.max(1,Math.min(a.size,b.size))
    const jaccard=overlap/Math.max(1,new Set([...a,...b]).size)
    const score=.65*containment+.35*jaccard
    return {source:other,score,overlap,likelyDuplicate:score>=.62&&overlap>=5}
  }).filter(Boolean).filter(x=>x.score>=.18).sort((a,b)=>b.score-a.score).slice(0,limit)
}

export function instagramCollectionStats(sources=[]){
  const map=new Map()
  for(const source of sources.filter(x=>x?.kind==='instagram')){
    for(const name of source.instagram?.collections||[]){
      if(!name)continue
      const entry=map.get(name)||{name,count:0,sourceIds:[]}
      entry.count++;entry.sourceIds.push(source.id);map.set(name,entry)
    }
  }
  return [...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ru'))
}

export function buildInstagramSynthesisDocument(sources=[]){
  return sources.filter(Boolean).map((source,i)=>{
    const label=`IG${i+1}`
    const author=source.instagram?.owner?.username?`@${source.instagram.owner.username}`:'Instagram'
    const category=classifyInstagramSource(source).label
    return `[${label}] ${author} · ${category}\nURL: ${source.url||''}\n${instagramEvidenceDocument(source)}`
  }).join('\n\n---\n\n')
}

export function instagramSynthesisSystem(){
  return 'Синтезируй ТОЛЬКО предоставленные сохранённые Instagram-источники. Не добавляй сведения извне. Сначала объедини повторяющиеся идеи, затем покажи различия и противоречия, практические действия и итоговую структуру заметки. Для каждого факта сохраняй ссылки [IG1], [IG2] и внутренние evidence labels [CAPTION], [MEDIA N OCR], [MEDIA N TRANSCRIPT]. Если источники повторяют одно и то же — явно отметь дедупликацию.'
}
