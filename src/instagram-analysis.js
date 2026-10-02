const STOP = new Set('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем сказать всех никогда сегодня это при про после над перед между через очень также или либо and the for with from this that'.split(/\s+/))

export function instagramEvidenceDocument(source={}){
  const meta=source.instagram||{}
  const parts=[]
  if(meta.owner?.username)parts.push(`[AUTHOR] @${meta.owner.username}`)
  if(meta.takenAt)parts.push(`[PUBLISHED] ${meta.takenAt}`)
  if(source.url)parts.push(`[SOURCE] ${source.url}`)
  if(meta.caption)parts.push(`[CAPTION]\n${meta.caption}`)
  for(const item of meta.media||[]){
    const n=Number(item.index||0)+1
    if(item.alt)parts.push(`[MEDIA ${n} ALT]\n${item.alt}`)
    if(item.ocrText)parts.push(`[MEDIA ${n} OCR]\n${item.ocrText}`)
    if(item.transcriptText)parts.push(`[MEDIA ${n} TRANSCRIPT]\n${item.transcriptText}`)
  }
  return parts.join('\n\n').trim()
}

export function instagramAnalysisSystem(mode='brief'){
  const common='Анализируй ТОЛЬКО предоставленные данные Instagram-поста. Не выдумывай содержание отсутствующих кадров, речь, автора, товары, места или факты. Чётко отделяй текст источника от вывода. Если данных недостаточно — укажи это.'
  if(mode==='brief')return `${common} Дай краткую выжимку на русском: 3–6 пунктов, главная мысль, что стоит сохранить/сделать. Для каждого существенного пункта укажи происхождение в формате [CAPTION], [MEDIA N OCR] или [MEDIA N TRANSCRIPT].`
  if(mode==='detailed')return `${common} Сделай подробный структурированный разбор на русском: тема, тезисы, факты, инструкции/шаги, упомянутые сущности, полезные детали, спорные/неясные места, практическое применение. Сохраняй ссылки на evidence labels.`
  if(mode==='organize')return `${common} Систематизируй материал: выдели темы, сущности, действия, числа/даты, товары/места/людей только если они реально указаны, идеи для заметок, задачи и возможные теги. Объедини дублирующие формулировки. Сохраняй evidence labels.`
  return common
}

export function instagramAnalysisAction(mode='brief'){
  return mode==='brief'?'instagram-brief':mode==='detailed'?'instagram-detailed':'instagram-organize'
}

export function instagramTokens(source={}){
  const text=instagramEvidenceDocument(source).toLowerCase()
  return (text.match(/[a-zа-яё0-9][a-zа-яё0-9-]{2,}/gi)||[]).filter(x=>!STOP.has(x))
}

export function relatedInstagramSources(current,sources=[],limit=4){
  if(!current)return[]
  const a=new Set(instagramTokens(current))
  if(!a.size)return[]
  return sources.filter(x=>x?.id!==current.id&&x?.kind==='instagram').map(source=>{
    const b=new Set(instagramTokens(source));let overlap=0
    for(const token of a)if(b.has(token))overlap++
    const union=new Set([...a,...b]).size||1
    const authorBoost=current.instagram?.owner?.username&&current.instagram.owner.username===source.instagram?.owner?.username?.toLowerCase()?0.15:0
    return{source,score:overlap/union+authorBoost,overlap}
  }).filter(x=>x.overlap>0).sort((x,y)=>y.score-x.score||y.overlap-x.overlap).slice(0,limit)
}

export function instagramTopicGroups(sources=[]){
  const counts=new Map()
  for(const source of sources.filter(x=>x?.kind==='instagram')){
    const unique=new Set(instagramTokens(source))
    for(const token of unique)counts.set(token,(counts.get(token)||0)+1)
  }
  const anchors=[...counts.entries()].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10)
  return anchors.map(([topic,count])=>({topic,count,sources:sources.filter(source=>new Set(instagramTokens(source)).has(topic)).map(source=>source.id)}))
}

export function instagramSearchSections(source={}){
  const meta=source.instagram||{}
  const sections=[]
  if(meta.caption)sections.push({label:'Описание Instagram',text:meta.caption,locator:{instagram:'caption'}})
  for(const item of meta.media||[]){
    const n=Number(item.index||0)+1
    if(item.alt)sections.push({label:`Медиа ${n} · alt`,text:item.alt,locator:{instagramItem:item.index,kind:'alt'}})
    if(item.ocrText)sections.push({label:`Медиа ${n} · OCR`,text:item.ocrText,locator:{instagramItem:item.index,kind:'ocr'}})
    if(Array.isArray(item.transcriptSections)&&item.transcriptSections.length){
      for(const section of item.transcriptSections){
        if(!section?.text)continue
        sections.push({label:`Медиа ${n} · ${section.label||'расшифровка'}`,text:section.text,locator:{...(section.locator||{}),instagramItem:item.index,kind:'transcript'}})
      }
    }else if(item.transcriptText){
      sections.push({label:`Медиа ${n} · расшифровка`,text:item.transcriptText,locator:{instagramItem:item.index,kind:'transcript'}})
    }
  }
  if(meta.structuredKnowledge?.fields){
    const rows=[]
    for(const [key,entry] of Object.entries(meta.structuredKnowledge.fields)){
      const value=entry?.value
      if(Array.isArray(value)){if(value.length)rows.push(`${key}: ${value.join('; ')}`)}
      else if(String(value||'').trim())rows.push(`${key}: ${String(value).trim()}`)
    }
    if(rows.length)sections.push({label:'Структурированные данные',text:rows.join('\n'),locator:{instagram:'structured'}})
  }
  return sections
}
