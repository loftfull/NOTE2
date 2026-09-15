const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export function parseTimeOffset(value='') {
  const raw=String(value||'').trim().toLowerCase()
  if(!raw)return 0
  if(/^\d+$/.test(raw))return Number(raw)
  if(/^\d+(?:\.\d+)?s$/.test(raw))return Math.floor(Number.parseFloat(raw))
  let total=0,matched=false
  const re=/(\d+(?:\.\d+)?)(h|m|s)/g
  let match
  while((match=re.exec(raw))){matched=true;const amount=Number.parseFloat(match[1])||0;if(match[2]==='h')total+=amount*3600;else if(match[2]==='m')total+=amount*60;else total+=amount}
  return matched?Math.max(0,Math.floor(total)):0
}

export function youtubeUrlDescriptor(rawUrl='') {
  try{
    const url=new URL(String(rawUrl).trim())
    const host=url.hostname.toLowerCase().replace(/^www\./,'')
    let videoId=''
    if(host==='youtu.be')videoId=url.pathname.split('/').filter(Boolean)[0]||''
    else if(host==='youtube.com'||host.endsWith('.youtube.com')){
      if(url.pathname==='/watch')videoId=url.searchParams.get('v')||''
      else{
        const parts=url.pathname.split('/').filter(Boolean)
        if(['shorts','embed','live'].includes(parts[0]))videoId=parts[1]||''
      }
    }
    if(!/^[A-Za-z0-9_-]{6,20}$/.test(videoId))return null
    const startSeconds=parseTimeOffset(url.searchParams.get('t')||url.searchParams.get('start')||'')
    const playlistId=String(url.searchParams.get('list')||'').trim()
    const rawIndex=Number.parseInt(url.searchParams.get('index')||'',10)
    return{
      provider:'youtube',
      providerId:videoId,
      sourceType:url.pathname.includes('/shorts/')?'shorts':url.pathname.includes('/live/')?'live':'video',
      canonicalUrl:`https://www.youtube.com/watch?v=${videoId}`,
      sharedUrl:url.toString(),
      captureContext:{startSeconds,playlistId:playlistId||null,playlistIndex:Number.isInteger(rawIndex)&&rawIndex>0?rawIndex-1:null}
    }
  }catch{return null}
}

export function instagramUrlDescriptor(rawUrl='') {
  try{
    const url=new URL(String(rawUrl).trim())
    if(!['instagram.com','www.instagram.com','m.instagram.com'].includes(url.hostname.toLowerCase()))return null
    const parts=url.pathname.split('/').filter(Boolean)
    if(!['p','reel','tv'].includes(parts[0])||!parts[1])return null
    const requested=Number.parseInt(url.searchParams.get('img_index')||'',10)
    return{
      provider:'instagram',
      providerId:parts[1],
      sourceType:parts[0]==='reel'?'reel':parts[0]==='tv'?'video':'post',
      canonicalUrl:`https://www.instagram.com/${parts[0]}/${parts[1]}/`,
      sharedUrl:url.toString(),
      captureContext:{routeType:parts[0],requestedMediaIndex:Number.isInteger(requested)&&requested>0?requested-1:0}
    }
  }catch{return null}
}

export function webUrlDescriptor(rawUrl='') {
  try{
    const url=new URL(String(rawUrl).trim())
    if(!HTTP_PROTOCOLS.has(url.protocol))return null
    const instagram=instagramUrlDescriptor(url.toString());if(instagram)return instagram
    const youtube=youtubeUrlDescriptor(url.toString());if(youtube)return youtube
    ;['utm_source','utm_medium','utm_campaign','utm_term','utm_content','igsh','si','fbclid','gclid'].forEach(key=>url.searchParams.delete(key))
    url.hash=''
    return{provider:'web',providerId:url.toString(),sourceType:'article',canonicalUrl:url.toString(),sharedUrl:String(rawUrl).trim(),captureContext:{}}
  }catch{return null}
}

export function sharedUrlDescriptor(rawUrl='') {
  return instagramUrlDescriptor(rawUrl)||youtubeUrlDescriptor(rawUrl)||webUrlDescriptor(rawUrl)
}

export function sourceProvider(source={}) {
  if(source.provider)return source.provider
  if(source.kind==='instagram'||source.instagram)return'instagram'
  if(source.kind==='youtube'||source.provenance?.videoId)return'youtube'
  if(source.origin==='url'||source.kind==='url')return'web'
  if(['pdf','docx','pptx','xlsx','odt','ods','odp','epub'].includes(source.kind))return'document'
  if(['image','audio','video'].includes(source.kind))return'media'
  return'local'
}

export function sourceProviderLabel(sourceOrProvider='') {
  const provider=typeof sourceOrProvider==='string'?sourceOrProvider:sourceProvider(sourceOrProvider)
  return({instagram:'Instagram',youtube:'YouTube',web:'Веб',document:'Документ',media:'Медиа',local:'Локальный'})[provider]||provider||'Источник'
}

export function unifiedSourceView(source={}) {
  const provider=sourceProvider(source)
  const title=String(source.title||source.name||source.instagram?.caption?.split('\n')[0]||source.url||'Без названия').trim()
  const author=provider==='instagram'?(source.instagram?.owner?.username?`@${source.instagram.owner.username}`:'Instagram'):provider==='youtube'?(source.provenance?.channel||source.channel||'YouTube'):(source.author||'')
  const count=provider==='instagram'?(source.instagram?.media?.length||0):0
  const sourceType=provider==='instagram'?(source.instagram?.requestContext?.routeType==='reel'?'reel':count>1?'carousel':'post'):provider==='youtube'?'video':source.kind||'source'
  return{id:source.id,provider,title,author,sourceType,thumbnail:source.thumbnail||null,description:provider==='instagram'?(source.instagram?.caption||''):(source.description||source.text||''),state:source.status||'saved',favorite:!!(source.favorite||source.instagram?.favorite),offline:provider==='instagram'?(source.instagram?.offlinePinned?'media-offline':'metadata-only'):(source.offline||'metadata-only'),savedAt:source.createdAt||null,progress:source.progress||null,original:source}
}

export function createPendingSourceFromDescriptor(descriptor, now=Date.now()) {
  if(!descriptor)return null
  return{
    id:`${descriptor.provider}:${descriptor.providerId}`,
    provider:descriptor.provider,
    providerId:descriptor.providerId,
    sourceType:descriptor.sourceType,
    kind:descriptor.provider==='instagram'?'instagram':descriptor.provider==='youtube'?'youtube':'url',
    origin:'share-target',
    name:descriptor.provider==='instagram'?`Instagram · ${descriptor.providerId}`:descriptor.provider==='youtube'?`YouTube · ${descriptor.providerId}`:descriptor.canonicalUrl,
    url:descriptor.canonicalUrl,
    canonicalUrl:descriptor.canonicalUrl,
    originalUrl:descriptor.sharedUrl,
    captureContext:descriptor.captureContext||{},
    status:'saved',
    text:'',sections:[],wordCount:0,charCount:0,size:0,
    createdAt:now,updatedAt:now,
    provenance:{provider:descriptor.provider,sharedUrl:descriptor.sharedUrl,canonicalUrl:descriptor.canonicalUrl}
  }
}
