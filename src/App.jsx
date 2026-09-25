import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { expertRoles } from './data.js'
import { exportBundle, importBundle, loadSettings, loadWorkspace, saveSettings, saveWorkspace } from './storage.js'
import { discoverGateway } from './gateway-discovery.js'
import { clearSearchHistory, loadSearchHistory, rememberSearch } from './search-history.js'
import { useScrollDirection } from './use-scroll-direction.js'
import { correctedFilter, visibleSourceFilters } from './source-filters.js'
import { AI_ORIGIN, aiResultText, semanticScore } from './ai.js'
import { embedWithSettings, hasAiRoute, hasEmbedRoute, runTask } from './model-runtime.js'
import { notesLabel, pluralRu, resultsLabel, sourcesLabel, tasksLabel } from './plural.js'
import { Button, Card, Disclosure, Input, Textarea } from './ui.jsx'
import ModelManager from './ModelManager.jsx'
import { MODEL_ROLES, selectModel } from './models.js'
import { chunkText, parseLocalFile } from './ingest.js'
import { clearSourceDb, deleteSource, listChunks, listSources, replaceSourcesWithChunks, saveSourceWithChunks, updateSourceMetadata } from './source-db.js'
import { buildEvidence, groundedPrompt, localGroundedAnswer, rankChunks } from './rag.js'
import { embedTexts } from './embeddings.js'
import { analyzeVisualFile, ingestYoutube, secondsLabel, sectionsToSrt } from './media-api.js'
import { indexSourceRecord } from './source-index.js'
import { pullWorkspaceSync, pushWorkspaceSync } from './sync-api.js'
import { accountMe, listAccountSessions, loginAccount, logoutAccount, pullAccountSync, pushAccountSync, registerAccount, revokeAccountSession } from './account-sync-api.js'
import { authenticatedFetch, clearApiSessionAuth, credentialSecurityMode, getCredential, removeCredential, setApiSessionAuth, setCredential } from './secure-credentials.js'
import { deleteJob as deleteMediaJob, enqueueMediaTranscription, getJob as getMediaJob, listJobs as listMediaJobs, recoverInterruptedMediaJobs, retryQueuedMediaJob, runMediaTranscriptionJob } from './media-jobs.js'
import { gatewayApiEndpointFor, healthEndpointFor } from './gateway-url.js'
import { ingestInstagramPost, instagramArchivedMediaUrl } from './instagram-api.js'
import { installUniversalShareTargetListener, instagramSharedUrlDescriptor } from './share-target.js'
import { createPendingSourceFromDescriptor, sharedUrlDescriptor, sourceProvider, sourceProviderLabel, unifiedSourceView } from './unified-source.js'
import { instagramAnalysisAction, instagramAnalysisSystem, instagramEvidenceDocument, instagramSearchSections, relatedInstagramSources } from './instagram-analysis.js'
import { classifyInstagramSource, instagramDuplicateCandidates, instagramProcessingCoverage, suggestInstagramCollections } from './instagram-knowledge.js'
import { applyStructuredUserEdits, deterministicStructuredInstagram, instagramMediaNoteBlock, normalizeStructuredKnowledge, parseStructuredKnowledgeOutput, structuredExtractionSystem, structuredFieldLabel, structuredKnowledgeMarkdown } from './structured-knowledge.js'
import { loadInstagramMediaBlob, pinInstagramSourceOffline, unpinInstagramSourceOffline } from './instagram-offline.js'

const NAV = [
  ['dashboard','Сегодня','today'],
  ['library','Заметки','edit_note'],
  ['analysis','Источники','library_books'],
  ['search','Поиск','search'],
  ['settings','Профиль','person']
]
const MOBILE = NAV.map(item=>item[0])

// Light-only by product decision: three visual styles, no dark theme.
export const APP_STYLES = [
  ['yasny','Мягкий','Приподнятые поверхности, цветные плитки, плавающая панель.'],
  ['grifel','Грифель','Плотный инструмент. Тонкие линии, индиго.'],
  ['pero','Перо','Издание. Воздух, серифный заголовок, изумруд.']
]


