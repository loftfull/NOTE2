import { instagramUrlDescriptor, sharedUrlDescriptor } from './unified-source.js'

const URL_RE=/https?:\/\/[^\s<>'"\]]+/ig
const INSTAGRAM_RE=/https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?[^\s]*/i

export function sharedUrlsFromEvent(event={}){
  const texts=Array.isArray(event.texts)?event.texts:[]
  const combined=[event.title,...texts].filter(Boolean).join('\n')
  return [...combined.matchAll(URL_RE)].map(match=>match[0].replace(/[),.;]+$/,''))
}

export function sharedSourceDescriptorFromEvent(event={}){
  for(const url of sharedUrlsFromEvent(event)){
    const descriptor=sharedUrlDescriptor(url)
    if(descriptor)return descriptor
  }
  return null
}

export function instagramSharedUrlDescriptor(rawUrl=''){
  const descriptor=instagramUrlDescriptor(rawUrl)
  if(!descriptor)return null
  return{
    shortcode:descriptor.providerId,
    routeType:descriptor.captureContext?.routeType||descriptor.sourceType,
    canonicalUrl:descriptor.canonicalUrl,
    requestedMediaIndex:Number(descriptor.captureContext?.requestedMediaIndex)||0,
    sharedUrl:descriptor.sharedUrl
  }
}

export function instagramUrlFromSharedEvent(event={}){
  const texts=Array.isArray(event.texts)?event.texts:[]
  const combined=[event.title,...texts].filter(Boolean).join('\n')
  return combined.match(INSTAGRAM_RE)?.[0]||''
}

async function sharePluginListener(handler){
  if(typeof window==='undefined')return()=>{}
  try{
    const { Capacitor }=await import('@capacitor/core')
    if(!Capacitor.isNativePlatform())return()=>{}
    const { CapacitorShareTarget }=await import('@capgo/capacitor-share-target')
    const handle=await CapacitorShareTarget.addListener('shareReceived',handler)
    return()=>handle?.remove?.()
  }catch(error){console.warn('NOTE2 share target unavailable',error);return()=>{}}
}

export async function installUniversalShareTargetListener(onSourceShare){
  return sharePluginListener((event)=>{
    const descriptor=sharedSourceDescriptorFromEvent(event)
    if(descriptor)onSourceShare?.(descriptor,event)
  })
}

// Backward-compatible Instagram-only listener retained while v4.5 UI migration is in progress.
export async function installShareTargetListener(onInstagramUrl){
  return sharePluginListener((event)=>{
    const url=instagramUrlFromSharedEvent(event)
    if(url)onInstagramUrl?.(url,event)
  })
}
