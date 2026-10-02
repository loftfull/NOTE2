import { authenticatedFetch } from './secure-credentials.js'

export function instagramEndpointFor(aiEndpoint='/api/ai'){
  try{const base=new URL(aiEndpoint||'/api/ai',window.location.href);return new URL('/api/instagram',base.origin).toString()}catch{return'/api/instagram'}
}

export async function ingestInstagramPost(url, aiEndpoint='/api/ai'){
  const endpoint=instagramEndpointFor(aiEndpoint)
  const response=await authenticatedFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data?.error||'Не удалось сохранить пост Instagram')
  return data
}

export function instagramArchivedMediaUrl(shortcode,index,aiEndpoint='/api/ai'){
  const endpoint=instagramEndpointFor(aiEndpoint)
  return `${endpoint}/${encodeURIComponent(shortcode)}/media/${Number(index)||0}`
}