function formatDate(ts) { return new Date(ts).toLocaleDateString('ru-RU',{month:'short',day:'numeric'}) }
function countWords(text='') { return (text.trim().match(/\S+/g)||[]).length }
function stripMarkdown(text='') { return text.replace(/[#*_`>~-]/g,' ').replace(/\s+/g,' ').trim() }
function fileSize(bytes=0){ const u=['B','KB','MB','GB']; let i=0,n=bytes; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n.toFixed(i?1:0)} ${u[i]}` }
function downloadText(name,text,type='application/json') { const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;a.click(); setTimeout(()=>URL.revokeObjectURL(url),500) }
function locatorLabel(locator, sectionLabel='') { if(locator?.page)return `стр. ${locator.page}`; if(Number.isFinite(Number(locator?.startSeconds)))return `${locator?.speaker?`${locator.speaker} · `:''}${secondsLabel(locator.startSeconds)}`; return sectionLabel||'' }
function sourceIcon(kind='') { if(kind==='url')return'language';if(kind==='youtube')return'play_circle';if(kind==='instagram')return'photo_library';if(kind==='pdf')return'picture_as_pdf';if(['docx','odt','epub'].includes(kind))return'description';if(kind==='pptx'||kind==='odp')return'slideshow';if(kind==='xlsx'||kind==='ods')return'table';if(kind==='image')return'image';if(kind==='audio')return'graphic_eq';if(kind==='video')return'movie';return'article' }
function objectVariant(seed=''){let h=0;for(const ch of String(seed))h=(h*31+ch.charCodeAt(0))>>>0;return h%5}
function knowledgeIcon(kind='note'){
  if(kind==='task')return'check_circle';
  if(kind==='url')return'link';
  if(kind==='youtube')return'play_circle';
  if(kind==='instagram')return'photo_library';
  if(kind==='pdf')return'picture_as_pdf';
  if(['docx','odt','epub'].includes(kind))return'description';
  if(kind==='pptx'||kind==='odp')return'slideshow';
  if(kind==='xlsx'||kind==='ods')return'table_view';
  if(kind==='image')return'photo_camera';
  if(kind==='audio')return'mic';
  if(kind==='video')return'videocam';
  if(kind==='search')return'search';
  return'edit_note';
}
function KnowledgeObject({kind='note',seed='',size='md'}){const icon=knowledgeIcon(kind);return <span className={`knowledgeObject semanticObject v${objectVariant(seed)} ${size}`} aria-hidden="true"><span className="semanticObjectGlow"/><Icon name={icon} size={size==='lg'?28:size==='sm'?21:24} className="semanticObjectGlyph"/></span>}
function HighlightedText({text='',excerpt=''}){
  const source=String(text||'')
  const needle=String(excerpt||'').trim()
  if(!needle)return <>{source}</>
  let index=source.indexOf(needle)
  let length=needle.length
  if(index<0){
    const compactNeedle=needle.replace(/\s+/g,' ').slice(0,180)
    const compactSource=source.replace(/\s+/g,' ')
    const compactIndex=compactSource.indexOf(compactNeedle)
    if(compactIndex>=0){index=Math.min(compactIndex,source.length);length=Math.min(compactNeedle.length,source.length-index)}
  }
  if(index<0)return <>{source}</>
  return <>{source.slice(0,index)}<mark className="evidenceMark">{source.slice(index,index+length)}</mark>{source.slice(index+length)}</>
}
function InstagramPostViewer({source,settings,onSourceUpdated,onBatchSourceUpdated,onToggleFavorite,onCreateNote,onCreateMediaNote,onInsightUpdated,onToggleCollection,onStructuredUpdated,onOfflinePinUpdated,instagramSources=[],locator=null}){
  const media=source?.instagram?.media||[]
  const evidenceIndex=Number.isInteger(Number(locator?.instagramItem))?Number(locator.instagramItem):null
  const initialIndex=Math.min(Math.max((evidenceIndex ?? Number(source?.instagram?.requestedMediaIndex) ?? 0),0),Math.max(0,media.length-1))
  const[index,setIndex]=useState(initialIndex)
  const[blobUrl,setBlobUrl]=useState('')
  const[blob,setBlob]=useState(null)
  const[loading,setLoading]=useState(false)
  const[extractBusy,setExtractBusy]=useState(false)
  const[zoom,setZoom]=useState(false)
  const[analysisBusy,setAnalysisBusy]=useState('')
  const[analysisMode,setAnalysisMode]=useState('brief')
  const[batchBusy,setBatchBusy]=useState(false)
  const[batchProgress,setBatchProgress]=useState('')
  const[structuredBusy,setStructuredBusy]=useState(false)
  const[structuredEditing,setStructuredEditing]=useState(false)
  const[structuredDraft,setStructuredDraft]=useState({})
  const[offlineBusy,setOfflineBusy]=useState(false)
  const[offlineProgress,setOfflineProgress]=useState('')
  const swipeStart=useRef(null)
  const videoRef=useRef(null)
  const item=media[index]||null
  const related=useMemo(()=>relatedInstagramSources(source,instagramSources,3),[source,instagramSources])
  const coverage=useMemo(()=>instagramProcessingCoverage(source),[source])
  const classification=useMemo(()=>classifyInstagramSource(source),[source])
  const collectionSuggestions=useMemo(()=>suggestInstagramCollections(source),[source])
  const duplicates=useMemo(()=>instagramDuplicateCandidates(source,instagramSources,3),[source,instagramSources])
  useEffect(()=>{const target=Number.isInteger(Number(locator?.instagramItem))?Number(locator.instagramItem):(Number(source?.instagram?.requestedMediaIndex)||0);setIndex(Math.min(Math.max(target,0),Math.max(0,(source?.instagram?.media?.length||1)-1)))},[source?.id,source?.instagram?.requestedMediaIndex,locator?.instagramItem])
  useEffect(()=>{const el=videoRef.current;if(!el||item?.kind!=='video'||!Number.isFinite(Number(locator?.startSeconds)))return;const seek=()=>{try{el.currentTime=Math.max(0,Number(locator.startSeconds)||0)}catch{}};el.addEventListener('loadedmetadata',seek,{once:true});if(el.readyState>=1)seek();return()=>el.removeEventListener('loadedmetadata',seek)},[blobUrl,index,locator?.startSeconds,item?.kind])
  useEffect(()=>{
    let objectUrl='';let cancelled=false
    const load=async()=>{
      setLoading(true);setBlobUrl('');setBlob(null);setZoom(false)
      if(!item){setLoading(false);return}
      try{const loaded=await loadInstagramMediaBlob(source,item.index);const nextBlob=loaded.blob;if(cancelled)return;objectUrl=URL.createObjectURL(nextBlob);setBlob(nextBlob);setBlobUrl(objectUrl)}catch{}finally{if(!cancelled)setLoading(false)}
    }
    load();return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[source?.id,item?.index,item?.archiveUrl,source?.instagram?.offlinePinned])
  if(!source)return null
  if(!item)return <div className="instagramPending"><div className="instagramBadge"><Icon name="cloud_off" size={18}/></div><div><strong>Ссылка сохранена, медиа ещё не получены</strong><p>{source.error||'Instagram не отдал публичные данные. Ссылка останется в библиотеке и её можно повторно загрузить после настройки Instagram session.'}</p><a href={source.url} target="_blank" rel="noreferrer">Открыть оригинал ↗</a></div></div>
  const save=()=>{if(!blobUrl)return;const a=document.createElement('a');a.href=blobUrl;a.download=`instagram-${source.instagram.shortcode}-${index+1}.${item.kind==='video'?'mp4':'jpg'}`;a.click()}
  const extract=async()=>{
    if(!blob)return
    setExtractBusy(true)
    try{
      if(item.kind==='image'){
        if(!settings?.visionEndpoint)return
        const file=new File([blob],`instagram-${source.instagram.shortcode}-${index+1}.jpg`,{type:blob.type||item.contentType||'image/jpeg'})
        const data=await analyzeVisualFile(file,settings.visionEndpoint)
        await onSourceUpdated?.(index,{ocrText:data.text||'',ocrSections:data.sections||[],ocrModel:data.model||null,processedAt:new Date().toISOString()})
      }else{
        if(!settings?.transcribeEndpoint)return
        const file=new File([blob],`instagram-${source.instagram.shortcode}-${index+1}.mp4`,{type:blob.type||item.contentType||'video/mp4'})
        const queued=await enqueueMediaTranscription(file)
        const data=await runMediaTranscriptionJob(queued,settings.transcribeEndpoint)
        await onSourceUpdated?.(index,{transcriptText:data.text||'',transcriptSections:data.sections||[],transcriptModel:data.model||null,transcribedAt:data.transcribedAt||new Date().toISOString(),mediaJobId:queued.id})
      }
    }finally{setExtractBusy(false)}
  }
  const processAll=async()=>{
    const missing=instagramProcessingCoverage(source).missing
    if(!missing.length)return
    setBatchBusy(true);const patches=[]
    try{
      for(let n=0;n<missing.length;n++){
        const target=media.find(x=>Number(x.index)===Number(missing[n].index));if(!target?.archiveUrl)continue
        setBatchProgress(`${n+1}/${missing.length}`)
        const loaded=await loadInstagramMediaBlob(source,target.index)
        const targetBlob=loaded.blob
        if(target.kind==='image'){
          if(!settings?.visionEndpoint)throw new Error('Vision/OCR endpoint не настроен')
          const file=new File([targetBlob],`instagram-${source.instagram.shortcode}-${Number(target.index)+1}.jpg`,{type:targetBlob.type||target.contentType||'image/jpeg'})
          const data=await analyzeVisualFile(file,settings.visionEndpoint)
          patches.push({index:target.index,patch:{ocrText:data.text||'',ocrSections:data.sections||[],ocrModel:data.model||null,processedAt:new Date().toISOString()}})
        }else if(target.kind==='video'){
          if(!settings?.transcribeEndpoint)throw new Error('Transcription endpoint не настроен')
          const file=new File([targetBlob],`instagram-${source.instagram.shortcode}-${Number(target.index)+1}.mp4`,{type:targetBlob.type||target.contentType||'video/mp4'})
          const queued=await enqueueMediaTranscription(file)
          const data=await runMediaTranscriptionJob(queued,settings.transcribeEndpoint)
          patches.push({index:target.index,patch:{transcriptText:data.text||'',transcriptSections:data.sections||[],transcriptModel:data.model||null,transcribedAt:data.transcribedAt||new Date().toISOString(),mediaJobId:queued.id}})
        }
      }
      if(patches.length)await onBatchSourceUpdated?.(patches)
    }finally{setBatchBusy(false);setBatchProgress('')}
  }
  const analyze=async mode=>{
    const input=instagramEvidenceDocument(source)
    if(!input){return}
    setAnalysisMode(mode);setAnalysisBusy(mode)
    try{
      const result=await runTask(settings,{action:instagramAnalysisAction(mode),input,system:instagramAnalysisSystem(mode)})
      await onInsightUpdated?.(mode,aiResultText(result))
    }finally{setAnalysisBusy('')}
  }
  const buildStructured=async()=>{
    const fallback=deterministicStructuredInstagram(source)
    setStructuredBusy(true)
    try{
      let structured=fallback
      const input=instagramEvidenceDocument(source)
      if(input&&settings?.aiEndpoint){
        try{
          const result=await runTask(settings,{action:`instagram-structured-${fallback.type}`,input,system:structuredExtractionSystem(fallback.type)})
          const parsed=result.origin===AI_ORIGIN.model?parseStructuredKnowledgeOutput(result.text,null):null
          if(parsed)structured=normalizeStructuredKnowledge({...parsed,generatedBy:'ai'},source)
        }catch{}
      }
      await onStructuredUpdated?.(structured)
    }finally{setStructuredBusy(false)}
  }
  const toggleOffline=async()=>{
    setOfflineBusy(true);setOfflineProgress('')
    try{
      if(source.instagram?.offlinePinned){
        await unpinInstagramSourceOffline(source.id)
        await onOfflinePinUpdated?.(false,{count:0,bytes:0})
      }else{
        const result=await pinInstagramSourceOffline(source,progress=>setOfflineProgress(`${progress.done}/${progress.total}`))
        await onOfflinePinUpdated?.(true,result)
      }
    }finally{setOfflineBusy(false);setOfflineProgress('')}
  }
  const structured=source.instagram?.structuredKnowledge||null
  const beginStructuredEdit=()=>{const draft={};for(const [key,entry] of Object.entries(structured?.fields||{}))draft[key]=Array.isArray(entry?.value)?entry.value.join('\n'):String(entry?.value||'');setStructuredDraft(draft);setStructuredEditing(true)}
  const saveStructuredEdit=async()=>{if(!structured)return;const updated=applyStructuredUserEdits(structured,structuredDraft);await onStructuredUpdated?.(updated);setStructuredEditing(false)}
  const insight=source.instagram?.insights?.[analysisMode]||''
  return <div className="instagramViewer">
    <div className="instagramHeader"><div><div className="row gap8"><span className="instagramBadge"><Icon name={source.instagram?.requestContext?.routeType==='reel'?'movie':'photo_camera'} size={17}/></span><strong>{source.instagram.owner?.username?`@${source.instagram.owner.username}`:'Instagram'}</strong></div><div className="tiny subtle" style={{marginTop:4}}>{source.instagram?.requestContext?.routeType==='reel'?'Reel':media.length>1?`Карусель · ${media.length} медиа`:(item.kind==='video'?'Видео':'Фото')}</div></div><a className="textAction" href={source.url} target="_blank" rel="noreferrer">Оригинал <Icon name="open_in_new" size={16}/></a></div>
    <div className={`instagramStage ${zoom?'zoomed':''}`} onDoubleClick={()=>item.kind==='image'&&setZoom(v=>!v)} onTouchStart={e=>{swipeStart.current=e.touches?.[0]?.clientX??null}} onTouchEnd={e=>{if(zoom||swipeStart.current==null||media.length<2)return;const end=e.changedTouches?.[0]?.clientX??swipeStart.current;const delta=end-swipeStart.current;swipeStart.current=null;if(Math.abs(delta)>45)setIndex(i=>delta<0?(i+1)%media.length:(i-1+media.length)%media.length)}}>
      {loading&&<div className="instagramLoading"><Icon name="progress_activity" size={30}/> Загружаю…</div>}
      {!loading&&blobUrl&&item.kind==='image'&&<img src={blobUrl} alt={item.alt||source.name} onClick={()=>setZoom(v=>!v)}/>} 
      {!loading&&blobUrl&&item.kind==='video'&&<video ref={videoRef} src={blobUrl} controls playsInline preload="metadata"/>}
      {media.length>1&&<><button className="instagramArrow prev" onClick={()=>setIndex(i=>(i-1+media.length)%media.length)} aria-label="Предыдущее"><Icon name="chevron_left" size={26}/></button><button className="instagramArrow next" onClick={()=>setIndex(i=>(i+1)%media.length)} aria-label="Следующее"><Icon name="chevron_right" size={26}/></button></>}
      <div className="instagramCounter">{index+1}/{media.length}</div>
    </div>
    {media.length>1&&<div className="instagramDots">{media.map((_,i)=><button key={i} className={i===index?'active':''} onClick={()=>setIndex(i)} aria-label={`Медиа ${i+1}`}/>)}</div>}
    <div className="instagramActions"><Button tone="tonal" icon={source.instagram.favorite?'star':'star_outline'} onClick={()=>onToggleFavorite?.(source)}>{source.instagram.favorite?'В избранном':'В избранное'}</Button><Button tone="tonal" icon="note_add" onClick={()=>onCreateNote?.(source)}>В заметку</Button><Button tone="tonal" icon="library_add" onClick={()=>onCreateMediaNote?.(source,index)}>Слайд → заметку</Button><Button tone="tonal" icon={source.instagram?.offlinePinned?'download_done':'download_for_offline'} onClick={toggleOffline} disabled={offlineBusy}>{offlineBusy?(offlineProgress||'Сохраняю…'):(source.instagram?.offlinePinned?'Офлайн ✓':'Сохранить офлайн')}</Button><Button tone="tonal" icon="download" onClick={save} disabled={!blobUrl}>Файл</Button><Button tone="tonal" icon={item.kind==='video'?'subtitles':'document_scanner'} onClick={extract} disabled={!blob||extractBusy}>{extractBusy?'Обрабатываю…':item.kind==='video'?(item.transcriptText?'Обновить расшифровку':'Расшифровать видео'):(item.ocrText?'Обновить OCR':'Текст с изображения')}</Button>{item.kind==='image'&&<Button tone="tonal" icon={zoom?'zoom_out':'zoom_in'} onClick={()=>setZoom(v=>!v)}>{zoom?'Уменьшить':'Увеличить'}</Button>}</div>
    {(item.ocrText||item.transcriptText)&&<div className="instagramOcr"><div className="tiny subtle">{item.kind==='video'?`РАСШИФРОВКА ВИДЕО ${index+1}`:`ТЕКСТ С ИЗОБРАЖЕНИЯ ${index+1}`}</div><pre>{item.transcriptText||item.ocrText}</pre></div>}
    {source.instagram.caption&&<div className="instagramCaption"><div className="tiny subtle">ОПИСАНИЕ ПОСТА</div><p>{source.instagram.caption}</p></div>}
    <div className="instagramKnowledgePanel">
      <div className="row space"><div><strong>Обработка поста</strong><div className="tiny subtle">{coverage.processed}/{coverage.processable||0} медиа · {coverage.percent}%</div></div><span className="instagramCoverage"><i style={{width:`${coverage.percent}%`}}/></span></div>
      <div className="instagramKnowledgeMeta"><span><Icon name="category" size={16}/>{classification.label}</span>{classification.confidence>0&&<span>{Math.round(classification.confidence*100)}%</span>}</div>
      {!coverage.complete&&coverage.processable>0&&<Button tone="tonal" icon="auto_fix_high" onClick={processAll} disabled={batchBusy}>{batchBusy?`Обрабатываю ${batchProgress}`:'Обработать весь пост'}</Button>}
      <div className="instagramStructuredHeader"><div><strong>Структурированные данные</strong><div className="tiny subtle">Рецепт, товар, место, книга, инструкция или набор идей с evidence</div></div><Button tone="tonal" icon="data_object" onClick={buildStructured} disabled={structuredBusy}>{structuredBusy?'Извлекаю…':structured?'Обновить':'Извлечь'}</Button></div>
      {structured&&<div className="instagramStructuredCard"><div className="row space"><span className="instagramObjectType"><Icon name="category" size={16}/>{structured.label}</span><div className="row gap8"><span className="tiny subtle">{Math.round((structured.confidence||0)*100)}% · {structured.generatedBy==='ai'?'AI + схема':structured.generatedBy==='user'?'изменено вручную':'локально'}</span>{structuredEditing?<><button className="textAction" onClick={saveStructuredEdit}>Сохранить</button><button className="textAction" onClick={()=>setStructuredEditing(false)}>Отмена</button></>:<button className="textAction" onClick={beginStructuredEdit}>Редактировать</button>}</div></div>{Object.entries(structured.fields||{}).map(([key,entry])=>{const value=entry?.value;if(!structuredEditing&&(Array.isArray(value)&&!value.length||!Array.isArray(value)&&!String(value||'').trim()))return null;return <div className="instagramStructuredField" key={key}><b>{structuredFieldLabel(key)}</b>{structuredEditing?<textarea className="instagramStructuredInput" value={structuredDraft[key]??''} onChange={e=>setStructuredDraft(d=>({...d,[key]:e.target.value}))} rows={Array.isArray(value)?Math.min(6,Math.max(2,(value||[]).length)):2}/>:Array.isArray(value)?<ul>{value.map((v,i)=><li key={i}>{v}</li>)}</ul>:<span>{String(value)}</span>}{!structuredEditing&&entry?.evidence?.length>0&&<small>{entry.evidence.join(' · ')}</small>}{!structuredEditing&&entry?.userEdited&&<small>Изменено пользователем · автоматическая evidence-привязка снята</small>}</div>})}</div>}
      <div className="instagramCollectionRow"><span className="tiny subtle">КОЛЛЕКЦИИ</span>{collectionSuggestions.map(name=><button key={name} className={source.instagram?.collections?.includes(name)?'active':''} onClick={()=>onToggleCollection?.(source,name)}>{source.instagram?.collections?.includes(name)?'✓ ':''}{name}</button>)}</div>
      {duplicates.some(x=>x.likelyDuplicate)&&<div className="instagramDuplicateNotice"><Icon name="content_copy" size={17}/><span>Похоже, в библиотеке уже есть очень близкий материал. NOTE2 отметит повтор при синтезе.</span></div>}
    </div>
    <div className="instagramInsights">
      <div className="row space"><div><strong>Выжимка и систематизация</strong><div className="tiny subtle">Caption + OCR + расшифровка видео, без домыслов</div></div></div>
      <div className="instagramInsightTabs"><button className={analysisMode==='brief'?'active':''} onClick={()=>analyze('brief')}>{analysisBusy==='brief'?'Готовлю…':'Кратко'}</button><button className={analysisMode==='detailed'?'active':''} onClick={()=>analyze('detailed')}>{analysisBusy==='detailed'?'Готовлю…':'Подробно'}</button><button className={analysisMode==='organize'?'active':''} onClick={()=>analyze('organize')}>{analysisBusy==='organize'?'Готовлю…':'Систематизировать'}</button></div>
      {insight?<pre className="instagramInsightOutput">{insight}</pre>:<div className="small subtle">Сначала извлеките текст с изображений и расшифруйте видео, затем выберите режим анализа. Описание поста уже учитывается.</div>}
    </div>
    {related.length>0&&<div className="instagramRelated"><div className="tiny subtle">СХОЖИЕ В БИБЛИОТЕКЕ</div>{related.map(({source:itemSource,score})=><div key={itemSource.id} className="instagramRelatedRow"><span>{itemSource.instagram?.owner?.username?`@${itemSource.instagram.owner.username}`:itemSource.name}</span><b>{Math.round(score*100)}%</b></div>)}</div>}
  </div>
}

function sourceDescriptionText(source={}){
  const provider=sourceProvider(source)
  if(provider==='instagram')return String(source.instagram?.caption||source.description||'').trim()
  if(provider==='youtube')return String(source.description||'').trim()
  return String(source.description||source.text||source.error||'').trim()
}
function sourceViewerEvidence(source={}){
  const sections=(source.sections||[]).filter(section=>String(section?.text||'').trim())
  if(sections.length)return sections.map((section,index)=>({ref:`S${index+1}`,sourceId:source.id,sourceName:source.name||source.title||'Источник',sectionLabel:section.label||'',locator:section.locator||{},text:String(section.text||'').trim(),score:1}))
  const text=String(source.text||'').trim()
  return text?[{ref:'S1',sourceId:source.id,sourceName:source.name||source.title||'Источник',sectionLabel:'Текст источника',locator:{},text,score:1}]:[]
}
function sourceViewerPrompt(source={}){
  const evidence=sourceViewerEvidence(source)
  return evidence.map(item=>`[${item.ref}] ${locatorLabel(item.locator,item.sectionLabel)||item.sectionLabel||'фрагмент'}\n${item.text}`).join('\n\n')
}
function sourceViewerSummary(source={}){
  if(sourceProvider(source)==='instagram')return String(source.instagram?.insights?.brief||source.insights?.brief||'').trim()
  return String(source.insights?.brief||source.summary||'').trim()
}

function InstagramSourceRenderer({source,locator=null}){
  const media=source?.instagram?.media||[]
  const requested=Number.isInteger(Number(locator?.instagramItem))?Number(locator.instagramItem):(Number(source?.instagram?.requestedMediaIndex)||0)
  const[index,setIndex]=useState(()=>Math.min(Math.max(requested,0),Math.max(0,media.length-1)))
  const[blobUrl,setBlobUrl]=useState('')
  const[loading,setLoading]=useState(false)
  const[zoom,setZoom]=useState(false)
  const videoRef=useRef(null)
  const item=media[index]||null
  useEffect(()=>{const next=Number.isInteger(Number(locator?.instagramItem))?Number(locator.instagramItem):(Number(source?.instagram?.requestedMediaIndex)||0);setIndex(Math.min(Math.max(next,0),Math.max(0,media.length-1)));setZoom(false)},[source?.id,locator?.instagramItem,source?.instagram?.requestedMediaIndex,media.length])
  useEffect(()=>{let objectUrl='';let cancelled=false;const load=async()=>{setLoading(true);setBlobUrl('');if(!item){setLoading(false);return}try{const loaded=await loadInstagramMediaBlob(source,item.index);if(cancelled)return;objectUrl=URL.createObjectURL(loaded.blob);setBlobUrl(objectUrl)}catch{}finally{if(!cancelled)setLoading(false)}};load();return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[source?.id,item?.index,item?.archiveUrl,source?.instagram?.offlinePinned])
  useEffect(()=>{const el=videoRef.current;if(!el||item?.kind!=='video'||!Number.isFinite(Number(locator?.startSeconds)))return;const seek=()=>{try{el.currentTime=Math.max(0,Number(locator.startSeconds)||0);el.play?.().catch?.(()=>{})}catch{}};el.addEventListener('loadedmetadata',seek,{once:true});if(el.readyState>=1)seek();return()=>el.removeEventListener('loadedmetadata',seek)},[blobUrl,index,locator?.startSeconds,item?.kind])
  if(!media.length)return <div className="sourceMediaEmpty"><Icon name="cloud_off" size={34}/><strong>Ссылка сохранена</strong><p>{source.error||'Медиа ещё не получены. NOTE2 сохранит источник и повторит обработку, когда провайдер будет доступен.'}</p></div>
  return <div className={`sourceInstagramStage ${zoom?'zoomed':''}`}>
    {loading&&<div className="sourceMediaLoading"><Icon name="progress_activity" size={28}/> Загружаю…</div>}
    {!loading&&blobUrl&&item?.kind==='image'&&<img src={blobUrl} alt={item.alt||source.name} onDoubleClick={()=>setZoom(v=>!v)} onClick={()=>setZoom(v=>!v)}/>} 
    {!loading&&blobUrl&&item?.kind==='video'&&<video ref={videoRef} src={blobUrl} controls playsInline preload="metadata"/>}
    {!loading&&!blobUrl&&<div className="sourceMediaEmpty"><Icon name={item?.kind==='video'?'play_circle':'image'} size={36}/><strong>Медиа недоступно локально</strong><p>Оригинал и evidence-данные источника остаются сохранены.</p></div>}
    {media.length>1&&<><button className="sourceMediaArrow prev" onClick={()=>{setIndex(i=>(i-1+media.length)%media.length);setZoom(false)}} aria-label="Предыдущее"><Icon name="chevron_left" size={28}/></button><button className="sourceMediaArrow next" onClick={()=>{setIndex(i=>(i+1)%media.length);setZoom(false)}} aria-label="Следующее"><Icon name="chevron_right" size={28}/></button><div className="sourceMediaCounter">{index+1}/{media.length}</div><div className="sourceMediaDots">{media.map((_,i)=><button key={i} className={i===index?'active':''} onClick={()=>{setIndex(i);setZoom(false)}} aria-label={`Медиа ${i+1}`}/>)}</div></>}
  </div>
}

function YouTubeSourceRenderer({source,locator=null}){
  const frameRef=useRef(null)
  const videoId=source?.provenance?.videoId||source?.providerId
  const initial=Math.max(0,Math.floor(Number(source?.captureContext?.startSeconds)||0))
  useEffect(()=>{const seconds=Number(locator?.startSeconds);if(!Number.isFinite(seconds)||!frameRef.current?.contentWindow)return;const command=()=>{try{frameRef.current.contentWindow.postMessage(JSON.stringify({event:'command',func:'seekTo',args:[Math.max(0,seconds),true]}),'*')}catch{}};command();const a=setTimeout(command,250),b=setTimeout(command,900);return()=>{clearTimeout(a);clearTimeout(b)}},[locator?.startSeconds,videoId])
  if(!videoId)return <div className="sourceMediaEmpty"><Icon name="smart_display" size={38}/><strong>YouTube ID не найден</strong><p>Ссылка сохранена, но плеер пока невозможно открыть.</p></div>
  return <div className="sourceYouTubeStage"><iframe ref={frameRef} title={source.name||'YouTube'} src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&start=${initial}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div>
}

function PdfSourceRenderer({source,locator=null}){
  const pages=useMemo(()=>{const grouped=new Map();for(const section of source?.sections||[]){const page=Number(section?.locator?.page);if(!Number.isFinite(page))continue;const list=grouped.get(page)||[];list.push(section);grouped.set(page,list)}return [...grouped.entries()].sort((a,b)=>a[0]-b[0])},[source])
  const requested=Number(locator?.page)
  const[pageIndex,setPageIndex]=useState(()=>Math.max(0,pages.findIndex(([page])=>page===requested)))
  useEffect(()=>{if(!pages.length)return;const found=pages.findIndex(([page])=>page===Number(locator?.page));if(found>=0)setPageIndex(found)},[locator?.page,pages.length])
  if(!pages.length)return <div className="sourceDocumentStage"><Icon name="picture_as_pdf" size={42}/><strong>{source.name}</strong><p>{String(source.text||'Текст PDF пока не извлечён.').slice(0,900)}</p></div>
  const[page,sections]=pages[Math.min(pageIndex,pages.length-1)]
  return <div className="sourceDocumentStage"><div className="sourceDocumentBar"><button disabled={pageIndex<=0} onClick={()=>setPageIndex(i=>Math.max(0,i-1))}><Icon name="chevron_left" size={21}/></button><b>Страница {page}</b><button disabled={pageIndex>=pages.length-1} onClick={()=>setPageIndex(i=>Math.min(pages.length-1,i+1))}><Icon name="chevron_right" size={21}/></button></div><div className="sourceDocumentText">{sections.map((section,i)=><p key={i}>{section.text}</p>)}</div></div>
}

function LocalMediaSourceRenderer({source,locator=null}){
  const mediaRef=useRef(null)
  const[url,setUrl]=useState('')
  useEffect(()=>{let objectUrl='';let cancelled=false;const load=async()=>{const jobId=source?.provenance?.mediaJobId;if(!jobId)return;try{const job=await getMediaJob(jobId);if(cancelled||!job?.file)return;objectUrl=URL.createObjectURL(job.file);setUrl(objectUrl)}catch{}};load();return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);setUrl('')}},[source?.provenance?.mediaJobId])
  useEffect(()=>{const el=mediaRef.current;const seconds=Number(locator?.startSeconds);if(!el||!Number.isFinite(seconds))return;const seek=()=>{try{el.currentTime=Math.max(0,seconds);el.play?.().catch?.(()=>{})}catch{}};el.addEventListener('loadedmetadata',seek,{once:true});if(el.readyState>=1)seek();return()=>el.removeEventListener('loadedmetadata',seek)},[url,locator?.startSeconds])
  if(!url)return <div className="sourceMediaEmpty"><Icon name={source.kind==='video'?'movie':'graphic_eq'} size={38}/><strong>{source.name}</strong><p>Локальный media job недоступен на этом устройстве. Транскрипт и evidence остаются в Source Vault.</p></div>
  return <div className="sourceLocalMediaStage">{source.kind==='video'?<video ref={mediaRef} controls playsInline src={url}/>:<audio ref={mediaRef} controls src={url}/>}</div>
}

function SourcePreview({selection,onClose,settings,onSourceUpdated,onBatchSourceUpdated,onToggleFavorite,onCreateNote,onCreateMediaNote,onInsightUpdated,onSummaryUpdated,onToggleCollection,onStructuredUpdated,onOfflinePinUpdated,instagramSources=[],notes=[]}){
  const source=selection?.source||selection
  const initialLocator=selection?.locator||null
  const excerpt=selection?.excerpt||''
  const[tab,setTab]=useState('description')
  const[activeLocator,setActiveLocator]=useState(initialLocator)
  const[summary,setSummary]=useState(()=>sourceViewerSummary(source||{}))
  const[summaryBusy,setSummaryBusy]=useState(false)
  const[toolsOpen,setToolsOpen]=useState(false)
  const[advancedOpen,setAdvancedOpen]=useState(false)
  useEffect(()=>{setTab('description');setActiveLocator(initialLocator);setSummary(sourceViewerSummary(source||{}));setToolsOpen(false);setAdvancedOpen(false)},[source?.id,initialLocator?.page,initialLocator?.startSeconds,initialLocator?.instagramItem])
  if(!selection||!source)return null
  const provider=sourceProvider(source)
  const view=unifiedSourceView(source)
  const evidence=sourceViewerEvidence(source)
  const description=sourceDescriptionText(source)||'Описание отсутствует.'
  const linkedNotes=(notes||[]).filter(note=>String(note.content||'').includes(`source:${source.id}`)||source.url&&String(note.content||'').includes(source.url))
  const makeSummary=async()=>{const input=sourceViewerPrompt(source);if(!input)return;setSummaryBusy(true);try{const out=aiResultText(await runTask(settings,{action:'source-brief',input,system:'Сделай краткую выжимку только из предоставленных фрагментов. Пиши на русском. Для каждого существенного тезиса используй ссылки [S1], [S2] и т.д. Не добавляй внешние факты и не выдумывай содержимое отсутствующих фрагментов.'}));setSummary(out);await onSummaryUpdated?.(source,out)}finally{setSummaryBusy(false)}}
  const openEvidence=item=>{setActiveLocator(item?.locator||null);setTab('text')}
  const renderMedia=()=>{
    if(provider==='instagram')return <InstagramSourceRenderer source={source} locator={activeLocator}/>
    if(provider==='youtube')return <YouTubeSourceRenderer source={source} locator={activeLocator}/>
    if(source.kind==='pdf')return <PdfSourceRenderer source={source} locator={activeLocator}/>
    if(['audio','video'].includes(source.kind))return <LocalMediaSourceRenderer source={source} locator={activeLocator}/>
    return <div className="sourceReaderStage"><div className={`unifiedSourceIcon ${provider}`}><Icon name={sourceIcon(source.kind)} size={32}/></div><strong>{view.title}</strong><p>{description.slice(0,900)}</p></div>
  }
  return <div className="sourceViewerBackdrop" onClick={onClose}><section className="sourceViewerShell" onClick={e=>e.stopPropagation()}>
    <header className="sourceViewerHeader"><button className="iconBtn" onClick={onClose} aria-label="Назад"><Icon name="arrow_back"/></button><div className="sourceViewerIdentity"><strong>{view.title}</strong><span>{sourceProviderLabel(provider)}{view.author?` · ${view.author}`:''}</span></div><button className="iconBtn" onClick={()=>setToolsOpen(true)} aria-label="Ещё"><Icon name="more_horiz"/></button></header>
    <div className="sourceViewerMedia">{renderMedia()}</div>
    <div className="sourceViewerIntro"><h2>{view.title}</h2><p>{description}</p><div className="sourceViewerMeta">{sourceProviderLabel(provider)}{source.duration?` · ${secondsLabel(source.duration)}`:''}{source.pageCount?` · ${source.pageCount} стр.`:''}{view.offline==='media-offline'?' · офлайн':''}</div></div>
    <div className="sourceViewerQuick"><button onClick={()=>onToggleFavorite?.(source)}><Icon name={view.favorite?'star':'star_outline'} size={18}/>{view.favorite?'В избранном':'В избранное'}</button><button onClick={()=>onCreateNote?.(source)}><Icon name="note_add" size={18}/>В заметку</button>{source.url&&<a href={source.url} target="_blank" rel="noreferrer"><Icon name="open_in_new" size={18}/>Оригинал</a>}</div>
    <nav className="sourceViewerTabs">{[['description','Описание'],['text','Текст'],['summary','Выжимка'],['notes','Заметки']].map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <div className="sourceViewerBody">
      {tab==='description'&&<div className="sourceViewerDescription"><h3>Оригинальное описание</h3><p>{description}</p>{source.url&&<div className="sourceViewerOriginalUrl">{source.url}</div>}</div>}
      {tab==='text'&&<div><div className="row space"><h3>Извлечённый текст</h3><span className="tiny subtle">{evidence.length} фрагм.</span></div>{evidence.length?<div className="sourceTextSegments">{evidence.map(item=><button key={item.ref} className={`sourceTextSegment ${activeLocator&&JSON.stringify(activeLocator)===JSON.stringify(item.locator)?'active':''}`} onClick={()=>setActiveLocator(item.locator)}><span className="sourceTextLocator">{locatorLabel(item.locator,item.sectionLabel)||item.sectionLabel||item.ref}</span><span><HighlightedText text={item.text} excerpt={excerpt}/></span></button>)}</div>:<pre className="sourcePlainText"><HighlightedText text={source.text||source.error||'Текст пока не извлечён.'} excerpt={excerpt}/></pre>}</div>}
      {tab==='summary'&&<div><div className="row space"><h3>Краткая выжимка</h3><button className="textAction" disabled={summaryBusy} onClick={makeSummary}>{summaryBusy?'Готовлю…':summary?'Обновить':'Создать'}</button></div>{summary?<div className="sourceSummaryBox"><CitedText text={summary} evidence={evidence} onCitation={openEvidence}/></div>:<div className="sourceViewerEmpty">NOTE2 сделает выжимку только по реально сохранённому тексту источника и сохранит переходы к доказательствам.</div>}</div>}
      {tab==='notes'&&<div><div className="row space"><h3>Связанные заметки</h3><button className="textAction" onClick={()=>onCreateNote?.(source)}>＋ Создать</button></div>{linkedNotes.length?<div className="sourceLinkedNotes">{linkedNotes.map(note=><div key={note.id}><strong>{note.title||'Без названия'}</strong><p>{stripMarkdown(note.content||'').slice(0,170)}</p></div>)}</div>:<div className="sourceViewerEmpty">Заметок по этому источнику пока нет. Ваши записи будут храниться отдельно от оригинального материала.</div>}</div>}
    </div>
    {toolsOpen&&<div className="sourceToolsBackdrop" onClick={()=>setToolsOpen(false)}><div className="sourceToolsSheet" onClick={e=>e.stopPropagation()}><div className="captureGrab"/><h3>Действия с источником</h3><button onClick={()=>{setToolsOpen(false);onCreateNote?.(source)}}><Icon name="note_add" size={20}/>Создать заметку</button><button onClick={()=>{setToolsOpen(false);setTab('summary');if(!summary)makeSummary()}}><Icon name="summarize" size={20}/>Сделать выжимку</button>{provider==='instagram'&&<button onClick={()=>{setToolsOpen(false);setAdvancedOpen(v=>!v)}}><Icon name="tune" size={20}/>Инструменты Instagram</button>}{source.url&&<a href={source.url} target="_blank" rel="noreferrer"><Icon name="open_in_new" size={20}/>Открыть оригинал</a>}<button onClick={()=>setToolsOpen(false)}><Icon name="close" size={20}/>Закрыть</button></div></div>}
    {advancedOpen&&provider==='instagram'&&<div className="sourceAdvancedPanel"><div className="row space"><div><strong>Дополнительные инструменты</strong><div className="tiny subtle">OCR, офлайн, структура и систематизация</div></div><button className="iconBtn" onClick={()=>setAdvancedOpen(false)}><Icon name="close"/></button></div><InstagramPostViewer source={source} settings={settings} onSourceUpdated={onSourceUpdated} onBatchSourceUpdated={onBatchSourceUpdated} onToggleFavorite={onToggleFavorite} onCreateNote={onCreateNote} onCreateMediaNote={onCreateMediaNote} onInsightUpdated={onInsightUpdated} onToggleCollection={onToggleCollection} onStructuredUpdated={onStructuredUpdated} onOfflinePinUpdated={onOfflinePinUpdated} instagramSources={instagramSources} locator={activeLocator}/></div>}
  </section></div>
}
function CitedText({text='',evidence=[],onCitation}){const byRef=new Map((evidence||[]).map(item=>[item.ref,item]));const parts=String(text).split(/(\[S\d+\])/g);return <div className="citedText">{parts.map((part,index)=>{const match=part.match(/^\[S(\d+)\]$/);if(!match)return <React.Fragment key={index}>{part}</React.Fragment>;const ref=`S${match[1]}`;const item=byRef.get(ref);return <button key={`${ref}-${index}`} className="citationChip" title={item?`${item.sourceName}${locatorLabel(item.locator,item.sectionLabel)?` · ${locatorLabel(item.locator,item.sectionLabel)}`:''}`:`Evidence ${ref}`} onClick={()=>item&&onCitation?.(item)}>{part}</button>})}</div>}

export default function App(){
  const [page,setPage]=useState('dashboard')
  const [editingId,setEditingId]=useState(null)
  const [drawer,setDrawer]=useState(false)
  const [workspace,setWorkspace]=useState(()=>loadWorkspace())
  const [settings,setSettings]=useState(()=>loadSettings())
  const [online,setOnline]=useState(navigator.onLine)
  const [installEvent,setInstallEvent]=useState(null)
  const [toast,setToast]=useState('')
  const [captureOpen,setCaptureOpen]=useState(false)
  const fabHidden=useScrollDirection()
  const [capturePayload,setCapturePayload]=useState(null)

  useEffect(()=>{let live=true;getCredential('noteai-account-session-v1').then(token=>{if(live&&token)setApiSessionAuth(token,settings.accountEndpoint||'/api/account')}).catch(()=>{});return()=>{live=false}},[])

  // If a gateway is serving this app, wire up exactly the capabilities it
  // reports. Endpoints default to empty because a preset path nobody serves
  // means a failed request on every import — but empty also means the user has
  // to type '/api/ai' to reach features that are already running one origin
  // away. Asking /api/health settles it, and a capability the gateway reports
  // as unavailable stays unset so the UI keeps showing it as unavailable.
  useEffect(()=>{
    let live=true
    discoverGateway(loadSettings()).then(({patch})=>{
      if(live&&Object.keys(patch).length)setSettings(current=>({...current,...patch}))
    }).catch(()=>{})
    return()=>{live=false}
  },[])
  useEffect(()=>saveWorkspace(workspace),[workspace])
  useEffect(()=>saveSettings(settings),[settings])
  // The app is light-only by product decision. What used to be a light/dark
  // switch is now a choice between three light visual styles; the system
  // colour-scheme preference is deliberately not consulted.
  useEffect(()=>{
    document.documentElement.dataset.style=APP_STYLES.some(s=>s[0]===settings.style)?settings.style:APP_STYLES[0][0]
  },[settings.style])
  useEffect(()=>{
    document.documentElement.dataset.fontScale=settings.fontScale||'normal'
    document.documentElement.dataset.density=settings.density||'compact'
  },[settings.fontScale,settings.density])
  useEffect(()=>{
    const on=()=>setOnline(true), off=()=>setOnline(false)
    addEventListener('online',on);addEventListener('offline',off)
    const before=e=>{e.preventDefault();setInstallEvent(e)}
    addEventListener('beforeinstallprompt',before)
    return()=>{removeEventListener('online',on);removeEventListener('offline',off);removeEventListener('beforeinstallprompt',before)}
  },[])
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(''),2200); return()=>clearTimeout(t)},[toast])
  useEffect(()=>{let cleanup=()=>{};let live=true;installUniversalShareTargetListener(async(descriptor)=>{try{const pending=createPendingSourceFromDescriptor(descriptor);if(pending)await saveSourceWithChunks(pending,[])}catch(error){console.warn('NOTE2 shared source save failed',error)};setEditingId(null);setPage('analysis');window.dispatchEvent(new CustomEvent('note2:source-shared',{detail:{descriptor}}));if(descriptor.provider==='instagram'){try{localStorage.setItem('note2-pending-instagram-share',descriptor.sharedUrl)}catch{};window.dispatchEvent(new CustomEvent('note2:instagram-share',{detail:{url:descriptor.sharedUrl}}))}setToast(`${sourceProviderLabel(descriptor.provider)} сохранён в Источники`)}).then(fn=>{if(live)cleanup=fn;else fn?.()});return()=>{live=false;cleanup?.()}},[])

  const navigate=(id)=>{setDrawer(false);setEditingId(null);setPage(id)}
  const openEditor=(id)=>{setEditingId(id);setPage('editor')}
  const newNote=()=>{
    setCaptureOpen(false)
    const now=Date.now(); const id=crypto.randomUUID?.()||String(now)
    const note={id,title:'Untitled',content:'',tags:[],pinned:false,folder:'Uncategorized',createdAt:now,updatedAt:now}
    setWorkspace(w=>({...w,notes:[note,...w.notes]}));openEditor(id)
  }
  const install=async()=>{ if(!installEvent)return; await installEvent.prompt(); await installEvent.userChoice; setInstallEvent(null) }
  const captureFiles=files=>{
    const picked=[...(files||[])].filter(Boolean);if(!picked.length)return
    setCaptureOpen(false);setCapturePayload({id:Date.now(),type:'files',files:picked});setEditingId(null);setPage('analysis')
  }
  const captureLink=value=>{
    const url=String(value||'').trim();if(!url)return
    setCaptureOpen(false);setCapturePayload({id:Date.now(),type:'link',url});setEditingId(null);setPage('analysis')
  }
  const clearCapturePayload=()=>setCapturePayload(null)
  const openCapture=()=>setCaptureOpen(true)

  const ctx={workspace,setWorkspace,settings,setSettings,navigate,openEditor,setToast,newNote,openCapture,capturePayload,clearCapturePayload}
  const title=page==='editor'?'Заметка':(NAV.find(x=>x[0]===page)?.[1]||'NOTE2')

  return <div className="app">
    <Sidebar page={page} navigate={navigate} settings={settings} online={online}/>
    {drawer && <><div className="drawerBackdrop" onClick={()=>setDrawer(false)}/><div className="drawer glass"><SidebarContent page={page} navigate={navigate} settings={settings} online={online}/></div></>}
    <main className="main">
      {page!=='editor' && <Header title={title} onMenu={()=>setDrawer(true)} online={online} installEvent={installEvent} install={install}/>} 
      <PageRouter page={page} editingId={editingId} {...ctx}/>
    </main>
    {page!=='editor' && <button className={`fab knowledgeCapture ${fabHidden?'fabHidden':''}`} onClick={()=>setCaptureOpen(true)} aria-label="Добавить"><Icon name="add" size={29}/></button>}
    <BottomNav page={page} navigate={navigate}/>
    <CaptureSheet open={captureOpen} onClose={()=>setCaptureOpen(false)} newNote={newNote} navigate={navigate} onFiles={captureFiles} onLink={captureLink}/>
    {toast && <div className="toast">{toast}</div>}
  </div>
}

function Sidebar({page,navigate,settings,online}){ return <aside className="sidebar glass"><SidebarContent page={page} navigate={navigate} settings={settings} online={online}/></aside> }
function SidebarContent({page,navigate,settings,online}){ return <>
  <div className="brand"><div className="brandMark">N²</div><div className="brandText">NOTE2 <span className="subtle small">личное пространство знаний</span></div></div>
  <nav className="nav">{NAV.map(([id,label,icon])=><button key={id} className={`navBtn ${page===id?'active':''}`} onClick={()=>navigate(id)}><Icon name={icon}/><span className="navLabel">{label}</span></button>)}</nav>
  <div className="sidebarFooter"><div className="profile"><div className="avatar">{(settings.profile?.name||'U')[0]}</div><div className="profileMeta"><div style={{fontSize:13,fontWeight:600}}>{settings.profile?.name||'Локальный профиль'}</div><div className="row gap8 tiny subtle"><span className={`statusDot ${online?'':'offline'}`}/>{online?'В сети':'Офлайн'}</div></div></div></div>
</>}
function Header({title,onMenu,online,installEvent,install}){return <header className={`header glass ${installEvent?'headerHasAction':''}`}><div className="row gap8"><button className="iconBtn" onClick={onMenu} aria-label="Меню"><Icon name="menu"/></button><div className="headerTitle">{title}</div></div><div className="headerActions"><div className="row gap8 small subtle desktopOnly"><span className={`statusDot ${online?'':'offline'}`}/>{online?'Подключено':'Офлайн'}</div>{installEvent&&<Button tone="tonal" icon="install_mobile" onClick={install}>Установить</Button>}</div></header>}
function BottomNav({page,navigate}){return <nav className="bottomNav glass" aria-label="Основная навигация">{NAV.filter(x=>MOBILE.includes(x[0])).map(([id,label,icon])=><button key={id} onClick={()=>navigate(id)} className={page===id?'active':''} aria-label={label}><Icon name={icon} size={25}/><span>{label}</span></button>)}</nav>}
function CaptureSheet({open,onClose,newNote,navigate,onFiles,onLink}){
  const imageRef=useRef(null),videoRef=useRef(null),audioRef=useRef(null),fileRef=useRef(null)
  const[link,setLink]=useState('')
  useEffect(()=>{if(!open)setLink('')},[open])
  if(!open)return null
  const go=id=>{onClose();navigate(id)}
  const submitLink=()=>{if(!link.trim())return;onLink?.(link.trim());setLink('')}
  const pick=(ref)=>ref.current?.click()
  const chosen=e=>{const files=[...(e.target.files||[])];e.target.value='';if(files.length)onFiles?.(files)}
  const pasteLink=async()=>{try{const value=await navigator.clipboard?.readText?.();if(value)setLink(value.trim())}catch{}}
  return <div className="captureBackdrop" onClick={onClose}><section className="captureSheet glass captureSheetActive" onClick={e=>e.stopPropagation()}>
    <div className="captureGrab"/>
    <div className="row space captureTitle"><div><div className="tiny subtle">БЫСТРОЕ ДОБАВЛЕНИЕ</div><h2>Добавить в NOTE2</h2></div><button className="iconBtn" onClick={onClose} aria-label="Закрыть"><Icon name="close"/></button></div>
    <div className="captureChoices captureChoicesActive">
      <button onClick={newNote}><KnowledgeObject kind="note" seed="note" size="sm"/><span>Заметка</span><small>Новый текст</small></button>
      <button onClick={()=>go('tasks')}><KnowledgeObject kind="task" seed="task" size="sm"/><span>Задача</span><small>Срок и приоритет</small></button>
      <button onClick={()=>go('media')}><KnowledgeObject kind="audio" seed="voice" size="sm"/><span>Записать</span><small>Голосовая заметка</small></button>
      <button onClick={()=>pick(imageRef)}><KnowledgeObject kind="image" seed="photo" size="sm"/><span>Фото / скан</span><small>Камера или галерея</small></button>
      <button onClick={()=>pick(videoRef)}><KnowledgeObject kind="video" seed="video" size="sm"/><span>Видео</span><small>Файл с устройства</small></button>
      <button onClick={()=>pick(audioRef)}><KnowledgeObject kind="audio" seed="audio" size="sm"/><span>Аудио</span><small>Файл с устройства</small></button>
      <button onClick={()=>pick(fileRef)}><KnowledgeObject kind="pdf" seed="file" size="sm"/><span>Документ</span><small>PDF, Office, книга</small></button>
      <button onClick={()=>go('youtube')}><KnowledgeObject kind="video" seed="youtube" size="sm"/><span>YouTube</span><small>Субтитры и разбор</small></button>
      <button onClick={()=>go('studio')}><KnowledgeObject kind="note" seed="studio" size="sm"/><span>Разобрать текст</span><small>Без сохранения</small></button>
    </div>
    <div className="captureLinkBox">
      <div className="captureLinkTitle"><Icon name="link" size={22}/><div><strong>Ссылка</strong><small>Instagram, YouTube или веб-страница</small></div></div>
      <div className="captureLinkRow"><Input value={link} onChange={e=>setLink(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitLink()}} placeholder="Вставьте ссылку…" autoCapitalize="none" autoCorrect="off"/><button className="capturePaste" onClick={pasteLink} aria-label="Вставить из буфера"><Icon name="content_paste" size={19}/></button><Button icon="add_link" onClick={submitLink} disabled={!link.trim()}>Сохранить</Button></div>
    </div>
    <input ref={imageRef} className="hiddenFile" type="file" accept="image/*" multiple onChange={chosen}/>
    <input ref={videoRef} className="hiddenFile" type="file" accept="video/*" multiple onChange={chosen}/>
    <input ref={audioRef} className="hiddenFile" type="file" accept="audio/*" multiple onChange={chosen}/>
    <input ref={fileRef} className="hiddenFile" type="file" accept=".pdf,.docx,.pptx,.xlsx,.odt,.ods,.odp,.epub,.txt,.md,.csv,.json,.html,.htm,.xml,.yaml,.yml,text/*,application/pdf" multiple onChange={chosen}/>
    <p className="tiny subtle captureHint">После выбора файл сразу попадает в «Источники». OCR, транскрипция и индексация запускаются существующим pipeline автоматически.</p>
  </section></div>
}

function PageRouter(props){
  switch(props.page){
    case'dashboard':return <Dashboard {...props}/>;case'library':return <Library {...props}/>;case'editor':return <Editor {...props}/>;case'chat':return <Chat {...props}/>;
    case'analysis':return <Analysis {...props}/>;case'studio':return <Studio {...props}/>;case'media':return <Media {...props}/>;case'youtube':return <YouTube {...props}/>;
    case'search':return <Search {...props}/>
    // Задачи и карта тем стали видами «Заметок». Маршруты сохранены, чтобы
    // существующие ссылки (например «Все задачи» с главной) вели туда же.
    case'tasks':return <Library {...props} initialSection="tasks"/>;case'graph':return <Library {...props} initialSection="graph"/>
    case'settings':return <Settings {...props}/>;default:return <Dashboard {...props}/>
  }
}

function Dashboard({workspace,navigate,openEditor,newNote,openCapture}){
  const notes=workspace.notes||[]
  const ordered=[...notes].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.updatedAt-a.updatedAt)
  const daily=ordered[0]||null
  // The rail must not repeat the note already shown in full above it; showing
  // the same note twice on one screen was the most visible redundancy here.
  const recent=ordered.slice(1,6)
  const openTasks=(workspace.tasks||[]).filter(task=>!task.done).slice(0,4)
  const now=new Date()
  const hour=now.getHours()
  const greeting=hour<12?'Доброе утро':hour<18?'Добрый день':'Добрый вечер'
  const dayLabel=now.toLocaleDateString('ru-RU',{weekday:'long',month:'long',day:'numeric'})
  // A line the user can act on, instead of the landing-page slogan that used to
  // sit here: it says what is actually in the workspace right now.
  const [sourceCount,setSourceCount]=useState(null)
  useEffect(()=>{let live=true;listSources().then(list=>{if(live)setSourceCount(list.length)}).catch(()=>{if(live)setSourceCount(0)});return()=>{live=false}},[])
  const summaryLine=notes.length||openTasks.length||sourceCount
    ? [notesLabel(notes.length), sourceCount===null?null:sourcesLabel(sourceCount), openTasks.length?tasksLabel(openTasks.length)+' в работе':null].filter(Boolean).join(' · ')
    : 'Пусто. Начните с заметки или добавьте источник.'
  return <div className="page todayPage yandexDensity">
    <section className="todayCompactHeader">
      <div className="eyebrow">{dayLabel}</div>
      <h1>{greeting}</h1>
      <p>{summaryLine}</p>
    </section>

    <section className="quickActionsFlat" aria-label="Быстрые действия">
      <button onClick={newNote}><KnowledgeObject kind="note" seed="hero-note" size="lg"/><span>Заметка</span></button>
      <button onClick={openCapture}><KnowledgeObject kind="pdf" seed="hero-file" size="lg"/><span>Добавить</span></button>
      <button onClick={openCapture}><KnowledgeObject kind="audio" seed="hero-voice" size="lg"/><span>Медиа</span></button>
      <button onClick={()=>navigate('search')}><KnowledgeObject kind="search" seed="hero-search" size="lg"/><span>Поиск</span></button>
    </section>

    <section className="todaySection">
      <div className="sectionHeader"><div><div className="eyebrow">СЕГОДНЯ</div><h2>{daily?'Продолжить заметку':'Начать заметку'}</h2></div>{daily&&<button className="textAction" onClick={()=>openEditor(daily.id)}>Открыть <Icon name="arrow_forward" size={18}/></button>}</div>
      <article className="dailySurface" onClick={()=>daily&&openEditor(daily.id)} role={daily?'button':undefined} tabIndex={daily?0:undefined}>
        {daily?<><div className="dailyMeta"><KnowledgeObject kind="note" seed={daily.id} size="sm"/><div><strong>{daily.title||'Без названия'}</strong><span>{formatDate(daily.updatedAt)} · {countWords(daily.content)} слов{daily.pinned?' · закреплено':''}</span></div></div><p>{stripMarkdown(daily.content).slice(0,420)||'Пустая заметка — нажмите, чтобы продолжить.'}</p></>:<div className="todayEmpty"><KnowledgeObject kind="note" seed="first-note"/><div><strong>Здесь появится ваша первая заметка.</strong><p>NOTE2 не заполняет пространство демонстрационными данными.</p><Button icon="add" onClick={newNote}>Создать заметку</Button></div></div>}
      </article>
    </section>

    <section className="todaySection">
      <div className="sectionHeader"><div><div className="eyebrow">НЕДАВНЕЕ</div><h2>Продолжить работу</h2></div><button className="textAction" onClick={()=>navigate('library')}>Все заметки <Icon name="arrow_forward" size={18}/></button></div>
      <div className="continueRail">{recent.length?recent.map(note=><button className="continueItem" key={note.id} onClick={()=>openEditor(note.id)}><KnowledgeObject kind="note" seed={note.id} size="md"/><div className="continueText"><strong>{note.title||'Без названия'}</strong><span>{stripMarkdown(note.content).slice(0,86)||'Пустая заметка'}</span><small>{formatDate(note.updatedAt)}</small></div></button>):<button className="continueItem emptyContinue" onClick={()=>navigate('analysis')}><KnowledgeObject kind="pdf" seed="source" size="md"/><div className="continueText"><strong>Добавьте первый источник</strong><span>PDF, документ, изображение, аудио, видео или ссылка.</span><small>Источники</small></div></button>}</div>
    </section>

    <section className="todaySection todayReview">
      <div className="sectionHeader"><div><div className="eyebrow">ЗАДАЧИ</div><h2>Требует внимания</h2></div>{openTasks.length>0&&<button className="textAction" onClick={()=>navigate('tasks')}>Все задачи <Icon name="arrow_forward" size={18}/></button>}</div>
      <div className="reviewSurface">{openTasks.length?openTasks.map(task=><button className="reviewItem" key={task.id} onClick={()=>navigate('tasks')}><span className="reviewCheck"/><span>{task.text||task.title||'Без названия'}</span><Icon name="chevron_right" size={20}/></button>):<div className="reviewClear"><span className="reviewOrb"><Icon name="check" size={20}/></span><div><strong>На сегодня всё спокойно.</strong><p>Открытые задачи и ошибки обработки появятся здесь только когда потребуется действие.</p></div></div>}</div>
    </section>
  </div>
}
// Дата стоит в строке меты, а не отдельной колонкой справа.
//
// Раньше дата и корзина были заперты в колонке с flex:none и забирали 100 px
// из 354: заголовку доставалось 165 px, и «Рецепт хлеба на закваске»
// обрывался на третьем слове. Заголовок заметки — единственное, по чему её
// узнают в списке; дата такого права не имеет.
function NoteRow({note,onOpen,onDelete}){return <div className="noteRow" onClick={onOpen}>
  <KnowledgeObject kind="note" seed={note.id} size="sm"/>
  <div className="noteRowBody">
    <div className="noteTitle">{note.pinned&&<Icon name="push_pin" size={14}/>}{note.favorite&&<Icon name="star" size={14}/>}<span className="noteTitleText">{note.title||'Без названия'}</span></div>
    <div className="noteRowSnippet small subtle">{stripMarkdown(note.content).slice(0,110)||'Пустая заметка'}</div>
    <div className="noteRowMeta">
      <span className="tiny subtle">{formatDate(note.updatedAt)}</span>
      {(note.tags||[]).slice(0,3).map(t=><span className="tag" key={t}>#{t}</span>)}
    </div>
  </div>
  {onDelete&&<button className="iconBtn rowActions" onClick={e=>{e.stopPropagation();onDelete()}} aria-label="Удалить"><Icon name="delete" size={18}/></button>}
</div>}

// Заметки, задачи и карта тем — три вида одного рабочего пространства.
//
// Раньше «Задачи» и «Карта тем» были отдельными экранами без входа в
// навигации: на задачи вела одна ссылка с главной, а на карту тем — ни одной,
// то есть работающий код был недостижим. Все три строятся из одних данных
// (заметки, их теги, задачи), поэтому это виды, а не разделы.
const LIBRARY_VIEWS = [
  ['notes', 'Заметки', 'edit_note'],
  ['tasks', 'Задачи', 'checklist'],
  ['graph', 'Карта тем', 'hub']
]

function Library({workspace,setWorkspace,openEditor,newNote,initialSection='notes'}){
  const[section,setSection]=useState(initialSection)
  const[query,setQuery]=useState('');const[sort,setSort]=useState('newest');const[selected,setSelected]=useState([]);const[view,setView]=useState('all');const tags=[...new Set(workspace.notes.flatMap(n=>n.tags||[]))]
  const notes=useMemo(()=>workspace.notes.filter(n=>{const q=query.toLowerCase();const mq=!q||`${n.title} ${n.content}`.toLowerCase().includes(q);const mt=!selected.length||selected.every(t=>(n.tags||[]).includes(t));const mv=view==='all'||view==='pinned'&&n.pinned||view==='favorites'&&n.favorite;return mq&&mt&&mv}).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(sort==='newest'?b.updatedAt-a.updatedAt:sort==='oldest'?a.updatedAt-b.updatedAt:(a.title||'').localeCompare(b.title||'','ru'))),[workspace.notes,query,sort,selected,view])
  const del=id=>setWorkspace(w=>({...w,notes:w.notes.filter(n=>n.id!==id)}))
  const openTasks=workspace.tasks.filter(t=>!t.done).length
  const summary=section==='tasks'
    ?`${tasksLabel(workspace.tasks.length)} · ${openTasks} открыто`
    :section==='graph'
      ?`${tags.length} ${pluralRu(tags.length,'тема','темы','тем')} из ваших заметок`
      :`${notesLabel(workspace.notes.length)} · хранятся локально`

  return <div className="page"><div className="row space" style={{marginBottom:14}}><div><h1 className="headline notesHeadline">Заметки</h1><p className="subtle small">{summary}</p></div>{section==='notes'&&<Button icon="add" onClick={newNote}>Новая</Button>}</div>
    <div className="notebookViews" style={{marginBottom:12}}>{LIBRARY_VIEWS.map(([id,label,icon])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}><Icon name={icon} size={18}/>{label}</button>)}</div>
    {section==='tasks'&&<TasksView workspace={workspace} setWorkspace={setWorkspace}/>}
    {section==='graph'&&<GraphView workspace={workspace} openEditor={openEditor}/>}
    {section==='notes'&&<>
    <div className="filterRow"><button className={view==='all'?'active':''} onClick={()=>setView('all')}><Icon name="notes" size={16}/>Все</button><button className={view==='pinned'?'active':''} onClick={()=>setView('pinned')}><Icon name="push_pin" size={16}/>Закреплённые</button><button className={view==='favorites'?'active':''} onClick={()=>setView('favorites')}><Icon name="star" size={16}/>Избранное</button></div>
    <div className="searchRow"><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по названию и тексту…"/><select className="select" style={{maxWidth:160}} value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Сначала новые</option><option value="oldest">Сначала старые</option><option value="alpha">А–Я</option></select></div>
    <div className="chips" style={{marginTop:12}}>{tags.map(t=><button className={`chip ${selected.includes(t)?'active':''}`} key={t} onClick={()=>setSelected(s=>s.includes(t)?s.filter(x=>x!==t):[...s,t])}>#{t}</button>)}</div>
    <div className="notesList">{notes.map(n=><NoteRow key={n.id} note={n} onOpen={()=>openEditor(n.id)} onDelete={()=>del(n.id)}/>)}{!notes.length&&<div className="empty"><Icon name="search_off" size={48}/><p style={{marginTop:8}}>Подходящих заметок нет.</p></div>}</div>
    </>}
  </div>
}

function Editor({editingId,workspace,setWorkspace,navigate,settings}){
  const note=workspace.notes.find(n=>n.id===editingId);const[title,setTitle]=useState(note?.title||'Без названия');const[content,setContent]=useState(note?.content||'');const[tags,setTags]=useState((note?.tags||[]).join(', '));const[aiOpen,setAiOpen]=useState(false);const[aiOut,setAiOut]=useState('');const[loading,setLoading]=useState(false);const[status,setStatus]=useState('Сохранено');const textRef=useRef(null)
  useEffect(()=>{const n=workspace.notes.find(x=>x.id===editingId);if(n){setTitle(n.title);setContent(n.content);setTags((n.tags||[]).join(', '))}},[editingId])
  useEffect(()=>{if(!editingId)return;setStatus('Сохранение…');const t=setTimeout(()=>{setWorkspace(w=>({...w,notes:w.notes.map(n=>n.id===editingId?{...n,title:title.trim()||'Без названия',content,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),updatedAt:Date.now()}:n)}));setStatus('Сохранено')},450);return()=>clearTimeout(t)},[title,content,tags,editingId,setWorkspace])
  if(!note)return <div className="page"><div className="empty">Эта заметка больше не существует.<br/><Button tone="tonal" onClick={()=>navigate('library')}>Назад к заметкам</Button></div></div>
  const updateFlag=(key)=>setWorkspace(w=>({...w,notes:w.notes.map(n=>n.id===editingId?{...n,[key]:!n[key],updatedAt:Date.now()}:n)}))
  const insert=(prefix='',suffix='',placeholder='текст')=>{const el=textRef.current;const a=el?.selectionStart??content.length;const b=el?.selectionEnd??a;const selected=content.slice(a,b)||placeholder;const next=content.slice(0,a)+prefix+selected+suffix+content.slice(b);setContent(next);requestAnimationFrame(()=>{if(!el)return;const pos=a+prefix.length+selected.length+suffix.length;el.focus();el.setSelectionRange(pos,pos)})}
  const insertLine=(text)=>{const el=textRef.current;const a=el?.selectionStart??content.length;const before=content.slice(0,a);const needs=before&&!before.endsWith('\n')?'\n':'';const next=before+needs+text+'\n'+content.slice(a);setContent(next);requestAnimationFrame(()=>{if(!el)return;const pos=(before+needs+text+'\n').length;el.focus();el.setSelectionRange(pos,pos)})}
  const templates={
    meeting:'# Встреча\n\n**Дата:** '+new Date().toLocaleDateString('ru-RU')+'\n**Участники:** \n\n## Повестка\n- \n\n## Решения\n- \n\n## Задачи\n- [ ] \n',
    project:'# Проект\n\n## Цель\n\n## Контекст\n\n## Следующие шаги\n- [ ] \n\n## Риски\n- \n',
    study:'# Конспект\n\n## Главная идея\n\n## Ключевые тезисы\n- \n\n## Вопросы\n- \n\n## Связанные источники\n- \n',
    daily:'# '+new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})+'\n\n## Фокус дня\n\n## Задачи\n- [ ] \n\n## Мысли\n\n## Итоги\n'
  }
  const applyTemplate=(key)=>{if(content.trim()&&!confirm('Заменить текущий текст выбранным шаблоном?'))return;setContent(templates[key]||'')}
  const backlinks=workspace.notes.filter(n=>n.id!==editingId&&title.trim()&&n.content?.includes(`[[${title.trim()}]]`))
  const ai=async action=>{setLoading(true);setAiOpen(true);setAiOut(aiResultText(await runTask(settings,{action,input:content,system:'Работай только с предоставленной заметкой. Сохраняй факты и явно отмечай неопределённость. Отвечай по-русски.'})));setLoading(false)}
  return <div className="editor"><div className="editorTop"><button className="iconBtn" onClick={()=>navigate('library')} aria-label="Назад"><Icon name="arrow_back"/></button><input className="titleInput" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Название заметки"/><span className="tiny subtle">{status}</span><button className={`iconBtn ${note.pinned?'isActive':''}`} onClick={()=>updateFlag('pinned')} aria-label="Закрепить"><Icon name="push_pin"/></button><button className={`iconBtn ${note.favorite?'isActive':''}`} onClick={()=>updateFlag('favorite')} aria-label="В избранное"><Icon name="star"/></button><button className="iconBtn" onClick={()=>setAiOpen(v=>!v)} aria-label="Инструменты AI"><Icon name="auto_awesome"/></button></div>
    <div className="editorCommandBar glass" aria-label="Инструменты заметки">
      <button onClick={()=>insertLine('# Заголовок')}><Icon name="title" size={20}/><span>Заголовок</span></button>
      <button onClick={()=>insertLine('- [ ] Задача')}><Icon name="check_box" size={20}/><span>Чек-лист</span></button>
      <button onClick={()=>insertLine('- Пункт')}><Icon name="format_list_bulleted" size={20}/><span>Список</span></button>
      <button onClick={()=>insert('> ','','цитата')}><Icon name="format_quote" size={20}/><span>Цитата</span></button>
      <button onClick={()=>insert('`','`','код')}><Icon name="code" size={20}/><span>Код</span></button>
      <button onClick={()=>insertLine('| Колонка 1 | Колонка 2 |\n| --- | --- |\n| Значение | Значение |')}><Icon name="table_view" size={20}/><span>Таблица</span></button>
      <button onClick={()=>insert('[','](https://)','ссылка')}><Icon name="link" size={20}/><span>Ссылка</span></button>
      <button onClick={()=>insert(`[[`,`]]`,'Заметка')}><Icon name="hub" size={20}/><span>Связь</span></button>
      <button onClick={()=>insertLine(new Date().toLocaleString('ru-RU'))}><Icon name="event" size={20}/><span>Дата</span></button>
      <button onClick={()=>navigate('analysis')}><Icon name="attach_file" size={20}/><span>Файл</span></button>
      <button onClick={()=>navigate('media')}><Icon name="mic" size={20}/><span>Голос</span></button>
    </div>
    <div className="templateBar"><span>Шаблоны:</span><button onClick={()=>applyTemplate('daily')}>День</button><button onClick={()=>applyTemplate('meeting')}>Встреча</button><button onClick={()=>applyTemplate('project')}>Проект</button><button onClick={()=>applyTemplate('study')}>Конспект</button></div>
    <div className={`editorBody ${aiOpen?'withAi':''}`}><textarea ref={textRef} className="contentInput" value={content} onChange={e=>setContent(e.target.value)} placeholder="Начните писать…  Используйте [[Название заметки]] для связей."/>{aiOpen&&<aside className="aiPanel"><div className="row space"><strong>Помощник</strong><button className="iconBtn" onClick={()=>setAiOpen(false)}><Icon name="close" size={18}/></button></div><div className="aiActions"><Button tone="tonal" icon="summarize" onClick={()=>ai('summarize')}>Сводка</Button><Button tone="tonal" icon="auto_fix_high" onClick={()=>ai('improve')}>Улучшить</Button><Button tone="tonal" icon="tag" onClick={()=>ai('keywords')}>Ключевые слова</Button><Button tone="tonal" icon="title" onClick={()=>ai('title')}>Название</Button></div><div className="aiOutput">{loading?'Анализирую…':aiOut||'Подключите модель в Профиле — и анализ пойдёт через неё. Без модели доступно только локальное извлечение, и оно помечается явно.'}</div></aside>}</div>
    <div className="editorBottom"><Icon name="tag" size={19}/><input className="titleInput" style={{fontSize:15,fontWeight:600}} value={tags} onChange={e=>setTags(e.target.value)} placeholder="Теги через запятую"/><span className="tiny subtle">{countWords(content)} слов · {content.length} знаков · {backlinks.length} обратных ссылок</span></div>
  </div>
}

function Chat({settings}){
  const[role,setRole]=useState(expertRoles[0]);const[messages,setMessages]=useState([]);const[input,setInput]=useState('');const[loading,setLoading]=useState(false);const end=useRef(null)
  useEffect(()=>end.current?.scrollIntoView({behavior:'smooth'}),[messages,loading])
  const send=async()=>{const q=input.trim();if(!q||loading)return;const next=[...messages,{role:'user',content:q}];setMessages(next);setInput('');setLoading(true);const out=aiResultText(await runTask(settings,{action:'chat',input:q,system:role.system,history:next.slice(-10)}));setMessages(m=>[...m,{role:'assistant',content:out}]);setLoading(false)}
  return <div className="chatShell"><div className="roleBar"><div className="chips">{expertRoles.map(r=><button className={`chip ${role.id===r.id?'active':''}`} key={r.id} onClick={()=>setRole(r)}><Icon name={r.icon} size={15}/> {r.name}</button>)}</div></div><div className="messages">{!messages.length&&<div className="empty"><div className="metricIcon" style={{margin:'0 auto 10px'}}><Icon name={role.icon}/></div><strong>{role.name} workspace</strong><p className="small" style={{marginTop:5}}>Подключённый AI работает через ваш сервер. Без него NOTE2 продолжает работать в локальном режиме.</p></div>}{messages.map((m,i)=><div key={i} className={`bubble ${m.role==='user'?'user':'ai'}`}>{m.content}</div>)}{loading&&<div className="bubble ai">Думаю…</div>}<div ref={end}/></div><div className="composer"><Input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder={`Спросить ${role.name}…`}/><Button icon="send" onClick={send} disabled={!input.trim()||loading}>Отправить</Button></div></div>
}

function Analysis({settings,workspace,setWorkspace,openEditor,capturePayload,clearCapturePayload}){
  const [mode,setMode]=useState('sources')
  const [sourceFilter,setSourceFilter]=useState('all')
  const [sourceQuery,setSourceQuery]=useState('')
  const [text,setText]=useState('')
  const [url,setUrl]=useState('')
  const [instagramUrl,setInstagramUrl]=useState('')
  const [instagramAutoSave,setInstagramAutoSave]=useState(false)
  const [sources,setSources]=useState([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [question,setQuestion]=useState('')
  const [answer,setAnswer]=useState('')
  const [evidence,setEvidence]=useState([])
  const [selectedSource,setSelectedSource]=useState(null)
  const fileRef=useRef(null)
  const captureConsumedRef=useRef(null)

  const refresh=useCallback(async()=>{try{setSources(await listSources())}catch(err){setMessage(err.message)}},[])
  useEffect(()=>{refresh()},[refresh])
  useEffect(()=>{const listener=()=>refresh();window.addEventListener('note2:source-shared',listener);return()=>window.removeEventListener('note2:source-shared',listener)},[refresh])
  useEffect(()=>{const consume=(value,auto=true)=>{if(!value)return;setInstagramUrl(value);setInstagramAutoSave(auto);setMode('sources')};try{const pending=localStorage.getItem('note2-pending-instagram-share');const open=localStorage.getItem('note2-open-instagram');if(pending){localStorage.removeItem('note2-pending-instagram-share');consume(pending,true)}else if(open){localStorage.removeItem('note2-open-instagram');setMode('sources')}}catch{};const listener=e=>consume(e.detail?.url||'',true);window.addEventListener('note2:instagram-share',listener);return()=>window.removeEventListener('note2:instagram-share',listener)},[])

  const enrichWithConnector=async(file,source)=>{
    if(source.kind==='image'||(source.kind==='pdf'&&source.status==='needs-ocr')){
      try{
        const data=await analyzeVisualFile(file,settings.visionEndpoint)
        return {...source,status:data.text?'ready':'empty',text:data.text||'',sections:data.sections||[],quality:data.quality||null,wordCount:countWords(data.text||''),charCount:(data.text||'').length,error:null,provenance:{...(source.provenance||{}),extraction:'vision',model:data.model,extractedAt:data.extractedAt,responseId:data.responseId}}
      }catch(error){return {...source,status:'needs-connector',error:`Vision/OCR connector: ${error.message}`}}
    }
    if(source.kind==='audio'||source.kind==='video'){
      try{
        const queued=await enqueueMediaTranscription(file)
        const job=await runMediaTranscriptionJob(queued,settings.transcribeEndpoint)
        const data=job.result||{}
        return {...source,status:data.text?'ready':'empty',text:data.text||'',sections:data.sections||[],quality:data.quality||null,wordCount:countWords(data.text||''),charCount:(data.text||'').length,error:null,duration:data.duration||null,speakers:data.speakers||[],provenance:{...(source.provenance||{}),extraction:'transcription',model:data.model,transcribedAt:data.transcribedAt,diarized:data.diarized,segmented:data.segmented,segmentCount:data.segmentCount,speakerContinuity:data.speakerContinuity,mediaJobId:job.id,transport:job.transport}}
      }catch(error){return {...source,status:'needs-connector',error:`Transcription connector: ${error.message}`}}
    }
    return source
  }

  const importFiles=async files=>{
    const picked=[...(files||[])]
    if(!picked.length)return
    setBusy(true);setMessage('')
    let ready=0,needs=0,vectors=0
    try{
      for(const file of picked){
        let source=await parseLocalFile(file)
        if(['image','audio','video'].includes(source.kind)||(source.kind==='pdf'&&source.status==='needs-ocr')) source=await enrichWithConnector(file,source)
        const indexed=await indexSourceRecord(source,settings)
        if(indexed.indexMode==='vector')vectors+=1
        source.status==='ready'?ready++:needs++
      }
      await refresh()
      setMessage(`${picked.length} source${picked.length===1?'':'s'} added · ${ready} searchable${vectors?` · ${vectors} vector-indexed`:''}${needs?` · ${needs} need a connector/retry`:''}`)
    }catch(err){setMessage(err.message)}finally{setBusy(false);if(fileRef.current)fileRef.current.value=''}
  }

  const addPasted=async()=>{
    if(!text.trim())return
    setBusy(true);setMessage('')
    try{
      const now=Date.now()
      const source={id:crypto.randomUUID?.()||String(now),name:`Pasted text · ${new Date(now).toLocaleString()}`,type:'text/plain',size:new Blob([text]).size,kind:'text',origin:'paste',status:'ready',text:text.trim(),wordCount:countWords(text),charCount:text.length,createdAt:now,updatedAt:now}
      await indexSourceRecord(source,settings);setText('');await refresh();setMessage('Pasted text indexed as a source.')
    }catch(err){setMessage(err.message)}finally{setBusy(false)}
  }

  const addUrl=async(overrideUrl='')=>{
    const value=String(overrideUrl||url).trim();if(!value)return
    const descriptor=sharedUrlDescriptor(value)
    if(descriptor?.provider==='instagram'){setUrl('');await addInstagram(value);setMode('sources');return}
    setBusy(true);setMessage('')
    try{
      if(descriptor?.provider==='youtube'){
        const data=await ingestYoutube(value,settings.youtubeEndpoint)
        const now=Date.now()
        const body=[data.title,data.channel,data.transcript].filter(Boolean).join('\n\n')
        const source={id:`youtube:${descriptor.providerId}`,provider:'youtube',providerId:descriptor.providerId,sourceType:descriptor.sourceType,name:data.title||`YouTube · ${descriptor.providerId}`,title:data.title||'',description:data.description||'',thumbnail:data.thumbnail||'',type:'text/youtube-source',size:new Blob([body]).size,kind:'youtube',origin:'url',url:descriptor.canonicalUrl,canonicalUrl:descriptor.canonicalUrl,originalUrl:descriptor.sharedUrl,captureContext:descriptor.captureContext||{},status:data.transcript?'ready':'saved',text:body,sections:data.sections||[],wordCount:countWords(body),charCount:body.length,createdAt:now,updatedAt:now,provenance:{provider:'youtube',videoId:descriptor.providerId,channel:data.channel||'',thumbnail:data.thumbnail||'',captionLanguage:data.captionLanguage||'',autoCaptions:!!data.autoCaptions,fetchedAt:data.fetchedAt||now,sharedUrl:descriptor.sharedUrl,canonicalUrl:descriptor.canonicalUrl}}
        await indexSourceRecord(source,settings);setUrl('');await refresh();setSelectedSource({source});setMode('sources');setMessage(data.transcript?'YouTube сохранён вместе с доступным транскриптом.':'YouTube сохранён. Видео доступно для просмотра; публичный транскрипт не найден.')
        return
      }
      const response=await authenticatedFetch(gatewayApiEndpointFor(settings.aiEndpoint,'/api/source-url'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value})})
      const data=await response.json();if(!response.ok)throw new Error(data.error||`URL ingestion failed (${response.status})`)
      const now=Date.now()
      const source={id:crypto.randomUUID?.()||String(now),provider:'web',name:data.title||data.url,title:data.title||'',type:data.contentType||'text/html',size:data.bytes||0,kind:'url',origin:'url',url:data.url,status:'ready',text:data.text,wordCount:countWords(data.text),charCount:data.text.length,createdAt:now,updatedAt:now,provenance:{provider:'web',fetchedAt:data.fetchedAt,finalUrl:data.url}}
      await indexSourceRecord(source,settings);setUrl('');await refresh();setMode('sources');setMessage('Ссылка сохранена и добавлена в поиск.')
    }catch(err){setMessage(err.message)}finally{setBusy(false)}
  }

  const addInstagram=async(overrideUrl='')=>{
    const value=String(overrideUrl||instagramUrl).trim();if(!value)return
    setBusy(true);setMessage('')
    try{
      const data=await ingestInstagramPost(value,settings.aiEndpoint)
      const now=Date.now();const username=data.owner?.username||'instagram'
      const media=(data.media||[]).map(item=>({...item,archiveUrl:instagramArchivedMediaUrl(data.shortcode,item.index,settings.aiEndpoint)}))
      const requestContext=data.requestContext||{}
      const draft={instagram:{shortcode:data.shortcode,type:data.type,caption:data.caption||'',owner:data.owner||{},takenAt:data.takenAt||null,media,requestedMediaIndex:Number(requestContext.requestedMediaIndex)||0,requestContext}}
      const sections=instagramSearchSections(draft)
      const sourceText=sections.map(section=>section.text).join('\n\n')
      const source={id:`instagram:${data.shortcode}`,name:`@${username} · ${requestContext.routeType==='reel'?'Reel':'Instagram'}`,type:'application/x-instagram-post',size:media.reduce((sum,item)=>sum+Number(item.bytes||0),0),kind:'instagram',origin:'instagram-share',url:data.url,status:'ready',text:sourceText,sections,wordCount:countWords(sourceText),charCount:sourceText.length,createdAt:now,updatedAt:now,instagram:draft.instagram,provenance:{provider:'instaloader',fetchedAt:data.provenance?.fetchedAt||data.archivedAt,originalUrl:data.url,sharedUrl:requestContext.sharedUrl||value,archiveVersion:data.archiveVersion||1}}
      source.instagram.autoCategory=classifyInstagramSource(source).label
      await indexSourceRecord(source,settings);setInstagramUrl('');await refresh();setSelectedSource({source});setMessage(`Пост @${username} сохранён · ${media.length} медиа`)
    }catch(err){
      const descriptor=instagramSharedUrlDescriptor(value)
      if(descriptor){
        const now=Date.now();const pending={id:`instagram:${descriptor.shortcode}`,name:`Instagram · ${descriptor.shortcode}`,type:'application/x-instagram-post',size:0,kind:'instagram',origin:'instagram-share',url:descriptor.canonicalUrl,status:'needs-connector',error:err.message,text:'',sections:[],wordCount:0,charCount:0,createdAt:now,updatedAt:now,instagram:{shortcode:descriptor.shortcode,type:descriptor.routeType,caption:'',owner:{},takenAt:null,media:[],requestedMediaIndex:descriptor.requestedMediaIndex,requestContext:descriptor,pending:true},provenance:{provider:'instaloader',originalUrl:descriptor.canonicalUrl,sharedUrl:descriptor.sharedUrl,acquisitionError:err.message}}
        await saveSourceWithChunks(pending,[]);await refresh();setSelectedSource({source:pending});setMessage(`Ссылка сохранена. Контент Instagram пока не получен: ${err.message}`)
      }else setMessage(err.message)
    }finally{setBusy(false)}
  }

  useEffect(()=>{
    if(!capturePayload||captureConsumedRef.current===capturePayload.id)return
    captureConsumedRef.current=capturePayload.id
    let cancelled=false
    const consume=async()=>{
      try{
        setMode('sources')
        if(capturePayload.type==='files')await importFiles(capturePayload.files||[])
        if(capturePayload.type==='link')await addUrl(capturePayload.url||'')
      }finally{if(!cancelled)clearCapturePayload?.()}
    }
    consume()
    return()=>{cancelled=true}
  },[capturePayload?.id])

  const updateInstagramMedia=async(index,patch)=>{
    const current=(selectedSource?.source||selectedSource);if(current?.kind!=='instagram')return
    const normalizedPatch=typeof patch==='string'?{ocrText:patch}:patch||{}
    const media=(current.instagram?.media||[]).map(item=>item.index===index?{...item,...normalizedPatch}:item)
    const draft={...current,instagram:{...current.instagram,media}}
    const sections=instagramSearchSections(draft)
    const sourceText=sections.map(x=>x.text).join('\n\n')
    const updated={...draft,text:sourceText,sections,wordCount:countWords(sourceText),charCount:sourceText.length,updatedAt:Date.now()}
    updated.instagram={...updated.instagram,autoCategory:classifyInstagramSource(updated).label}
    await indexSourceRecord(updated,settings);await refresh();setSelectedSource({source:updated});setMessage(`${normalizedPatch.transcriptText?'Расшифровка видео':'Текст изображения'} ${index+1} сохранён и добавлен в поиск`)
  }
  const updateInstagramMediaBatch=async patches=>{
    const current=(selectedSource?.source||selectedSource);if(current?.kind!=='instagram'||!Array.isArray(patches)||!patches.length)return
    const patchMap=new Map(patches.map(item=>[Number(item.index),item.patch||{}]))
    const media=(current.instagram?.media||[]).map(item=>patchMap.has(Number(item.index))?{...item,...patchMap.get(Number(item.index))}:item)
    const draft={...current,instagram:{...current.instagram,media}}
    const sections=instagramSearchSections(draft)
    const sourceText=sections.map(section=>section.text).filter(Boolean).join('\n\n')
    const updated={...draft,text:sourceText,sections,wordCount:countWords(sourceText),charCount:sourceText.length,updatedAt:Date.now()}
    updated.instagram={...updated.instagram,autoCategory:classifyInstagramSource(updated).label}
    await indexSourceRecord(updated,settings);setSelectedSource({source:updated});await refresh();return updated
  }
  const toggleInstagramCollection=async(source,name)=>{
    if(!source?.id||!name)return
    const updated=await updateSourceMetadata(source.id,current=>{const list=new Set(current.instagram?.collections||[]);list.has(name)?list.delete(name):list.add(name);return{...current,instagram:{...(current.instagram||{}),collections:[...list]},updatedAt:Date.now()}})
    if(updated){setSources(list=>list.map(item=>item.id===updated.id?updated:item));if((selectedSource?.source||selectedSource)?.id===updated.id)setSelectedSource({source:updated})}
  }
  const updateInstagramInsight=async(mode,text)=>{
    const current=(selectedSource?.source||selectedSource);if(current?.kind!=='instagram'||!text)return
    const updated={...current,instagram:{...current.instagram,insights:{...(current.instagram.insights||{}),[mode]:text}},updatedAt:Date.now()}
    await updateSourceMetadata(updated.id,()=>updated);await refresh();setSelectedSource({source:updated})
  }

  const updateInstagramStructured=async structured=>{
    const current=(selectedSource?.source||selectedSource);if(current?.kind!=='instagram'||!structured)return
    const draft={...current,instagram:{...current.instagram,structuredKnowledge:structured}}
    const sections=instagramSearchSections(draft)
    const sourceText=sections.map(section=>section.text).filter(Boolean).join('\n\n')
    const updated={...draft,text:sourceText,sections,wordCount:countWords(sourceText),charCount:sourceText.length,updatedAt:Date.now()}
    await indexSourceRecord(updated,settings);await refresh();setSelectedSource({source:updated});setMessage(`${structured.label||'Структура'} сохранена и добавлена в поиск`)
  }
  const updateInstagramOfflinePin=async(pinned,result={})=>{
    const current=(selectedSource?.source||selectedSource);if(current?.kind!=='instagram')return
    const updated=await updateSourceMetadata(current.id,source=>({...source,instagram:{...(source.instagram||{}),offlinePinned:!!pinned,offlineBytes:pinned?Number(result.bytes||0):0,offlinePinnedAt:pinned?Date.now():null}}))
    if(updated){await refresh();setSelectedSource({source:updated});setMessage(pinned?`Пост сохранён офлайн · ${fileSize(result.bytes||0)}`:'Офлайн-копия удалена')}
  }


  useEffect(()=>{if(!instagramAutoSave||!instagramUrl.trim()||busy)return;setInstagramAutoSave(false);addInstagram()},[instagramAutoSave,instagramUrl])

  const toggleSourceFavorite=async source=>{
    if(!source?.id)return
    const updated=await updateSourceMetadata(source.id,current=>{
      const nextFavorite=!(current.favorite||current.instagram?.favorite)
      return current.kind==='instagram'?{...current,favorite:nextFavorite,instagram:{...(current.instagram||{}),favorite:nextFavorite}}:{...current,favorite:nextFavorite}
    })
    if(updated){await refresh();setSelectedSource(sel=>((sel?.source||sel)?.id===updated.id?{...(sel?.locator?sel:{}),source:updated}:sel))}
  }
  const createSourceNote=source=>{
    if(!source)return
    const now=Date.now();const id=crypto.randomUUID?.()||String(now);const view=unifiedSourceView(source);const provider=sourceProvider(source);const structured=source.instagram?.structuredKnowledge
    const original=sourceDescriptionText(source)
    const sourceExcerpt=provider==='instagram'?'':String(source.text||'').trim().slice(0,2200)
    const content=[original,structured?structuredKnowledgeMarkdown(structured,source):'',sourceExcerpt&&sourceExcerpt!==original?sourceExcerpt:'',source.url?`Источник: ${source.url}`:'',`<!-- source:${source.id} -->`].filter(Boolean).join('\n\n')
    const tag=provider==='document'?'документ':provider==='web'?'веб':provider
    const note={id,title:view.title||'Источник',content,tags:['источник',tag,structured?.type].filter(Boolean),pinned:false,favorite:false,folder:'Источники',createdAt:now,updatedAt:now}
    setWorkspace(w=>({...w,notes:[note,...w.notes]}));openEditor?.(id)
  }
  const updateSourceSummary=async(source,text)=>{
    if(!source?.id||!text)return
    const updated=await updateSourceMetadata(source.id,current=>current.kind==='instagram'?{...current,insights:{...(current.insights||{}),brief:text},instagram:{...(current.instagram||{}),insights:{...(current.instagram?.insights||{}),brief:text}}}:{...current,insights:{...(current.insights||{}),brief:text}})
    if(updated){setSources(list=>list.map(item=>item.id===updated.id?updated:item));setSelectedSource(sel=>((sel?.source||sel)?.id===updated.id?{...(sel?.locator?sel:{}),source:updated}:sel))}
  }
  const createInstagramMediaNote=(source,index)=>{
    const now=Date.now();const id=crypto.randomUUID?.()||String(now);const n=Number(index||0)+1;const username=source.instagram?.owner?.username||'instagram';const content=instagramMediaNoteBlock(source,index)
    const note={id,title:`Instagram · @${username} · медиа ${n}`,content,tags:['instagram',username,`media-${n}`],pinned:false,favorite:false,folder:'Instagram',createdAt:now,updatedAt:now}
    setWorkspace(w=>({...w,notes:[note,...w.notes]}));openEditor?.(id)
  }
  const instagramSources=sources.filter(source=>source.kind==='instagram')

  // Фильтры — по тому, что в библиотеке есть, а не по списку всего, что
  // приложение теоретически умеет. Правила и порядок — в source-filters.js.
  const sourceProviders=useMemo(()=>visibleSourceFilters(sources,sourceProvider),[sources])
  const visibleSources=sources.filter(source=>{
    const provider=sourceProvider(source)
    const q=sourceQuery.trim().toLowerCase()
    const view=unifiedSourceView(source)
    return(sourceFilter==='all'||provider===sourceFilter)&&(!q||`${view.title} ${view.author} ${view.description} ${source.text||''}`.toLowerCase().includes(q))
  }).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0))

  const remove=async id=>{if(!confirm('Delete this source and its search index?'))return;await deleteSource(id);if((selectedSource?.source||selectedSource)?.id===id)setSelectedSource(null);await refresh()}

  const openEvidence=item=>{const imported=sources.find(source=>source.id===item.sourceId);if(imported)setSelectedSource({source:imported,locator:item.locator,excerpt:item.text});else if(item.sourceId?.startsWith('note:'))openEditor?.(item.sourceId.slice(5))}

  const ask=async()=>{
    const q=question.trim()
    const noteSources=(workspace?.notes||[]).filter(n=>n.content?.trim()).map(n=>({id:`note:${n.id}`,noteId:n.id,name:n.title||'Без названия',kind:'note',origin:'note',status:'ready',text:n.content,wordCount:countWords(n.content)}))
    if(!q||(!sources.length&&!noteSources.length))return
    setBusy(true);setAnswer('');setEvidence([]);setMessage('')
    try{
      const storedChunks=await listChunks(sources.filter(s=>s.status==='ready').map(s=>s.id))
      const noteChunks=noteSources.flatMap(source=>chunkText(source.text).map(chunk=>({...chunk,id:`${source.id}:${chunk.index}`,sourceId:source.id})))
      const chunks=[...storedChunks,...noteChunks]
      const allSources=[...sources,...noteSources]
      let queryVector=null
      if(settings.embedEndpoint&&storedChunks.some(c=>Array.isArray(c.vector))){try{queryVector=(await embedTexts(settings.embedEndpoint,[q]))[0]||null}catch{}}
      const matches=rankChunks({query:q,chunks,sources:allSources,queryVector,limit:8})
      const refs=buildEvidence(matches);setEvidence(refs)
      if(!refs.length){setAnswer('В проиндексированных источниках не нашлось подходящих фрагментов. Добавьте материалы или переформулируйте вопрос.');return}
      const prompt=groundedPrompt(q,refs)
      if(settings.aiEndpoint){
        const result=await runTask(settings,{action:'grounded-analysis',input:prompt,system:'You are a retrieval-grounded research assistant. Every material claim must cite provided [S#] evidence. Never invent a citation or use outside facts.'})
        setAnswer(result.origin===AI_ORIGIN.model?result.text:`${aiResultText(result)}\n\n${localGroundedAnswer(q,refs)}`)
      }else setAnswer(localGroundedAnswer(q,refs))
    }catch(err){setAnswer(`Ошибка анализа: ${err.message}`)}finally{setBusy(false)}
  }

  // Удалили последний источник выбранного типа — ряд фильтров исчез, а выбор
  // остался, и список молча показывал пустоту.
  useEffect(()=>{
    const corrected=correctedFilter(sourceFilter,sourceProviders)
    if(corrected!==sourceFilter)setSourceFilter(corrected)
  },[sourceProviders,sourceFilter])

  return <div className="page">
    <div className="sourcesV40Header"><div><h1 className="headline sourcesHeadline">Источники</h1><p className="subtle small">Все сохранённые материалы в одной библиотеке.</p></div>{!!sources.length&&<div className="row gap8"><Button icon="add" onClick={()=>setMode('import')}>Добавить</Button><button className="iconBtn" onClick={()=>setMode('ask')} aria-label="Спросить источники"><Icon name="forum" size={21}/></button></div>}</div>
    {mode==='sources'&&<>{!!sources.length&&<Input className="sourceLibrarySearch" value={sourceQuery} onChange={e=>setSourceQuery(e.target.value)} placeholder="Поиск по источникам…"/>}<div className="sourceProviderFilters filterRow">{sourceProviders.map(provider=><button key={provider} className={sourceFilter===provider?'active':''} onClick={()=>setSourceFilter(provider)}>{provider==='all'?'Все':sourceProviderLabel(provider)}</button>)}</div></>}
    {mode!=='sources'&&<button className="sourceBackButton" onClick={()=>setMode('sources')}><Icon name="arrow_back" size={18}/> К библиотеке</button>}
    {message&&<div className="notice" style={{marginBottom:14}}>{message}</div>}

    {mode==='import'&&<div className="analysisGrid">
      <Card><div className="row gap12"><div className="metricIcon"><Icon name="upload_file"/></div><div><strong>Загрузка файлов</strong><div className="small subtle">Text/Office/eBook parse locally. PDFs use page extraction first; scans/images use vision; audio/video use transcription.</div></div></div><label className="dropzone compactDrop" style={{display:'block',marginTop:14}}><Icon name="folder_open" size={34}/><p style={{marginTop:6}}>{busy?'Processing…':'Choose one or more files'}</p><p className="tiny subtle">No fabricated extraction: unavailable connectors remain visibly marked instead of producing demo content.</p><input ref={fileRef} className="hiddenFile" type="file" multiple onChange={e=>importFiles(e.target.files)}/></label></Card>
      <Card><div className="row gap12"><div className="metricIcon"><Icon name="content_paste"/></div><div><strong>Paste text</strong><div className="small subtle">Создайте источник, по которому можно искать и на который можно ссылаться.</div></div></div><Textarea style={{marginTop:12,minHeight:160}} value={text} onChange={e=>setText(e.target.value)} placeholder="Paste article, meeting notes, research or code…"/><div style={{marginTop:10}}><Button icon="add" onClick={addPasted} disabled={busy||!text.trim()}>Index text</Button></div></Card>
      <Card className="analysisWide"><div className="row gap12"><div className="metricIcon"><Icon name="language"/></div><div><strong>Ссылка</strong><div className="small subtle">Instagram, YouTube и обычные веб-страницы определяются автоматически и сохраняются как единый Source.</div></div></div><div className="searchRow" style={{marginTop:12}}><Input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Вставьте ссылку Instagram, YouTube или веб-страницы"/><Button icon="download" onClick={addUrl} disabled={busy||!url.trim()}>Сохранить</Button></div></Card>
    </div>}

    {mode==='ask'&&<div className="researchLayout"><div><Card><h3>Спросить по источникам</h3><p className="small subtle" style={{marginTop:5}}>Hybrid retrieval spans imported fragments plus live note contents and preserves page/time locators.</p><Textarea style={{marginTop:12,minHeight:110}} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What do these sources say about…?"/><div className="row space" style={{marginTop:10}}><span className="tiny subtle">{sources.filter(s=>s.status==='ready').length} imported + {notesLabel((workspace?.notes||[]).filter(n=>n.content?.trim()).length)}</span><Button icon="search" onClick={ask} disabled={busy||!question.trim()||(!sources.length&&!(workspace?.notes||[]).some(n=>n.content?.trim()))}>{busy?'Retrieving…':'Find evidence'}</Button></div></Card>{answer&&<Card className="resultBox" style={{marginTop:14}}><div className="row space"><strong>Grounded answer</strong><span className="tag">{evidence.length} refs</span></div><div style={{marginTop:12}}><CitedText text={answer} evidence={evidence} onCitation={openEvidence}/></div></Card>}</div>
      <aside><Card><h3>Evidence</h3><div className="evidenceList" style={{marginTop:10}}>{evidence.map(item=><button className="evidenceCard" key={item.ref} onClick={()=>openEvidence(item)}><div className="row space"><strong>[{item.ref}]</strong><span className="tiny subtle">{Math.round(item.score*100)}%</span></div><div className="small" style={{fontWeight:600,marginTop:5}}>{item.sourceName}</div><div className="tiny subtle">{locatorLabel(item.locator,item.sectionLabel)}</div><div className="tiny subtle evidenceSnippet">{item.text}</div></button>)}{!evidence.length&&<div className="empty small">Здесь появятся найденные фрагменты источников.</div>}</div></Card></aside>
    </div>}

    {mode==='sources'&&<div className="unifiedSourceList">{visibleSources.map(source=>{const view=unifiedSourceView(source);const provider=sourceProvider(source);return <article className="unifiedSourceRow" key={source.id}><button className="unifiedSourceOpen" onClick={()=>setSelectedSource({source})}><span className={`unifiedSourceIcon ${provider}`}><Icon name={sourceIcon(source.kind)} size={24}/></span><span className="unifiedSourceCopy"><strong>{view.title}</strong><span>{(view.description||source.error||'').replace(/\s+/g,' ').slice(0,110)||'Содержимое будет доступно после обработки источника.'}</span><small>{sourceProviderLabel(provider)}{view.author?` · ${view.author}`:''}{source.duration?` · ${secondsLabel(source.duration)}`:''}{source.pageCount?` · ${source.pageCount} стр.`:''} · {source.status==='ready'?'Готово':source.status==='saved'?'Сохранено':'Нужна обработка'}</small></span></button><button className="unifiedSourceMore" onClick={()=>remove(source.id)} aria-label="Удалить"><Icon name="more_horiz" size={21}/></button></article>})}{!visibleSources.length&&(sources.length
      ? <div className="empty"><Icon name="filter_alt_off" size={40}/><p style={{marginTop:8}}>По выбранному фильтру ничего нет.</p><button className="textAction" onClick={()=>setSourceFilter('all')}>Показать все <Icon name="arrow_forward" size={18}/></button></div>
      : <div className="sourcesEmpty">
          <div className="sourcesEmptyIcon"><Icon name="library_books" size={30}/></div>
          <h3>Библиотека пуста</h3>
          <p className="small subtle">Источник — это файл, страница или видео, из которых приложение достаёт текст. После добавления по ним работает поиск, и на них можно ссылаться из заметок.</p>
          <div className="sourcesEmptyActions">
            <Button icon="upload_file" onClick={()=>setMode('import')}>Добавить файл</Button>
            <button className="textAction" onClick={()=>setMode('import')}>Или вставить ссылку <Icon name="arrow_forward" size={18}/></button>
          </div>
        </div>)}</div>}
    <SourcePreview selection={selectedSource} onClose={()=>setSelectedSource(null)} settings={settings} onSourceUpdated={updateInstagramMedia} onBatchSourceUpdated={updateInstagramMediaBatch} onToggleFavorite={toggleSourceFavorite} onCreateNote={createSourceNote} onCreateMediaNote={createInstagramMediaNote} onInsightUpdated={updateInstagramInsight} onSummaryUpdated={updateSourceSummary} onToggleCollection={toggleInstagramCollection} onStructuredUpdated={updateInstagramStructured} onOfflinePinUpdated={updateInstagramOfflinePin} instagramSources={instagramSources} notes={workspace?.notes||[]}/>
  </div>
}

function Studio({settings}){
  const[action,setAction]=useState('summarize');const[input,setInput]=useState('');const[out,setOut]=useState('');const[loading,setLoading]=useState(false);const tools=[['summarize','Summarize','summarize'],['keywords','Keywords','tag'],['improve','Clean up','auto_fix_high'],['title','Generate title','title']]
  const run=async()=>{setLoading(true);setOut(aiResultText(await runTask(settings,{action,input,system:'Transform the supplied content without inventing facts.'})));setLoading(false)}
  return <div className="page"><h1 className="headline">Разобрать текст</h1><p className="subtle" style={{marginTop:5}}>Вставьте любой текст и примените к нему действие. Результат не сохраняется — для этого создайте заметку.</p><div className="split" style={{marginTop:16}}>{tools.map(([id,label,icon])=><button key={id} className={`card ${action===id?'':''}`} style={{textAlign:'left',borderColor:action===id?'var(--brand)':'var(--line)'}} onClick={()=>setAction(id)}><div className="row gap12"><div className="metricIcon"><Icon name={icon}/></div><strong>{label}</strong></div></button>)}</div><Textarea style={{marginTop:14}} value={input} onChange={e=>setInput(e.target.value)} placeholder="Вставьте текст…"/><div style={{marginTop:10}}><Button icon="auto_awesome" onClick={run} disabled={!input.trim()||loading}>{loading?'Обрабатываю…':'Выполнить'}</Button></div>{out&&<Card className="resultBox" style={{marginTop:14}}>{out}</Card>}</div>
}

function Media({settings,setToast}){
  const [file,setFile]=useState(null)
  const [busy,setBusy]=useState(false)
  const [activeJob,setActiveJob]=useState(null)
  const [jobs,setJobs]=useState([])
  const [message,setMessage]=useState('')
  const [indexed,setIndexed]=useState(false)
  const [recording,setRecording]=useState(false)
  const [previewUrl,setPreviewUrl]=useState('')
  const recorderRef=useRef(null)
  const streamRef=useRef(null)
  const recordedRef=useRef([])

  const refreshJobs=useCallback(async()=>{try{setJobs(await listMediaJobs())}catch{}},[])
  useEffect(()=>{recoverInterruptedMediaJobs().finally(refreshJobs)},[refreshJobs])
  const currentBlob=activeJob?.file||file
  const currentName=activeJob?.filename||file?.name||''
  const currentType=activeJob?.mimeType||file?.type||''
  const result=activeJob?.result||null

  useEffect(()=>{
    if(!currentBlob){setPreviewUrl('');return}
    const url=URL.createObjectURL(currentBlob);setPreviewUrl(url);return()=>URL.revokeObjectURL(url)
  },[currentBlob])

  const chooseFile=next=>{setFile(next||null);setActiveJob(null);setIndexed(false);setMessage('')}
  const onJobUpdate=job=>{setActiveJob(job);setJobs(existing=>[job,...existing.filter(item=>item.id!==job.id)].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)))}
  const transcribe=async()=>{
    if(!file)return
    setBusy(true);setMessage('');setIndexed(false)
    try{
      const queued=await enqueueMediaTranscription(file);onJobUpdate(queued)
      const done=await runMediaTranscriptionJob(queued,settings.transcribeEndpoint,onJobUpdate)
      setMessage(`${done.result?.sections?.length||0} transcript segment${done.result?.sections?.length===1?'':'s'} · saved in durable queue`)
    }catch(error){setMessage(error.message)}finally{setBusy(false);await refreshJobs()}
  }
  const resumeJob=async job=>{
    setBusy(true);setMessage('');setIndexed(false);setActiveJob(job)
    try{const done=await retryQueuedMediaJob(job.id,settings.transcribeEndpoint,onJobUpdate);setMessage(`Resumed and completed · ${done.result?.sections?.length||0} segments`)}catch(error){setMessage(error.message)}finally{setBusy(false);await refreshJobs()}
  }
  const removeJob=async job=>{if(!confirm(`Delete queued media job "${job.filename}"?`))return;await deleteMediaJob(job.id);if(activeJob?.id===job.id)setActiveJob(null);await refreshJobs()}
  const selectJob=job=>{setActiveJob(job);setFile(null);setIndexed(false);setMessage(job.status==='done'?'Completed transcript restored from local queue.':job.error||`Job status: ${job.status}`)}
  const indexTranscript=async()=>{
    if(!activeJob?.result?.text)return
    setBusy(true)
    try{
      const data=activeJob.result,now=Date.now(),kind=String(activeJob.mimeType||'').startsWith('video/')?'video':'audio'
      const source={id:crypto.randomUUID?.()||String(now),name:activeJob.filename,type:activeJob.mimeType||'application/octet-stream',size:activeJob.size,kind,origin:'file',status:'ready',text:data.text,sections:data.sections||[],quality:data.quality||null,wordCount:countWords(data.text),charCount:data.text.length,duration:data.duration||null,speakers:data.speakers||[],createdAt:now,updatedAt:now,provenance:{extraction:'transcription',model:data.model,transcribedAt:data.transcribedAt,diarized:data.diarized,segmented:data.segmented,segmentCount:data.segmentCount,speakerContinuity:data.speakerContinuity,mediaJobId:activeJob.id,transport:activeJob.transport}}
      const indexedResult=await indexSourceRecord(source,settings);setIndexed(true);setToast?.(`Transcript indexed · ${indexedResult.indexMode}`)
    }catch(error){setMessage(error.message)}finally{setBusy(false)}
  }
  const startRecording=async()=>{
    if(recording)return
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Audio recording is not supported by this browser.')
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;recordedRef.current=[]
      const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported?.(type))||''
      const recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);recorderRef.current=recorder
      recorder.ondataavailable=e=>{if(e.data?.size)recordedRef.current.push(e.data)}
      recorder.onstop=()=>{const mimeType=recorder.mimeType||'audio/webm';const ext=mimeType.includes('ogg')?'ogg':'webm';const blob=new Blob(recordedRef.current,{type:mimeType});chooseFile(new File([blob],`recording-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`,{type:mimeType,lastModified:Date.now()}));stream.getTracks().forEach(track=>track.stop());streamRef.current=null}
      recorder.start(500);setRecording(true);setMessage('Recording locally. Stop when finished; the recording is persisted only after you queue transcription.')
    }catch(error){setMessage(error.message)}
  }
  const stopRecording=()=>{const recorder=recorderRef.current;if(recorder&&recorder.state!=='inactive')recorder.stop();streamRef.current?.getTracks().forEach(track=>track.stop());setRecording(false)}
  useEffect(()=>()=>{streamRef.current?.getTracks().forEach(track=>track.stop())},[])

  const srt=result?.sections?.length?sectionsToSrt(result.sections):''
  const quality=result?.quality
  return <div className="page">
    <div className="row space" style={{alignItems:'flex-start',gap:12}}><div><h1 className="headline">Аудио и видео</h1><p className="subtle" style={{marginTop:5}}>Расшифровка с таймкодами и разделением по говорящим. Результат попадает в библиотеку источников как доказательство с привязкой к моменту записи.</p></div>{result?.model&&<span className="tag">{result.model}</span>}</div>
    <div className="notice" style={{marginTop:14}}>Media jobs are persisted locally before transport. Files up to 24 MB use the direct connector; larger files automatically switch to resumable 6 MB chunks. The gateway reconstructs the original media, extracts its audio with FFmpeg, time-segments it, transcribes each segment and rebases all evidence into one timeline.</div>
    {message&&<div className="notice" style={{marginTop:10}}>{message}</div>}
    <div className="mediaLayout" style={{marginTop:16}}>
      <div className="stack" style={{gap:14}}>
        <Card>
          <div className="row space gap8"><div className="row gap12"><div className="metricIcon"><Icon name="mic"/></div><div><strong>Audio / video source</strong><div className="small subtle">Сначала поставьте файл в очередь, чтобы повтор пережил перезагрузку.</div></div></div><Button tone={recording?'danger':'tonal'} icon={recording?'stop':'mic'} onClick={recording?stopRecording:startRecording}>{recording?'Stop':'Record'}</Button></div>
          <label className="dropzone" style={{display:'block',marginTop:14}}><Icon name="upload_file" size={42}/><p style={{marginTop:8,fontWeight:600}}>{currentName||'Выберите аудио или видео'}</p><p className="small subtle" style={{marginTop:4}}>{currentBlob?`${currentType||'Тип не определён'} · ${fileSize(activeJob?.size||file?.size||0)}`:'Файл остаётся на устройстве, пока вы не нажмёте «Расшифровать».'}</p><input className="hiddenFile" type="file" accept="audio/*,video/mp4,video/webm" onChange={e=>chooseFile(e.target.files?.[0]||null)}/></label>
          {currentBlob&&previewUrl&&<div className="mediaPreview">{String(currentType).startsWith('video/')?<video controls src={previewUrl}/>:<audio controls src={previewUrl}/>}</div>}
          <div className="row gap8" style={{marginTop:12,flexWrap:'wrap'}}>{file&&<Button icon="queue" onClick={transcribe} disabled={busy}>{busy?'Processing…':'Queue & transcribe'}</Button>}{activeJob&&activeJob.status!=='done'&&<Button icon="restart_alt" onClick={()=>resumeJob(activeJob)} disabled={busy}>Resume / retry</Button>}{result?.text&&<Button tone="tonal" icon="inventory_2" onClick={indexTranscript} disabled={busy||indexed}>{indexed?'В поиске':'Добавить в поиск'}</Button>}{srt&&<Button tone="tonal" icon="download" onClick={()=>downloadText(`${currentName||'transcript'}.srt`,srt,'application/x-subrip')}>SRT</Button>}</div>
          {quality&&<div className="qualityRow"><span className={`qualityBadge ${quality.grade}`}>Extraction {quality.grade} · {Math.round((quality.score||0)*100)}%</span>{quality.warnings?.length>0&&<span className="tiny subtle">{quality.warnings.join(' ')}</span>}</div>}
        </Card>
        <Card><div className="row space"><div><h3>Durable queue</h3><p className="small subtle" style={{marginTop:4}}>Raw media stays local in IndexedDB for retry and evidence playback.</p></div><span className="tag">{jobs.length}</span></div><div className="jobList">{jobs.map(job=><div className={`jobRow ${activeJob?.id===job.id?'active':''}`} key={job.id}><button className="jobMain" onClick={()=>selectJob(job)}><div className="row space gap8"><strong>{job.filename}</strong><span className={`jobState ${job.status}`}>{job.status}</span></div><div className="tiny subtle" style={{marginTop:4}}>{fileSize(job.size)} · {job.transport||'pending'} · {Math.round((job.progress||0)*100)}% · attempts {job.attempts||0}{job.upload?.totalChunks?` · chunks ${job.upload.received||0}/${job.upload.totalChunks}`:''}{job.error?` · ${job.error}`:''}</div><div className="jobProgress"><span style={{width:`${Math.max(2,Math.round((job.progress||0)*100))}%`}}/></div></button><div className="row gap8">{job.status!=='done'&&<button className="iconBtn" title="Resume" onClick={()=>resumeJob(job)}><Icon name="restart_alt" size={17}/></button>}<button className="iconBtn" title="Delete" onClick={()=>removeJob(job)}><Icon name="delete" size={17}/></button></div></div>)}{!jobs.length&&<div className="empty small">Очередь обработки пуста.</div>}</div></Card>
      </div>
      <Card>
        <div className="row space"><h3>Transcript</h3><div className="row gap8">{result?.segmented&&<span className="tag">{result.segmentCount} server segments</span>}{result?.speakers?.length>0&&<span className="tag">{result.speakers.length} speakers</span>}</div></div>{result?.segmented&&<div className="notice" style={{marginTop:10}}>Large media was segmented server-side. Timestamps are continuous across the original file; speaker labels are reliable within each segment but may reset identity between segment boundaries.</div>}
        {!result?.sections?.length&&<div className="empty small">Time-coded transcript segments will appear after a queued job completes.</div>}
        {!!result?.sections?.length&&<div className="transcriptList">{result.sections.map((section,index)=><div className="transcriptSegment" key={`${section.locator?.startSeconds||0}-${index}`}><div className="row gap8"><span className="transcriptTime">{secondsLabel(section.locator?.startSeconds||0)}</span>{section.locator?.speaker&&<span className="tag">{section.locator.speaker}</span>}</div><div className="small" style={{marginTop:5,lineHeight:1.5}}>{section.text}</div></div>)}</div>}
      </Card>
    </div>
  </div>
}

function YouTube({settings,setToast}){
  const [url,setUrl]=useState('')
  const [video,setVideo]=useState(null)
  const [loading,setLoading]=useState(false)
  const [message,setMessage]=useState('')
  const [analysis,setAnalysis]=useState('')
  const [indexed,setIndexed]=useState(false)

  const inspect=async()=>{
    if(!url.trim())return
    setLoading(true);setMessage('');setVideo(null);setAnalysis('');setIndexed(false)
    try{const data=await ingestYoutube(url.trim(),settings.youtubeEndpoint);setVideo(data);setMessage(data.status==='ready'?`Получено ${data.sections.length} ${pluralRu(data.sections.length,'фрагмент','фрагмента','фрагментов')} субтитров${data.autoCaptions?' · автосубтитры':''}`:'Описание получено. Субтитров у этого видео нет — расшифровку не выдумываем.')}
    catch(error){setMessage(error.message)}finally{setLoading(false)}
  }
  const indexTranscript=async()=>{
    if(!video?.transcript)return
    setLoading(true)
    try{
      const now=Date.now();const source={id:crypto.randomUUID?.()||String(now),name:video.title,type:'text/youtube-transcript',size:new Blob([video.transcript]).size,kind:'youtube',origin:'youtube',url:video.url,status:'ready',text:video.transcript,sections:video.sections||[],wordCount:countWords(video.transcript),charCount:video.transcript.length,createdAt:now,updatedAt:now,provenance:{videoId:video.id,channel:video.channel,captionLanguage:video.captionLanguage,autoCaptions:video.autoCaptions,fetchedAt:video.fetchedAt}}
      const indexedResult=await indexSourceRecord(source,settings);setIndexed(true);setToast?.(`YouTube transcript indexed · ${indexedResult.indexMode}`)
    }catch(error){setMessage(error.message)}finally{setLoading(false)}
  }
  const analyze=async()=>{
    if(!video?.transcript)return
    setLoading(true);setAnalysis(aiResultText(await runTask(settings,{action:'youtube-analysis',input:`TITLE: ${video.title}\nCHANNEL: ${video.channel}\n\nTRANSCRIPT:\n${video.transcript}`,system:'Analyze only the supplied title/channel/transcript. Do not add video facts, timestamps or claims that are not present.'})));setLoading(false)
  }

  return <div className="page">
    <h1 className="headline">YouTube</h1><p className="subtle" style={{marginTop:5}}>Забирает описание видео и субтитры, если автор их опубликовал. Если субтитров нет — так и будет сказано: расшифровка не выдумывается.</p>
    <div className="searchRow" style={{marginTop:16}}><Input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&inspect()} placeholder="https://youtube.com/watch?v=…"/><Button icon="download" onClick={inspect} disabled={!url.trim()||loading}>{loading?'Fetching…':'Fetch'}</Button></div>
    {message&&<div className="notice" style={{marginTop:14}}>{message}</div>}
    {video&&<div className="youtubeLayout" style={{marginTop:16}}>
      <div><Card><div className="youtubeHero"><img src={video.thumbnail} alt=""/><div><h2 className="youtubeTitle">{video.title}</h2><div className="small subtle" style={{marginTop:5}}>{video.channel||'Канал не указан'}</div><div className="row gap8" style={{marginTop:10,flexWrap:'wrap'}}><span className="tag">{video.captionLanguage||'язык субтитров не указан'}</span>{video.autoCaptions&&<span className="tag">автосубтитры</span>}<span className={`sourceStatus ${video.status==='ready'?'ready':'needs'}`}>{video.status==='ready'?'Субтитры получены':'Только описание'}</span></div></div></div>{video.id&&<div className="youtubeFrame"><iframe title={video.title} src={`https://www.youtube-nocookie.com/embed/${video.id}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/></div>}<div className="row gap8" style={{marginTop:12,flexWrap:'wrap'}}>{video.transcript&&<Button icon="inventory_2" onClick={indexTranscript} disabled={loading||indexed}>{indexed?'В поиске':'Добавить в поиск'}</Button>}{video.transcript&&<Button tone="tonal" icon="summarize" onClick={analyze} disabled={loading}>Разобрать расшифровку</Button>}</div></Card>{analysis&&<Card className="resultBox" style={{marginTop:14}}><strong>Разбор расшифровки</strong><div style={{marginTop:10}}>{analysis}</div></Card>}</div>
      <Card><div className="row space"><h3>Captions</h3><span className="tag">{video.sections?.length||0}</span></div>{!video.sections?.length?<div className="empty small">No caption track was available to this connector. NoteAI does not invent one.</div>:<div className="transcriptList">{video.sections.map((section,index)=><div className="transcriptSegment" key={`${section.locator?.startSeconds||0}-${index}`}><span className="transcriptTime">{secondsLabel(section.locator?.startSeconds||0)}</span><div className="small" style={{marginTop:5,lineHeight:1.5}}>{section.text}</div></div>)}</div>}</Card>
    </div>}
  </div>
}

function Search({workspace,openEditor,settings}){
  const[q,setQ]=useState('');const[mode,setMode]=useState('semantic');const[sourceResults,setSourceResults]=useState([]);const[searching,setSearching]=useState(false);const[selectedSource,setSelectedSource]=useState(null)
  const[history,setHistory]=useState(()=>loadSearchHistory())
  // «Гибридный» режим требует векторов. Без подключённой модели он работает
  // ровно как поиск по словам — переключатель есть, разницы нет. Говорим об
  // этом прямо, вместо того чтобы предлагать выбор без последствий.
  const vectorsAvailable=hasEmbedRoute(settings)
  const tags=useMemo(()=>{const counts=new Map();workspace.notes.forEach(n=>(n.tags||[]).forEach(t=>counts.set(t,(counts.get(t)||0)+1)));return[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([tag])=>tag)},[workspace.notes])

  const noteResults=useMemo(()=>{if(!q.trim())return[];const needle=q.toLowerCase();return workspace.notes.map(n=>({note:n,score:mode==='semantic'?semanticScore(q,n):(`${n.title} ${n.content} ${(n.tags||[]).join(' ')}`.toLowerCase().includes(needle)?1:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12)},[q,mode,workspace.notes])
  useEffect(()=>{let cancelled=false;const query=q.trim();if(!query){setSourceResults([]);setSearching(false);return()=>{cancelled=true}}setSearching(true);const timer=setTimeout(async()=>{try{const[sources,chunks]=await Promise.all([listSources(),listChunks()]);let queryVector=null;if(mode==='semantic'&&hasEmbedRoute(settings)&&chunks.some(c=>Array.isArray(c.vector)&&c.vector.length)){try{const embedded=await embedWithSettings(settings,[query]);queryVector=embedded[0]||null}catch{}}const matches=rankChunks({query,chunks,sources,queryVector,limit:12});if(!cancelled)setSourceResults(matches)}catch{if(!cancelled)setSourceResults([])}finally{if(!cancelled)setSearching(false)}},180);return()=>{cancelled=true;clearTimeout(timer)}},[q,mode,settings?.embedEndpoint,settings?.models,settings?.activeModelId])
  const total=noteResults.length+sourceResults.length

  // Запрос попадает в историю, когда поиск отработал и что-то нашёл, а не на
  // каждое нажатие клавиши — иначе список забьётся префиксами одного слова.
  useEffect(()=>{
    const query=q.trim()
    if(query.length<2||searching||!total)return
    const timer=setTimeout(()=>setHistory(rememberSearch(query)),700)
    return()=>clearTimeout(timer)
  },[q,searching,total])

  return <div className="page"><h1 className="headline">Поиск</h1><p className="subtle small" style={{marginTop:5}}>Единый поиск по заметкам и всем проиндексированным фрагментам источников.</p><div className="segmented" style={{margin:'14px 0',maxWidth:330}}><button className={mode==='semantic'?'active':''} onClick={()=>setMode('semantic')}>По смыслу</button><button className={mode==='keyword'?'active':''} onClick={()=>setMode('keyword')}>По словам</button></div>
    {mode==='semantic'&&!vectorsAvailable&&<p className="small subtle" style={{marginTop:-6,marginBottom:12}}>Поиск по смыслу работает по совпадению слов: для настоящего смыслового поиска нужна модель с ролью «векторный поиск».</p>}<Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Найти мысль, заметку или фрагмент источника…"/>{q&&<div className="small subtle" style={{marginTop:10}}>{searching?'Ищу в источниках…':`${resultsLabel(total)}`}</div>}
    {!!noteResults.length&&<section style={{marginTop:18}}><div className="row gap8"><Icon name="description" size={18}/><h3>Заметки</h3></div><div className="notesList">{noteResults.map(({note,score})=><div key={note.id} style={{position:'relative'}}><NoteRow note={note} onOpen={()=>openEditor(note.id)}/><span className="tag" style={{position:'absolute',right:12,top:12}}>{Math.round(score*100)}%</span></div>)}</div></section>}
    {!!sourceResults.length&&<section style={{marginTop:18}}><div className="row gap8"><Icon name="inventory_2" size={18}/><h3>Источники</h3></div><div className="searchSourceList">{sourceResults.map(({chunk,source,score},i)=><button className="searchSourceResult" key={`${chunk.id||chunk.sourceId}:${i}`} onClick={()=>source&&setSelectedSource({source,locator:chunk.locator,excerpt:chunk.text})}><div className="row space gap8"><strong>{source?.name||'Источник без названия'}</strong><span className="tag">{Math.round(score*100)}%</span></div><div className="tiny subtle" style={{marginTop:4}}>{source?.kind||'text'}{locatorLabel(chunk.locator,chunk.sectionLabel)?` · ${locatorLabel(chunk.locator,chunk.sectionLabel)}`:''}</div><div className="small searchSourceSnippet">{chunk.text}</div></button>)}</div></section>}
    {q&&!searching&&!total&&<div className="empty"><Icon name="search_off" size={42}/><p style={{marginTop:8}}>Ничего не найдено — ни в заметках, ни в проиндексированных источниках.</p></div>}

    {/* Пустой экран поиска раньше был полем и двумя переключателями: он не
        обещал ничего и ничему не учил. Здесь — то, что искали раньше, и то,
        по чему вообще можно искать, из реальных данных. */}
    {!q&&<div className="searchStart">
      {!!history.length&&<section>
        <div className="row space"><h3>Недавние запросы</h3><button className="textAction" onClick={()=>setHistory(clearSearchHistory())}>Очистить</button></div>
        <div className="chips" style={{marginTop:10}}>{history.map(item=><button className="chip" key={item} onClick={()=>setQ(item)}><Icon name="history" size={16}/>{item}</button>)}</div>
      </section>}

      {!!tags.length&&<section style={{marginTop:history.length?18:0}}>
        <h3>Ваши темы</h3>
        <div className="chips" style={{marginTop:10}}>{tags.map(tag=><button className="chip" key={tag} onClick={()=>setQ(tag)}>#{tag}</button>)}</div>
      </section>}

      <section style={{marginTop:(history.length||tags.length)?18:0}}>
        <h3>Где ищем</h3>
        <div className="searchScopeList">
          <div className="searchScopeRow"><Icon name="description" size={20}/><div><strong>{notesLabel(workspace.notes.length)}</strong><p className="small subtle">Заголовки, текст и теги</p></div></div>
          <div className="searchScopeRow"><Icon name="inventory_2" size={20}/><div><strong>Проиндексированные источники</strong><p className="small subtle">Фрагменты с привязкой к странице, моменту записи или посту</p></div></div>
        </div>
      </section>
    </div>}
    <SourcePreview selection={selectedSource} onClose={()=>setSelectedSource(null)}/>
  </div>
}

// Карта тем: кластеры по реальным тегам заметок.
// Вид внутри «Заметок», а не отдельный экран — строится из тех же данных и
// раньше был недостижим: на него не вела ни одна ссылка.
function GraphView({workspace,openEditor}){
  const tags=useMemo(()=>{const m=new Map();workspace.notes.forEach(n=>(n.tags||[]).forEach(t=>m.set(t,[...(m.get(t)||[]),n])));return[...m.entries()].sort((a,b)=>b[1].length-a[1].length)},[workspace.notes])
  const tagged=workspace.notes.filter(n=>(n.tags||[]).length)
  if(!tags.length)return <div className="empty"><Icon name="hub" size={48}/><p style={{marginTop:8}}>Добавьте теги к заметкам, чтобы увидеть, как они связаны.</p></div>
  return <div>
    <div className="graph">{tags.map(([tag,notes])=><div className="graphNode" key={tag}><strong>#{tag}</strong><div className="tiny subtle">{notesLabel(notes.length)}</div></div>)}</div>
    <div className="notesList" style={{marginTop:16}}>{tagged.map(n=><button key={n.id} className="chip" style={{textAlign:'left'}} onClick={()=>openEditor(n.id)}>{n.title||'Без названия'} · {(n.tags||[]).map(t=>`#${t}`).join(' ')}</button>)}</div>
  </div>
}

// Задачи: вид внутри «Заметок». Раньше — отдельный экран, на который вела
// одна ссылка с главной и ни одного пункта навигации.
function TasksView({workspace,setWorkspace}){
  const[text,setText]=useState('');const[priority,setPriority]=useState('medium');const add=()=>{if(!text.trim())return;const d=new Date();d.setDate(d.getDate()+1);setWorkspace(w=>({...w,tasks:[{id:crypto.randomUUID?.()||String(Date.now()),text:text.trim(),done:false,priority,due:d.toISOString().slice(0,10),category:'Общее'},...w.tasks]}));setText('')};const toggle=id=>setWorkspace(w=>({...w,tasks:w.tasks.map(t=>t.id===id?{...t,done:!t.done}:t)}));const del=id=>setWorkspace(w=>({...w,tasks:w.tasks.filter(t=>t.id!==id)}));const labels={urgent:'срочно',high:'высокий',medium:'средний',low:'низкий'}
  return <div><div className="searchRow"><Input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Добавить задачу…"/><select className="select" style={{maxWidth:150}} value={priority} onChange={e=>setPriority(e.target.value)}><option value="urgent">Срочно</option><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option></select><Button icon="add" onClick={add}>Добавить</Button></div><div className="notesList">{workspace.tasks.map(t=><div className={`task ${t.done?'done':''}`} key={t.id}><button className={`check ${t.done?'on':''}`} onClick={()=>toggle(t.id)}>{t.done&&<Icon name="check" size={16}/>}</button><div><div style={{fontSize:15,fontWeight:600,textDecoration:t.done?'line-through':'none'}}>{t.text}</div><div className="tiny subtle">{t.category} · {new Date(t.due).toLocaleDateString('ru-RU')}</div></div><span className={`priority ${t.priority}`}>{labels[t.priority]||t.priority}</span><button className="iconBtn" onClick={()=>del(t.id)} aria-label="Удалить"><Icon name="delete" size={18}/></button></div>)}</div></div>
}

function Settings({workspace,setWorkspace,settings,setSettings,setToast}){
  const fileRef=useRef(null)
  const ACCOUNT_CREDENTIAL='noteai-account-session-v1'
  const [endpoint,setEndpoint]=useState(settings.aiEndpoint)
  const [embedEndpoint,setEmbedEndpoint]=useState(settings.embedEndpoint||'/api/embed')
  const [visionEndpoint,setVisionEndpoint]=useState(settings.visionEndpoint||'/api/vision')
  const [transcribeEndpoint,setTranscribeEndpoint]=useState(settings.transcribeEndpoint||'/api/transcribe')
  const [youtubeEndpoint,setYoutubeEndpoint]=useState(settings.youtubeEndpoint||'/api/youtube')
  const [model,setModel]=useState(settings.aiModel)
  const [health,setHealth]=useState(null)
  const [checking,setChecking]=useState(false)
  const [storageState,setStorageState]=useState(null)

  const [accountEndpoint,setAccountEndpoint]=useState(settings.accountEndpoint||'/api/account')
  const [accountWorkspaceId,setAccountWorkspaceId]=useState(settings.accountWorkspaceId||'default')
  const [accountEmail,setAccountEmail]=useState(settings.accountEmail||'')
  const [accountPassword,setAccountPassword]=useState('')
  const [registrationToken,setRegistrationToken]=useState('')
  const [accountToken,setAccountToken]=useState('')
  const [accountInfo,setAccountInfo]=useState(null)
  const [accountSessions,setAccountSessions]=useState([])
  const [accountBusy,setAccountBusy]=useState(false)
  const [accountMessage,setAccountMessage]=useState('')

  const [syncEndpoint,setSyncEndpoint]=useState(settings.syncEndpoint||'/api/sync')
  const [syncWorkspaceId,setSyncWorkspaceId]=useState(settings.syncWorkspaceId||'default')
  const [syncToken,setSyncToken]=useState(settings.syncToken||'')
  const [syncBusy,setSyncBusy]=useState(false)
  const [syncMessage,setSyncMessage]=useState('')

  const deviceName=useMemo(()=>{
    const ua=String(navigator.userAgent||'')
    const platform=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':'Web/PWA'
    return `${platform} · ${credentialSecurityMode()}`
  },[])

  const loadAccountState=useCallback(async(token,endpointValue=accountEndpoint)=>{
    if(!token){setAccountInfo(null);setAccountSessions([]);return}
    try{
      const info=await accountMe({endpoint:endpointValue,token})
      setAccountInfo(info.account)
      const sessionData=await listAccountSessions({endpoint:endpointValue,token}).catch(()=>({sessions:[]}))
      setAccountSessions(sessionData.sessions||[])
    }catch(error){
      if(error.status===401){await removeCredential(ACCOUNT_CREDENTIAL);clearApiSessionAuth();setAccountToken('');setAccountInfo(null);setAccountSessions([])}
      throw error
    }
  },[accountEndpoint])

  useEffect(()=>{let live=true;(async()=>{const token=await getCredential(ACCOUNT_CREDENTIAL);if(!live||!token)return;setApiSessionAuth(token,settings.accountEndpoint||'/api/account');setAccountToken(token);try{await loadAccountState(token,settings.accountEndpoint||'/api/account')}catch{}})();return()=>{live=false}},[])

  // Что показывает свёрнутый блок шлюза: состояние, а не пустое поле.
  const gatewaySummary=useMemo(()=>{
    const wired=[['aiEndpoint','модель'],['embedEndpoint','векторный поиск'],['visionEndpoint','распознавание'],['transcribeEndpoint','расшифровка'],['youtubeEndpoint','YouTube']]
      .filter(([key])=>String(settings[key]||'').trim()).map(([,label])=>label)
    if(health?.ok===false)return{text:`Шлюз не отвечает: ${health.error||'нет связи'}`,tone:'warn'}
    if(!wired.length)return{text:'Не настроен — и не нужен, если модель подключена выше',tone:'neutral'}
    return{text:`Подключено: ${wired.join(', ')}`,tone:'ok'}
  },[settings.aiEndpoint,settings.embedEndpoint,settings.visionEndpoint,settings.transcribeEndpoint,settings.youtubeEndpoint,health])

  const saveAI=()=>{setSettings(s=>({...s,aiEndpoint:endpoint.trim(),embedEndpoint:embedEndpoint.trim(),visionEndpoint:visionEndpoint.trim(),transcribeEndpoint:transcribeEndpoint.trim(),youtubeEndpoint:youtubeEndpoint.trim(),aiModel:model.trim()||'server-default'}));setToast('Connector settings saved')}
  const checkGateway=async()=>{setChecking(true);try{const response=await fetch(healthEndpointFor(endpoint));const data=await response.json();if(!response.ok)throw new Error(data.error||`Health check ${response.status}`);setHealth(data);setToast('Server health check complete')}catch(error){setHealth({ok:false,error:error.message});setToast(error.message)}finally{setChecking(false)}}
  const requestPersistentStorage=async()=>{try{if(!navigator.storage?.persist)throw new Error('Persistent storage API is unavailable in this browser');const granted=await navigator.storage.persist();setStorageState(granted?'granted':'not-granted');setToast(granted?'Persistent local storage granted':'Browser did not grant persistent storage')}catch(error){setStorageState('unsupported');setToast(error.message)}}

  const saveAccountConfig=()=>{const nextEndpoint=accountEndpoint.trim()||'/api/account';const nextWorkspace=accountWorkspaceId.trim()||'default';setSettings(current=>({...current,accountEndpoint:nextEndpoint,accountWorkspaceId:nextWorkspace,accountEmail:accountEmail.trim(),accountRevision:current.accountWorkspaceId===nextWorkspace?(current.accountRevision||0):0}));if(accountToken)setApiSessionAuth(accountToken,nextEndpoint);setAccountMessage('Настройки синхронизации сохранены.');setToast('Настройки аккаунта сохранены')}
  const signInAccount=async()=>{setAccountBusy(true);setAccountMessage('');try{const data=await loginAccount({endpoint:accountEndpoint,email:accountEmail,password:accountPassword,deviceName});await setCredential(ACCOUNT_CREDENTIAL,data.token);setApiSessionAuth(data.token,accountEndpoint);setAccountToken(data.token);setAccountInfo(data.account);setAccountPassword('');setSettings(current=>({...current,accountEndpoint,accountWorkspaceId,accountEmail:data.account.email,accountRevision:current.accountWorkspaceId===accountWorkspaceId?(current.accountRevision||0):0}));await loadAccountState(data.token,accountEndpoint);setAccountMessage(`Signed in as ${data.account.email}. Session is stored using ${credentialSecurityMode()}.`);setToast('Signed in')}catch(error){setAccountMessage(error.message);setToast(error.message)}finally{setAccountBusy(false)}}
  const createAccount=async()=>{setAccountBusy(true);setAccountMessage('');try{const data=await registerAccount({endpoint:accountEndpoint,email:accountEmail,password:accountPassword,displayName:settings.profile?.name||'',registrationToken,deviceName});await setCredential(ACCOUNT_CREDENTIAL,data.token);setApiSessionAuth(data.token,accountEndpoint);setAccountToken(data.token);setAccountInfo(data.account);setAccountPassword('');setRegistrationToken('');setSettings(current=>({...current,accountEndpoint,accountWorkspaceId,accountEmail:data.account.email,accountRevision:0}));await loadAccountState(data.token,accountEndpoint);setAccountMessage('Account created and this device is signed in.');setToast('Account created')}catch(error){setAccountMessage(error.message);setToast(error.message)}finally{setAccountBusy(false)}}
  const signOutAccount=async()=>{setAccountBusy(true);try{if(accountToken)await logoutAccount({endpoint:accountEndpoint,token:accountToken}).catch(()=>{});await removeCredential(ACCOUNT_CREDENTIAL);clearApiSessionAuth();setAccountToken('');setAccountInfo(null);setAccountSessions([]);setAccountPassword('');setAccountMessage('Signed out on this device.');setToast('Signed out')}finally{setAccountBusy(false)}}
  const refreshSessions=async()=>{if(!accountToken)return;setAccountBusy(true);try{await loadAccountState(accountToken,accountEndpoint);setAccountMessage('Device sessions refreshed.')}catch(error){setAccountMessage(error.message)}finally{setAccountBusy(false)}}
  const revokeSession=async id=>{if(!accountToken)return;setAccountBusy(true);try{const data=await revokeAccountSession({endpoint:accountEndpoint,token:accountToken,sessionId:id});if(data.current){await removeCredential(ACCOUNT_CREDENTIAL);clearApiSessionAuth();setAccountToken('');setAccountInfo(null);setAccountSessions([]);setAccountMessage('Current device session revoked.')}else{await loadAccountState(accountToken,accountEndpoint);setAccountMessage('Device session revoked.')}}catch(error){setAccountMessage(error.message)}finally{setAccountBusy(false)}}
  const pushAccount=async()=>{if(!accountToken)return;setAccountBusy(true);setAccountMessage('');try{const sources=await listSources(),chunks=await listChunks();const data=await pushAccountSync({endpoint:accountEndpoint,workspaceId:accountWorkspaceId,token:accountToken,baseRevision:settings.accountWorkspaceId===accountWorkspaceId?(settings.accountRevision||0):0,workspace,settings:{...settings,accountEndpoint,accountWorkspaceId,accountEmail},sources,chunks});setSettings(current=>({...current,accountEndpoint,accountWorkspaceId,accountEmail,accountRevision:data.revision}));setAccountMessage(`Pushed account revision ${data.revision} · ${new Date(data.updatedAt).toLocaleString()}`);setToast('Account workspace pushed')}catch(error){if(error.status===409)setAccountMessage(`Conflict: remote revision ${error.data?.currentRevision??'?'} is newer. Pull before pushing again.`);else setAccountMessage(error.message);setToast(error.message)}finally{setAccountBusy(false)}}
  const pullAccount=async()=>{if(!accountToken)return;if(!confirm('Pulling will replace local notes and indexed source metadata with this account checkpoint. Local queued media files remain on this device. Continue?'))return;setAccountBusy(true);setAccountMessage('');try{const data=await pullAccountSync({endpoint:accountEndpoint,workspaceId:accountWorkspaceId,token:accountToken});const snapshot=data.snapshot;setWorkspace(snapshot.workspace);await replaceSourcesWithChunks(snapshot.sources,snapshot.chunks);setSettings(current=>({...current,...snapshot.settings,accountEndpoint,accountWorkspaceId,accountEmail,accountRevision:data.revision}));setEndpoint(snapshot.settings.aiEndpoint||endpoint);setEmbedEndpoint(snapshot.settings.embedEndpoint||embedEndpoint);setVisionEndpoint(snapshot.settings.visionEndpoint||visionEndpoint);setTranscribeEndpoint(snapshot.settings.transcribeEndpoint||transcribeEndpoint);setYoutubeEndpoint(snapshot.settings.youtubeEndpoint||youtubeEndpoint);setModel(snapshot.settings.aiModel||model);setAccountMessage(`Pulled account revision ${data.revision} · ${new Date(data.updatedAt).toLocaleString()}`);setToast('Account workspace pulled')}catch(error){setAccountMessage(error.status===404?'No account checkpoint exists yet. Push this device first.':error.message);setToast(error.message)}finally{setAccountBusy(false)}}

  const saveSyncConfig=()=>{setSettings(current=>({...current,syncEndpoint:syncEndpoint.trim()||'/api/sync',syncWorkspaceId:syncWorkspaceId.trim()||'default',syncToken,syncRevision:current.syncWorkspaceId===(syncWorkspaceId.trim()||'default')?(current.syncRevision||0):0}));setSyncMessage('Настройки старой синхронизации сохранены на этом устройстве.');setToast('Настройки старой синхронизации сохранены')}
  const pushSync=async()=>{setSyncBusy(true);setSyncMessage('');try{const sources=await listSources(),chunks=await listChunks();const data=await pushWorkspaceSync({endpoint:syncEndpoint,workspaceId:syncWorkspaceId,token:syncToken,baseRevision:settings.syncWorkspaceId===syncWorkspaceId?(settings.syncRevision||0):0,workspace,settings:{...settings,syncEndpoint,syncWorkspaceId},sources,chunks});setSettings(current=>({...current,syncEndpoint,syncWorkspaceId,syncToken,syncRevision:data.revision}));setSyncMessage(`Pushed legacy revision ${data.revision} · ${new Date(data.updatedAt).toLocaleString()}`);setToast('Legacy checkpoint pushed')}catch(error){if(error.status===409)setSyncMessage(`Conflict: remote revision ${error.data?.currentRevision??'?'} is newer. Pull before pushing again.`);else setSyncMessage(error.message);setToast(error.message)}finally{setSyncBusy(false)}}
  const pullSync=async()=>{if(!confirm('Pulling will replace local notes and indexed source metadata with the selected legacy checkpoint. Local queued media files are kept. Continue?'))return;setSyncBusy(true);setSyncMessage('');try{const data=await pullWorkspaceSync({endpoint:syncEndpoint,workspaceId:syncWorkspaceId,token:syncToken});const snapshot=data.snapshot;setWorkspace(snapshot.workspace);await replaceSourcesWithChunks(snapshot.sources,snapshot.chunks);setSettings(current=>({...current,...snapshot.settings,syncEndpoint,syncWorkspaceId,syncToken,syncRevision:data.revision,accountEndpoint:current.accountEndpoint,accountWorkspaceId:current.accountWorkspaceId,accountRevision:current.accountRevision,accountEmail:current.accountEmail}));setEndpoint(snapshot.settings.aiEndpoint||endpoint);setEmbedEndpoint(snapshot.settings.embedEndpoint||embedEndpoint);setVisionEndpoint(snapshot.settings.visionEndpoint||visionEndpoint);setTranscribeEndpoint(snapshot.settings.transcribeEndpoint||transcribeEndpoint);setYoutubeEndpoint(snapshot.settings.youtubeEndpoint||youtubeEndpoint);setModel(snapshot.settings.aiModel||model);setSyncMessage(`Pulled legacy revision ${data.revision} · ${new Date(data.updatedAt).toLocaleString()}`);setToast('Legacy checkpoint pulled')}catch(error){setSyncMessage(error.status===404?'No remote checkpoint exists yet. Push this device first.':error.message);setToast(error.message)}finally{setSyncBusy(false)}}

  const exportAll=async()=>{const sources=await listSources();const chunks=await listChunks();downloadText(`noteai-backup-${new Date().toISOString().slice(0,10)}.json`,exportBundle(workspace,settings,{sources,chunks}))}
  const importAll=async e=>{const f=e.target.files?.[0];if(!f)return;try{const bundle=importBundle(await f.text());setWorkspace(bundle.workspace);setSettings(current=>({...bundle.settings,syncToken:current.syncToken||'',syncEndpoint:current.syncEndpoint||bundle.settings.syncEndpoint||'/api/sync',syncWorkspaceId:current.syncWorkspaceId||bundle.settings.syncWorkspaceId||'default',syncRevision:current.syncRevision||0,accountEndpoint:current.accountEndpoint||'/api/account',accountWorkspaceId:current.accountWorkspaceId||'default',accountRevision:current.accountRevision||0,accountEmail:current.accountEmail||''}));setEndpoint(bundle.settings.aiEndpoint);setEmbedEndpoint(bundle.settings.embedEndpoint||'/api/embed');setVisionEndpoint(bundle.settings.visionEndpoint||'/api/vision');setTranscribeEndpoint(bundle.settings.transcribeEndpoint||'/api/transcribe');setYoutubeEndpoint(bundle.settings.youtubeEndpoint||'/api/youtube');setModel(bundle.settings.aiModel);if(bundle.sources?.length){const bySource=new Map();for(const chunk of bundle.chunks||[]){if(!bySource.has(chunk.sourceId))bySource.set(chunk.sourceId,[]);bySource.get(chunk.sourceId).push(chunk)}for(const source of bundle.sources)await saveSourceWithChunks(source,(bySource.get(source.id)||[]).sort((a,b)=>a.index-b.index))}setToast('Резервная копия восстановлена')}catch(err){setToast(err.message)}finally{e.target.value=''}}

  return <div className="page settingsPageV49"><div className="settingsPageTitle"><h1 className="headline youHeadline">Профиль</h1><p className="subtle small">Настройки применяются сразу и сохраняются на этом устройстве.</p></div><div className="settingsGrid">
    <Card className="personalSettingsCard"><div className="profileSettingsRow"><div className="avatar profileAvatarLarge">{(settings.profile?.name||'N')[0]}</div><label className="settingLabel profileNameField">Имя<Input value={settings.profile?.name||''} onChange={e=>setSettings(current=>({...current,profile:{...(current.profile||{}),name:e.target.value}}))} placeholder="Ваше имя"/></label></div><div className="styleChooser"><div className="sectionHeader"><div><strong>Стиль оформления</strong><span className="small subtle">Три светлых темы. Тёмной нет намеренно.</span></div></div><div className="styleGrid">{APP_STYLES.map(([id,label,note])=><button key={id} className={`styleTile ${(settings.style||APP_STYLES[0][0])===id?'active':''}`} data-preview={id} onClick={()=>setSettings(s=>({...s,style:id}))}><span className="stylePreview" aria-hidden="true"><i/><i/><i/></span><span className="styleName">{label}</span><span className="styleNote">{note}</span></button>)}</div></div><div className="settingsSectionLine"><div><strong>Размер текста</strong><span>Меняет интерфейс и редактор</span></div><div className="segmented compactSegment">{[['small','Меньше'],['normal','Обычно'],['large','Больше']].map(([value,label])=><button key={value} className={(settings.fontScale||'normal')===value?'active':''} onClick={()=>setSettings(s=>({...s,fontScale:value}))}>{label}</button>)}</div></div><div className="settingsSectionLine"><div><strong>Плотность</strong><span>Количество информации на экране</span></div><div className="segmented compactSegment">{[['compact','Плотно'],['comfortable','Свободно']].map(([value,label])=><button key={value} className={(settings.density||'compact')===value?'active':''} onClick={()=>setSettings(s=>({...s,density:value}))}>{label}</button>)}</div></div></Card>

    <Card className="modelManagerCard"><ModelManager
      models={settings.models||[]}
      activeModelId={settings.activeModelId||''}
      onChange={({models,activeModelId})=>setSettings(current=>({...current,models,activeModelId}))}
      setToast={setToast}
    /></Card>
    <Disclosure title="Свой сервер-шлюз" summary={gatewaySummary.text} tone={gatewaySummary.tone}>
    <div className="row space"><p className="small subtle" style={{margin:0}}>Нужно только если вы держите собственный шлюз. Модель, подключённая выше, работает и без него.</p><Button tone="tonal" icon="health_and_safety" onClick={checkGateway} disabled={checking}>{checking?'Проверка…':'Проверить'}</Button></div><div className="connectorGrid" style={{marginTop:12}}><label className="settingLabel">AI<Input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="/api/ai"/></label><label className="settingLabel">Embeddings<Input value={embedEndpoint} onChange={e=>setEmbedEndpoint(e.target.value)} placeholder="/api/embed"/></label><label className="settingLabel">Vision / OCR<Input value={visionEndpoint} onChange={e=>setVisionEndpoint(e.target.value)} placeholder="/api/vision"/></label><label className="settingLabel">Transcription<Input value={transcribeEndpoint} onChange={e=>setTranscribeEndpoint(e.target.value)} placeholder="/api/transcribe"/></label><label className="settingLabel">YouTube<Input value={youtubeEndpoint} onChange={e=>setYoutubeEndpoint(e.target.value)} placeholder="/api/youtube"/></label><label className="settingLabel">AI model<Input value={model} onChange={e=>setModel(e.target.value)} placeholder="server-default"/></label></div><div className="row gap8" style={{marginTop:12,flexWrap:'wrap'}}><Button icon="save" onClick={saveAI}>Сохранить подключения</Button>{health&&<span className={`sourceStatus ${health.ok?'ready':'needs'}`}>{health.ok?`Server v${health.version||'?'} · AI ${health.aiConfigured?'configured':'not configured'}`:health.error||'Server unavailable'}</span>}</div>{health?.ok&&<div className="healthGrid"><div><span>Text</span><strong>{health.model}</strong></div><div><span>Vision</span><strong>{health.visionModel}</strong></div><div><span>Embeddings</span><strong>{health.embeddingModel}</strong></div><div><span>Transcription</span><strong>{health.transcriptionModel}</strong></div><div><span>Large media</span><strong>{health.durableWorkerQueue?'durable queue':health.resumableUploads?'resumable':'off'}</strong></div><div><span>FFmpeg</span><strong>{health.ffmpeg?'ready':'missing'}</strong></div><div><span>Heavy workers</span><strong>{Number.isFinite(health.activeLargeMediaTasks)?`${health.activeLargeMediaTasks}/${health.maxLargeMediaTasks||'?'}`:'—'}</strong></div><div><span>Accounts</span><strong>{health.accountAuth?'sessions':'off'}</strong></div><div><span>Registration</span><strong>{health.registrationEnabled?'enabled':'closed'}</strong></div><div><span>Legacy sync</span><strong>{health.syncConfigured?'ready':'off'}</strong></div></div>}</Disclosure>

    <Disclosure title="Аккаунт и устройства" summary={accountInfo?`Вход выполнен: ${accountInfo.email}`:'Вход не выполнен — заметки только на этом устройстве'} tone={accountInfo?'ok':'neutral'}>
    <div className="row space"><div><p className="small subtle" style={{marginTop:5}}>Отдельная отзываемая сессия на каждое устройство. На Android она шифруется ключом Android Keystore, в браузере живёт только до конца сессии.</p></div><span className="tag">rev {settings.accountRevision||0}</span></div>
      <div className="connectorGrid" style={{marginTop:12}}><label className="settingLabel">Account endpoint<Input value={accountEndpoint} onChange={e=>setAccountEndpoint(e.target.value)} placeholder="/api/account"/></label><label className="settingLabel">Workspace ID<Input value={accountWorkspaceId} onChange={e=>setAccountWorkspaceId(e.target.value.replace(/[^A-Za-z0-9_-]/g,''))} placeholder="default"/></label><label className="settingLabel">Email<Input type="email" value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} placeholder="you@example.com"/></label>{!accountInfo&&<label className="settingLabel">Password<Input type="password" value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} placeholder="12+ characters"/></label>}{!accountInfo&&<label className="settingLabel analysisWide">Registration token <span className="tiny subtle">нужен только при создании аккаунта</span><Input type="password" value={registrationToken} onChange={e=>setRegistrationToken(e.target.value)} placeholder="Gateway REGISTRATION_TOKEN"/></label>}</div>
      <div className="row gap8" style={{marginTop:12,flexWrap:'wrap'}}><Button tone="tonal" icon="save" onClick={saveAccountConfig}>Сохранить</Button>{accountInfo?<><Button tone="tonal" icon="cloud_download" onClick={pullAccount} disabled={accountBusy}>Получить</Button><Button icon="cloud_upload" onClick={pushAccount} disabled={accountBusy}>Отправить</Button><Button tone="tonal" icon="devices" onClick={refreshSessions} disabled={accountBusy}>Устройства</Button><Button tone="danger" icon="logout" onClick={signOutAccount} disabled={accountBusy}>Выйти</Button></>:<><Button icon="login" onClick={signInAccount} disabled={accountBusy||!accountEmail||!accountPassword}>{accountBusy?'Выполняется…':'Войти'}</Button><Button tone="tonal" icon="person_add" onClick={createAccount} disabled={accountBusy||!accountEmail||!accountPassword||!registrationToken}>Создать аккаунт</Button></>}</div>
      {accountInfo&&<div className="notice" style={{marginTop:10}}><strong>{accountInfo.displayName||accountInfo.email}</strong><div className="tiny subtle" style={{marginTop:3}}>{accountInfo.email} · credential: {credentialSecurityMode()}</div></div>}
      {accountMessage&&<div className="notice" style={{marginTop:10}}>{accountMessage}</div>}
      {!!accountSessions.length&&<div className="notesList" style={{marginTop:10}}>{accountSessions.map(session=><div className="task" key={session.id}><Icon name={session.current?'smartphone':'devices'} size={18}/><div style={{flex:1}}><div className="small"><strong>{session.deviceName}</strong>{session.current?' · current':''}</div><div className="tiny subtle">last seen {new Date(session.lastSeenAt||session.createdAt).toLocaleString()} · expires {new Date(session.expiresAt).toLocaleDateString()}</div></div><button className="iconBtn" title="Revoke session" onClick={()=>revokeSession(session.id)}><Icon name="logout" size={16}/></button></div>)}</div>}
      <p className="tiny subtle" style={{marginTop:10}}>Медиафайлы остаются на устройстве. Удалённые снимки защищены от конфликта ревизий. Пароль и ключ сессии в резервные копии не попадают.</p>
    </Disclosure>

    <Disclosure title="Старый режим синхронизации" summary="Для переноса со своих шлюзов. Для новых установок не нужен.">
    <div className="row space"><div><p className="small subtle" style={{marginTop:5}}>Старый режим для собственных шлюзов, оставлен для переноса данных. Для новых установок используйте аккаунт выше.</p></div><span className="tag">rev {settings.syncRevision||0}</span></div><div className="connectorGrid" style={{marginTop:12}}><label className="settingLabel">Sync endpoint<Input value={syncEndpoint} onChange={e=>setSyncEndpoint(e.target.value)} placeholder="/api/sync"/></label><label className="settingLabel">Workspace ID<Input value={syncWorkspaceId} onChange={e=>setSyncWorkspaceId(e.target.value.replace(/[^A-Za-z0-9_-]/g,''))} placeholder="default"/></label><label className="settingLabel analysisWide">Shared token<Input type="password" value={syncToken} onChange={e=>setSyncToken(e.target.value)} placeholder="Legacy SYNC_TOKEN"/></label></div><div className="row gap8" style={{marginTop:12,flexWrap:'wrap'}}><Button tone="tonal" icon="save" onClick={saveSyncConfig}>Сохранить</Button><Button tone="tonal" icon="cloud_download" onClick={pullSync} disabled={syncBusy||!syncToken||!syncWorkspaceId}>{syncBusy?'Working…':'Pull'}</Button><Button tone="tonal" icon="cloud_upload" onClick={pushSync} disabled={syncBusy||!syncToken||!syncWorkspaceId}>{syncBusy?'Working…':'Push'}</Button></div>{syncMessage&&<div className="notice" style={{marginTop:10}}>{syncMessage}</div>}</Disclosure>

    <Disclosure title="Данные и резервные копии" summary={`${notesLabel(workspace.notes.length)}, ${tasksLabel(workspace.tasks.length)} на этом устройстве`}><p className="small subtle" style={{marginTop:5}}>Экспорт и восстановление заметок, задач, настроек, источников и индекса. Пароли и исходные медиафайлы в резервную копию не входят.</p><div className="row gap8" style={{marginTop:12,flexWrap:'wrap'}}><Button tone="tonal" icon="database" onClick={requestPersistentStorage}>Защитить локальные данные</Button>{storageState&&<span className="tag">storage {storageState}</span>}<Button tone="tonal" icon="download" onClick={exportAll}>Экспорт копии</Button><Button tone="tonal" icon="upload" onClick={()=>fileRef.current?.click()}>Импорт копии</Button><input ref={fileRef} className="hiddenFile" type="file" accept="application/json" onChange={importAll}/><Button tone="danger" icon="delete_forever" onClick={()=>{if(confirm('Удалить все локальные заметки, задачи, чаты и проиндексированные источники?')){setWorkspace({notes:[],tasks:[],chats:[]});clearSourceDb().catch(()=>{});setToast('Локальные данные удалены')}}}>Удалить локальные данные</Button></div></Disclosure>


  </div></div>
}
