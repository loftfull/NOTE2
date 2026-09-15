import { authenticatedFetch } from './secure-credentials.js'
import { deleteOfflineAssetsForSource, getOfflineAsset, putOfflineAsset } from './source-db.js'

export function instagramOfflineAssetKey(sourceId,index){return `${String(sourceId||'')}:${Number(index)||0}`}

export async function loadInstagramMediaBlob(source,index){
  const item=(source?.instagram?.media||[]).find(x=>Number(x.index)===Number(index))||(source?.instagram?.media||[])[index]
  if(!item)throw new Error('Instagram media item not found')
  const cached=await getOfflineAsset(source.id,item.index).catch(()=>null)
  if(cached?.blob)return {blob:cached.blob,offline:true}
  if(!item.archiveUrl)throw new Error('Archived media URL is missing')
  const response=await authenticatedFetch(item.archiveUrl)
  if(!response.ok)throw new Error(`Media load failed: HTTP ${response.status}`)
  return {blob:await response.blob(),offline:false}
}

export async function pinInstagramSourceOffline(source,onProgress=()=>{}){
  const media=source?.instagram?.media||[];let bytes=0
  for(let i=0;i<media.length;i++){
    const item=media[i];const existing=await getOfflineAsset(source.id,item.index).catch(()=>null)
    if(existing?.blob){bytes+=Number(existing.bytes||existing.blob.size||0);onProgress({done:i+1,total:media.length,bytes,cached:true});continue}
    if(!item.archiveUrl)throw new Error(`Media ${Number(item.index)+1} is not archived yet`)
    const response=await authenticatedFetch(item.archiveUrl);if(!response.ok)throw new Error(`Media ${Number(item.index)+1}: HTTP ${response.status}`)
    const blob=await response.blob();bytes+=blob.size
    await putOfflineAsset({sourceId:source.id,index:item.index,blob,contentType:blob.type||item.contentType||'',bytes:blob.size})
    onProgress({done:i+1,total:media.length,bytes,cached:false})
  }
  return {sourceId:source.id,count:media.length,bytes,pinnedAt:Date.now()}
}

export async function unpinInstagramSourceOffline(sourceId){await deleteOfflineAssetsForSource(sourceId);return true}
