const ALLOWED_HOSTS = new Set(['instagram.com','www.instagram.com','m.instagram.com'])
const POST_TYPES = new Set(['p','reel','tv'])

export function instagramUrlDescriptor(rawUrl='') {
  let url
  try { url = new URL(String(rawUrl).trim()) } catch { throw new Error('Некорректная ссылка Instagram') }
  const host = url.hostname.toLowerCase()
  if (!ALLOWED_HOSTS.has(host)) throw new Error('Поддерживаются только ссылки instagram.com')
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Некорректная схема ссылки Instagram')
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2 || !POST_TYPES.has(parts[0])) throw new Error('Нужна ссылка на пост, Reels или видео Instagram')
  const shortcode = parts[1]
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(shortcode)) throw new Error('Некорректный shortcode Instagram')
  const routeType = parts[0]
  const requested = Number.parseInt(url.searchParams.get('img_index') || '', 10)
  const requestedMediaIndex = Number.isInteger(requested) && requested > 0 ? requested - 1 : 0
  return {
    shortcode,
    routeType,
    canonicalUrl: `https://www.instagram.com/${routeType}/${shortcode}/`,
    requestedMediaIndex,
    sharedUrl: url.toString()
  }
}

export function instagramShortcode(rawUrl='') {
  return instagramUrlDescriptor(rawUrl).shortcode
}

export function canonicalInstagramUrl(rawUrl='') {
  return instagramUrlDescriptor(rawUrl).canonicalUrl
}

export function instagramArchiveKey(shortcode='') {
  const value = String(shortcode)
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(value)) throw new Error('Некорректный Instagram archive key')
  return value
}

export function normalizeInstagramMedia(items=[]) {
  if (!Array.isArray(items)) return []
  return items.slice(0, 30).map((item,index)=>{
    const kind = item?.kind === 'video' || item?.isVideo ? 'video' : 'image'
    const url = String(item?.url || item?.videoUrl || item?.displayUrl || '').trim()
    if (!/^https?:\/\//i.test(url)) throw new Error(`Instagram media ${index+1} имеет некорректный URL`)
    return {
      index,
      kind,
      url,
      width: Number(item?.width)||0,
      height: Number(item?.height)||0,
      alt: String(item?.alt||'').slice(0,4000),
      mimeType: kind === 'video' ? 'video/mp4' : 'image/jpeg'
    }
  })
}

export function normalizeInstagramPost(payload={}, originalUrl='') {
  const shortcode = instagramArchiveKey(payload.shortcode || instagramShortcode(originalUrl))
  const url = canonicalInstagramUrl(originalUrl || payload.url)
  const caption = String(payload.caption||'').trim().slice(0,100_000)
  const username = String(payload?.owner?.username || payload.username || '').trim().replace(/^@/,'').slice(0,80)
  const media = normalizeInstagramMedia(payload.media || [])
  if (!media.length) throw new Error('Instagram не вернул медиафайлы для поста')
  return {
    shortcode,
    url,
    type: String(payload.type || payload.typename || (media.length>1?'carousel':media[0].kind)).slice(0,80),
    caption,
    owner: {
      username,
      fullName: String(payload?.owner?.fullName || '').slice(0,160)
    },
    takenAt: payload.takenAt || null,
    media,
    provenance: {
      provider: 'instaloader',
      originalUrl: url,
      fetchedAt: new Date().toISOString()
    }
  }
}
