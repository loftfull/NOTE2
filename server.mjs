import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { accountIdForEmail, createPasswordRecord, createSessionCredential, normalizeEmail, parseSessionToken, publicAccount, publicSession, sessionExpiry, validEmail, validatePassword, verifyPassword, verifySessionSecret } from './account-auth-core.mjs'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { captionEventsToSections, captionTracksFromHtml, formatSeconds, normalizeTranscription, splitVisionPages, youtubeVideoId } from './media-connectors.mjs'
import { assessExtractionQuality } from './src/extraction-quality.js'
import { validWorkspaceId, validateSyncSnapshot } from './sync-core.mjs'
import { DEFAULT_SEGMENT_SECONDS, DEFAULT_UPLOAD_CHUNK_BYTES, expectedChunkBytes, mergeTranscriptionParts, sanitizeUploadName, totalChunks, uploadIdFromResumeKey, uploadProgress } from './large-media-core.mjs'
import { canonicalInstagramUrl, instagramArchiveKey, instagramShortcode, instagramUrlDescriptor, normalizeInstagramPost } from './instagram-core.mjs'

const PORT = Number(process.env.PORT || 8080)
const DIST = new URL('./dist/', import.meta.url).pathname
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/,'')
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6'
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_MODEL
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small'
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe-diarize'
const MAX_FETCH_BYTES = Number(process.env.MAX_FETCH_BYTES || 2_000_000)
const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 24_000_000)
const MAX_VISUAL_BYTES = Number(process.env.MAX_VISUAL_BYTES || 18_000_000)
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean)
const LARGE_MEDIA_ROOT = process.env.LARGE_MEDIA_ROOT || join(tmpdir(), 'noteai-v3-large-media')
const MAX_LARGE_MEDIA_BYTES = Number(process.env.MAX_LARGE_MEDIA_BYTES || 2_000_000_000)
const UPLOAD_CHUNK_BYTES = Math.min(16 * 1024 * 1024, Math.max(1024 * 1024, Number(process.env.UPLOAD_CHUNK_BYTES || DEFAULT_UPLOAD_CHUNK_BYTES)))
const MEDIA_SEGMENT_SECONDS = Math.max(60, Number(process.env.MEDIA_SEGMENT_SECONDS || DEFAULT_SEGMENT_SECONDS))
const LARGE_MEDIA_TTL_HOURS = Math.max(1, Number(process.env.LARGE_MEDIA_TTL_HOURS || 24))
const MAX_LARGE_MEDIA_TASKS = Math.max(1, Number(process.env.MAX_LARGE_MEDIA_TASKS || 2))
const SYNC_TOKEN = String(process.env.SYNC_TOKEN || '')
const SYNC_ROOT = process.env.SYNC_ROOT || join(process.cwd(), 'data', 'sync')
const MAX_SYNC_BYTES = Number(process.env.MAX_SYNC_BYTES || 20_000_000)
const AUTH_ROOT = process.env.AUTH_ROOT || join(process.cwd(), 'data', 'auth')
const ACCOUNT_SYNC_ROOT = process.env.ACCOUNT_SYNC_ROOT || join(process.cwd(), 'data', 'account-sync')
const REGISTRATION_TOKEN = String(process.env.REGISTRATION_TOKEN || '')
const ACCOUNT_SESSION_TTL_DAYS = Math.min(365, Math.max(1, Number(process.env.ACCOUNT_SESSION_TTL_DAYS || 30)))
const ACCOUNT_MAX_SESSIONS = Math.min(50, Math.max(1, Number(process.env.ACCOUNT_MAX_SESSIONS || 12)))
const LOGIN_WINDOW_MS = Math.max(60_000, Number(process.env.LOGIN_WINDOW_MS || 300_000))
const LOGIN_MAX_FAILURES = Math.min(50, Math.max(3, Number(process.env.LOGIN_MAX_FAILURES || 8)))
const REQUIRE_ACCOUNT_AUTH = /^(1|true|yes)$/i.test(String(process.env.REQUIRE_ACCOUNT_AUTH || 'false'))
const INSTAGRAM_ROOT = process.env.INSTAGRAM_ROOT || join(process.cwd(), 'data', 'instagram')
const INSTAGRAM_FETCH_SCRIPT = process.env.INSTAGRAM_FETCH_SCRIPT || join(process.cwd(), 'scripts', 'instagram_fetch.py')
const PYTHON_PATH = process.env.PYTHON_PATH || 'python3'
const MAX_INSTAGRAM_ITEMS = Math.min(30, Math.max(1, Number(process.env.MAX_INSTAGRAM_ITEMS || 20)))
const MAX_INSTAGRAM_ITEM_BYTES = Math.min(250_000_000, Math.max(1_000_000, Number(process.env.MAX_INSTAGRAM_ITEM_BYTES || 100_000_000)))
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe'
const ffmpegAvailable = spawnSync(FFMPEG_PATH, ['-version'], { stdio:'ignore' }).status === 0 && spawnSync(FFPROBE_PATH, ['-version'], { stdio:'ignore' }).status === 0
const largeMediaTasks = new Map()
const loginFailures = new Map()
let shuttingDown=false

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'}
const commonHeaders = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(self), microphone=(self), geolocation=()',
  'Cross-Origin-Opener-Policy':'same-origin'
}

function applyCors(req,res){const origin=String(req.headers.origin||'');if(!origin||!CORS_ORIGINS.length)return false;const allowed=CORS_ORIGINS.includes('*')||CORS_ORIGINS.includes(origin);if(!allowed)return false;res.setHeader('Access-Control-Allow-Origin',CORS_ORIGINS.includes('*')?'*':origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-File-Name,X-Chunk-Bytes,Authorization,X-Registration-Token');res.setHeader('Access-Control-Max-Age','600');return true}
function json(res, status, body){res.writeHead(status,{...commonHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))}
function readBody(req, maxBytes = 2_000_000){return new Promise((resolve,reject)=>{let data='';let bytes=0;req.on('data',c=>{bytes+=Buffer.byteLength(c);if(bytes>maxBytes){reject(new Error('Request too large'));req.destroy();return}data+=c});req.on('end',()=>{try{resolve(data?JSON.parse(data):{})}catch(e){reject(e)}});req.on('error',reject)})}
function readBinaryBody(req, maxBytes){return new Promise((resolve,reject)=>{const parts=[];let total=0;const declared=Number(req.headers['content-length']||0);if(declared>maxBytes){reject(new Error('Request too large'));req.destroy();return}req.on('data',chunk=>{total+=chunk.length;if(total>maxBytes){reject(new Error('Request too large'));req.destroy();return}parts.push(chunk)});req.on('end',()=>resolve(Buffer.concat(parts,total)));req.on('error',reject)})}
function headerFilename(req){try{return decodeURIComponent(String(req.headers['x-file-name']||'upload')).replace(/[\r\n\\/]/g,'_').slice(0,180)||'upload'}catch{return'upload'}}
function outputText(data){if(typeof data?.output_text==='string')return data.output_text;return(data?.output||[]).flatMap(item=>item?.content||[]).filter(x=>x?.type==='output_text'||typeof x?.text==='string').map(x=>x.text||'').join('\n').trim()}
function actionInstruction(action){const map={summarize:'Summarize the supplied content faithfully. Preserve important facts and uncertainty.',keywords:'Extract the most useful keywords and entities. Do not invent entities.',improve:'Improve clarity and structure without changing meaning or adding unsupported facts.',title:'Return one concise descriptive title only.','url-analysis':'If you cannot access the URL contents from the provided input, say so explicitly. Never pretend you fetched it.','youtube-analysis':'Do not fabricate transcript, metadata, timestamps, or claims. Analyze only information actually present in the input/context.','grounded-analysis':'Answer strictly from the supplied evidence blocks. Cite every material statement with the provided [S#] references. If evidence is insufficient, say so explicitly.',chat:'Answer the user directly and distinguish facts from assumptions.'};return map[action]||'Be accurate, concise, and do not invent facts.'}

async function openAiResponse(payload){
  const upstream=await fetch(`${OPENAI_BASE_URL}/responses`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(120_000)})
  const data=await upstream.json().catch(()=>({}))
  if(!upstream.ok)throw Object.assign(new Error(data?.error?.message||'OpenAI request failed'),{status:upstream.status})
  return data
}

async function handleAI(req,res){
  if(!OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY is not configured'})
  try{const body=await readBody(req);const history=Array.isArray(body.history)?body.history.slice(-10):[];const historyText=history.map(m=>`${m.role}: ${m.content}`).join('\n');const input=historyText||String(body.input||'');const instructions=[body.system,actionInstruction(body.action),'Return plain text unless structured output is explicitly requested.'].filter(Boolean).join('\n\n');const data=await openAiResponse({model:body.model&&body.model!=='server-default'?body.model:OPENAI_MODEL,instructions,input});return json(res,200,{output:outputText(data),provider:'openai',model:data.model||OPENAI_MODEL,responseId:data.id})}
  catch(error){return json(res,error.status||500,{error:error.message||'AI proxy failed'})}
}

async function handleEmbed(req,res){
  if(!OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY is not configured'})
  try{const body=await readBody(req);const inputs=(Array.isArray(body.inputs)?body.inputs:[body.input]).filter(x=>typeof x==='string'&&x.trim()).slice(0,64);if(!inputs.length)return json(res,400,{error:'No embedding inputs supplied'});if(inputs.some(x=>x.length>24_000))return json(res,413,{error:'Embedding input is too large'});const upstream=await fetch(`${OPENAI_BASE_URL}/embeddings`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify({model:OPENAI_EMBED_MODEL,input:inputs,encoding_format:'float'}),signal:AbortSignal.timeout(60_000)});const data=await upstream.json().catch(()=>({}));if(!upstream.ok)return json(res,upstream.status,{error:data?.error?.message||'OpenAI request failed'});const vectors=(data.data||[]).sort((a,b)=>a.index-b.index).map(item=>item.embedding);return json(res,200,{vectors,model:data.model||OPENAI_EMBED_MODEL,usage:data.usage})}
  catch(error){return json(res,500,{error:error.message||'Embedding proxy failed'})}
}

function privateIp(address){if(!address)return true;if(address==='::1'||address==='0:0:0:0:0:0:0:1')return true;if(address.startsWith('fc')||address.startsWith('fd')||address.startsWith('fe80:'))return true;if(address.startsWith('::ffff:'))address=address.slice(7);if(isIP(address)===4){const p=address.split('.').map(Number);return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||p[0]>=224}return false}
async function assertPublicUrl(raw){let url;try{url=new URL(raw)}catch{throw new Error('Invalid URL')}if(!['http:','https:'].includes(url.protocol))throw new Error('Only http/https URLs are supported');if(url.username||url.password)throw new Error('Credentialed URLs are not supported');const host=url.hostname.toLowerCase();if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))throw new Error('Private/local URLs are blocked');const addresses=await lookup(host,{all:true,verbatim:true});if(!addresses.length||addresses.some(x=>privateIp(x.address)))throw new Error('Private-network targets are blocked');return url}
async function readResponseLimited(response,limit){const reader=response.body?.getReader();if(!reader)return new Uint8Array(await response.arrayBuffer());const parts=[];let total=0;while(true){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){reader.cancel();throw new Error(`Remote content exceeds ${Math.round(limit/1_000_000)} MB limit`)}parts.push(value)}const out=new Uint8Array(total);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength}return out}
function cleanHtml(html=''){return String(html).replace(/<!--[\s\S]*?-->/g,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ').replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
function htmlTitle(html=''){return cleanHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').slice(0,180)}
async function fetchPublicText(rawUrl){let url=await assertPublicUrl(rawUrl);for(let redirect=0;redirect<5;redirect+=1){const response=await fetch(url,{redirect:'manual',headers:{'User-Agent':'NoteAI/3.5 source-ingestion','Accept':'text/html,text/plain,application/json,application/xml,text/xml;q=0.9,*/*;q=0.1'},signal:AbortSignal.timeout(12_000)});if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Redirect has no Location header');url=await assertPublicUrl(new URL(location,url).toString());continue}if(!response.ok)throw new Error(`Remote server returned ${response.status}`);const contentType=(response.headers.get('content-type')||'').toLowerCase();const allowed=contentType.includes('text/')||contentType.includes('json')||contentType.includes('xml')||contentType.includes('html');if(!allowed)throw new Error(`Unsupported remote content type: ${contentType||'unknown'}`);const declared=Number(response.headers.get('content-length')||0);if(declared>MAX_FETCH_BYTES)throw new Error('Remote content is too large');const bytes=await readResponseLimited(response,MAX_FETCH_BYTES);const raw=new TextDecoder('utf-8',{fatal:false}).decode(bytes);const isHtml=contentType.includes('html')||/^\s*</.test(raw);const text=isHtml?cleanHtml(raw):raw.replace(/\r\n?/g,'\n').trim();if(!text)throw new Error('Remote page contains no extractable text');return{url:url.toString(),title:isHtml?htmlTitle(raw):'',contentType,bytes:bytes.byteLength,text,fetchedAt:new Date().toISOString()}}throw new Error('Too many redirects')}
async function handleSourceUrl(req,res){try{const body=await readBody(req,64_000);return json(res,200,await fetchPublicText(String(body.url||'')))}catch(error){return json(res,400,{error:error.message||'URL ingestion failed'})}}


async function instagramScope(req){
  const auth=await accountSession(req,{touch:false}).catch(()=>null)
  return auth?.account?.id||'local'
}
function instagramPostDir(scope,shortcode){
  const safeScope=/^[a-f0-9]{32}$/.test(String(scope))?String(scope):'local'
  return join(INSTAGRAM_ROOT,safeScope,instagramArchiveKey(shortcode))
}
function instagramMetadataPath(scope,shortcode){return join(instagramPostDir(scope,shortcode),'metadata.json')}
function instagramMediaPath(scope,shortcode,index){
  if(!Number.isInteger(index)||index<0||index>=MAX_INSTAGRAM_ITEMS)throw new Error('Invalid Instagram media index')
  return join(instagramPostDir(scope,shortcode),`media-${String(index).padStart(2,'0')}`)
}
async function runInstagramFetcher(shortcode){
  return new Promise((resolve,reject)=>{
    const child=spawn(PYTHON_PATH,[INSTAGRAM_FETCH_SCRIPT,shortcode],{stdio:['ignore','pipe','pipe'],env:process.env})
    let out='',err=''
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Instagram metadata fetch timed out'))},45_000)
    child.stdout.on('data',d=>{out+=d.toString();if(out.length>2_000_000)out=out.slice(-2_000_000)})
    child.stderr.on('data',d=>{err+=d.toString();if(err.length>16_000)err=err.slice(-16_000)})
    child.on('error',error=>{clearTimeout(timer);reject(error)})
    child.on('close',code=>{
      clearTimeout(timer)
      let data={}
      try{data=JSON.parse(out.trim()||'{}')}catch{}
      if(code===0&&!data.error)return resolve(data)
      reject(new Error(data.error||err.trim()||`Instagram fetcher exited with ${code}`))
    })
  })
}
async function fetchPublicBinary(rawUrl,limit){
  let url=await assertPublicUrl(rawUrl)
  for(let redirect=0;redirect<5;redirect+=1){
    const response=await fetch(url,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 NoteAI/4.1 InstagramArchive','Accept':'image/avif,image/webp,image/apng,image/*,video/mp4,video/*;q=0.9,*/*;q=0.1'},signal:AbortSignal.timeout(60_000)})
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Instagram media redirect has no Location');url=await assertPublicUrl(new URL(location,url).toString());continue}
    if(!response.ok)throw new Error(`Instagram media returned ${response.status}`)
    const declared=Number(response.headers.get('content-length')||0);if(declared>limit)throw new Error('Instagram media item is too large')
    const bytes=await readResponseLimited(response,limit)
    const contentType=String(response.headers.get('content-type')||'application/octet-stream').split(';')[0].toLowerCase()
    if(!contentType.startsWith('image/')&&!contentType.startsWith('video/'))throw new Error(`Unsupported Instagram media type: ${contentType}`)
    return{bytes,contentType,url:url.toString()}
  }
  throw new Error('Too many Instagram media redirects')
}
async function readInstagramMetadata(scope,shortcode){try{return JSON.parse(await readFile(instagramMetadataPath(scope,shortcode),'utf8'))}catch{return null}}
async function archiveInstagramPost(req,rawUrl){
  const shortcode=instagramShortcode(rawUrl)
  const scope=await instagramScope(req)
  const existing=await readInstagramMetadata(scope,shortcode)
  if(existing?.media?.length)return existing
  const raw=await runInstagramFetcher(shortcode)
  const normalized=normalizeInstagramPost(raw,canonicalInstagramUrl(rawUrl))
  normalized.media=normalized.media.slice(0,MAX_INSTAGRAM_ITEMS)
  const dir=instagramPostDir(scope,shortcode);await mkdir(dir,{recursive:true})
  const archived=[]
  try{
    for(const item of normalized.media){
      const result=await fetchPublicBinary(item.url,MAX_INSTAGRAM_ITEM_BYTES)
      const path=instagramMediaPath(scope,shortcode,item.index)
      await writeFile(path,result.bytes)
      archived.push({...item,contentType:result.contentType,bytes:result.bytes.byteLength,archived:true,remoteUrl:item.url})
    }
    const record={...normalized,media:archived,archivedAt:new Date().toISOString(),archiveVersion:1}
    await writeFile(instagramMetadataPath(scope,shortcode),JSON.stringify(record,null,2))
    return record
  }catch(error){await rm(dir,{recursive:true,force:true}).catch(()=>{});throw error}
}
function publicInstagramPost(record){
  return{...record,media:(record.media||[]).map(item=>({...item,url:`/api/instagram/${encodeURIComponent(record.shortcode)}/media/${item.index}`,remoteUrl:undefined}))}
}
async function handleInstagram(req,res){
  try{
    const body=await readBody(req,64_000)
    const rawUrl=String(body.url||'')
    const requestContext=instagramUrlDescriptor(rawUrl)
    const record=await archiveInstagramPost(req,rawUrl)
    return json(res,200,{...publicInstagramPost(record),requestContext})
  }
  catch(error){const msg=error.message||'Instagram import failed';const status=/private|login|unavailable|not found/i.test(msg)?422:400;return json(res,status,{error:msg})}
}
async function handleInstagramMetadata(req,res,shortcode){
  try{instagramArchiveKey(shortcode);const scope=await instagramScope(req);const record=await readInstagramMetadata(scope,shortcode);if(!record)return json(res,404,{error:'Instagram post not found'});return json(res,200,publicInstagramPost(record))}catch(error){return json(res,400,{error:error.message})}
}
async function handleInstagramMedia(req,res,shortcode,index){
  try{
    instagramArchiveKey(shortcode);const scope=await instagramScope(req);const record=await readInstagramMetadata(scope,shortcode);if(!record)return json(res,404,{error:'Instagram post not found'})
    const item=(record.media||[]).find(x=>Number(x.index)===index);if(!item)return json(res,404,{error:'Instagram media not found'})
    const path=instagramMediaPath(scope,shortcode,index);if(!existsSync(path))return json(res,404,{error:'Instagram archived media file missing'})
    res.writeHead(200,{...commonHeaders,'Content-Type':item.contentType||item.mimeType||'application/octet-stream','Content-Length':String(statSync(path).size),'Cache-Control':'private, max-age=86400','Content-Disposition':`inline; filename="instagram-${shortcode}-${index}${String(item.contentType||'').startsWith('video/')?'.mp4':'.jpg'}"`})
    return createReadStream(path).pipe(res)
  }catch(error){return json(res,400,{error:error.message||'Unable to read Instagram media'})}
}

function visualPrompt(type){
  if(type==='application/pdf')return 'Extract the document faithfully page by page. Preserve headings, lists, table cell text and visible labels. Output each page under an exact delimiter like --- Page 1 ---. Do not invent unreadable or missing text. If a page has no readable content, write [No readable text].'
  return 'Analyze this image as an evidence source. First transcribe all readable visible text faithfully. Then add a section named --- VISUAL CONTEXT --- describing only visible facts that help interpret the image. Do not infer identities or hidden facts.'
}
async function handleVision(req,res){
  if(!OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY is not configured'})
  try{
    const filename=headerFilename(req),contentType=String(req.headers['content-type']||'application/octet-stream').split(';')[0].toLowerCase()
    const allowed=contentType==='application/pdf'||['image/jpeg','image/png','image/webp','image/gif'].includes(contentType)
    if(!allowed)return json(res,415,{error:`Unsupported visual content type: ${contentType}`})
    const bytes=await readBinaryBody(req,MAX_VISUAL_BYTES);if(!bytes.length)return json(res,400,{error:'Empty upload'})
    const encoded=bytes.toString('base64')
    const media=contentType==='application/pdf'?{type:'input_file',filename,file_data:encoded}:{type:'input_image',image_url:`data:${contentType};base64,${encoded}`}
    const data=await openAiResponse({model:OPENAI_VISION_MODEL,input:[{role:'user',content:[{type:'input_text',text:visualPrompt(contentType)},media]}]})
    const text=outputText(data);if(!text)return json(res,502,{error:'Vision model returned no text'})
    const sections=splitVisionPages(text)
    const quality=assessExtractionQuality(text,sections)
    return json(res,200,{text,sections,quality,model:data.model||OPENAI_VISION_MODEL,responseId:data.id,extractedAt:new Date().toISOString(),mode:contentType==='application/pdf'?'pdf-vision':'image-vision'})
  }catch(error){return json(res,error.status||500,{error:error.message||'Vision extraction failed'})}
}

const TRANSCRIBE_EXTENSIONS=new Set(['flac','mp3','mp4','mpeg','mpga','m4a','ogg','wav','webm'])
function extension(name=''){return String(name).split('.').pop()?.toLowerCase()||''}
async function transcribeUpstream(bytes,filename,contentType,model){
  const form=new FormData();form.set('file',new Blob([bytes],{type:contentType||'application/octet-stream'}),filename);form.set('model',model)
  if(model.includes('diarize')){form.set('response_format','diarized_json');form.set('chunking_strategy','auto')}
  else if(model==='whisper-1'){form.set('response_format','verbose_json');form.append('timestamp_granularities[]','segment')}
  else form.set('response_format','json')
  const upstream=await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`,{method:'POST',headers:{'Authorization':`Bearer ${OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(180_000)})
  const data=await upstream.json().catch(()=>({}));return{upstream,data}
}
async function handleTranscribe(req,res){
  if(!OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY is not configured'})
  try{
    const filename=headerFilename(req),contentType=String(req.headers['content-type']||'application/octet-stream').split(';')[0]
    if(!TRANSCRIBE_EXTENSIONS.has(extension(filename)))return json(res,415,{error:'Unsupported transcription format. Use FLAC, MP3, MP4, MPEG/MPGA, M4A, OGG, WAV or WEBM.'})
    const bytes=await readBinaryBody(req,MAX_MEDIA_BYTES);if(!bytes.length)return json(res,400,{error:'Empty upload'})
    let model=OPENAI_TRANSCRIBE_MODEL;let{upstream,data}=await transcribeUpstream(bytes,filename,contentType,model)
    if(!upstream.ok&&model.includes('diarize')){model='gpt-4o-transcribe';({upstream,data}=await transcribeUpstream(bytes,filename,contentType,model))}
    if(!upstream.ok)return json(res,upstream.status,{error:data?.error?.message||'Transcription failed'})
    const normalized=normalizeTranscription(data)
    const quality=assessExtractionQuality(normalized.text,normalized.sections)
    return json(res,200,{...normalized,quality,model,transcribedAt:new Date().toISOString(),diarized:normalized.speakers.length>0,rawUsage:data.usage||null})
  }catch(error){return json(res,500,{error:error.message||'Transcription failed'})}
}



function uploadDir(id){if(!/^[a-f0-9]{32}$/.test(String(id||'')))throw new Error('Invalid upload id');return join(LARGE_MEDIA_ROOT,id)}
function uploadMetaPath(id){return join(uploadDir(id),'meta.json')}
function uploadChunkPath(id,index){return join(uploadDir(id),`chunk-${String(index).padStart(6,'0')}.part`)}
async function readUploadMeta(id){try{return JSON.parse(await readFile(uploadMetaPath(id),'utf8'))}catch{return null}}
async function writeUploadMeta(meta){await mkdir(uploadDir(meta.uploadId),{recursive:true});await writeFile(uploadMetaPath(meta.uploadId),JSON.stringify(meta,null,2))}
async function actualReceivedChunks(meta){const files=await readdir(uploadDir(meta.uploadId)).catch(()=>[]);return files.filter(x=>/^chunk-\d{6}\.part$/.test(x)).map(x=>Number(x.slice(6,12))).filter(i=>i>=0&&i<meta.totalChunks).sort((a,b)=>a-b)}
function publicUploadMeta(meta,received=[],queuePosition=null){return{uploadId:meta.uploadId,filename:meta.filename,size:meta.size,mimeType:meta.mimeType,chunkSize:meta.chunkSize,totalChunks:meta.totalChunks,received,status:meta.status,phase:meta.phase,progress:meta.status==='uploading'?uploadProgress(received,meta.totalChunks):Number(meta.progress||0),queuePosition,error:meta.error||null,createdAt:meta.createdAt,updatedAt:meta.updatedAt,segmented:Boolean(meta.segmented),segmentCount:meta.segmentCount||0,speakerContinuity:meta.speakerContinuity||null}}
async function queuedUploadMetas(){const ids=await readdir(LARGE_MEDIA_ROOT).catch(()=>[]);const metas=[];for(const id of ids){if(!/^[a-f0-9]{32}$/.test(id)||largeMediaTasks.has(id))continue;const meta=await readUploadMeta(id);if(meta?.status==='queued')metas.push(meta)}return metas.sort((a,b)=>Date.parse(a.queuedAt||a.updatedAt||a.createdAt||0)-Date.parse(b.queuedAt||b.updatedAt||b.createdAt||0))}
async function queuePositionFor(id){const queued=await queuedUploadMetas();const index=queued.findIndex(meta=>meta.uploadId===id);return index>=0?index+1:null}
let queuePumpRunning=false
async function pumpLargeMediaQueue(){if(queuePumpRunning||shuttingDown||!OPENAI_API_KEY||!ffmpegAvailable)return;queuePumpRunning=true;try{while(largeMediaTasks.size<MAX_LARGE_MEDIA_TASKS){const queued=await queuedUploadMetas();const meta=queued[0];if(!meta)break;const received=await actualReceivedChunks(meta);if(received.length!==meta.totalChunks){meta.status='failed';meta.phase='failed';meta.error=`Queued upload is incomplete (${received.length}/${meta.totalChunks} chunks).`;meta.updatedAt=new Date().toISOString();await writeUploadMeta(meta);continue}largeMediaTasks.set(meta.uploadId,Promise.resolve());const task=processLargeMedia(meta).catch(error=>{console.warn(`Large-media job ${meta.uploadId} failed:`,error.message)}).finally(()=>{largeMediaTasks.delete(meta.uploadId);queueMicrotask(()=>pumpLargeMediaQueue())});largeMediaTasks.set(meta.uploadId,task)}}finally{queuePumpRunning=false}}
async function cancelRequested(meta){const latest=await readUploadMeta(meta.uploadId);return Boolean(latest?.cancelRequested)}
async function cleanupStaleUploads(){try{await mkdir(LARGE_MEDIA_ROOT,{recursive:true});const ids=await readdir(LARGE_MEDIA_ROOT);const cutoff=Date.now()-LARGE_MEDIA_TTL_HOURS*3600_000;for(const id of ids){if(!/^[a-f0-9]{32}$/.test(id)||largeMediaTasks.has(id))continue;const meta=await readUploadMeta(id);const stamp=Date.parse(meta?.updatedAt||meta?.createdAt||0);if(!meta||!Number.isFinite(stamp)||stamp<cutoff){await rm(uploadDir(id),{recursive:true,force:true});continue}if(meta.status==='processing'){const received=await actualReceivedChunks(meta);meta.updatedAt=new Date().toISOString();if(received.length===meta.totalChunks){meta.status='queued';meta.phase='recovered-queued';meta.queuedAt=meta.queuedAt||meta.updatedAt;meta.progress=0.46;meta.error='Gateway restarted during processing; uploaded chunks were preserved and the job was returned to the durable queue.'}else{meta.status='failed';meta.phase='failed';meta.error=`Gateway restarted with an incomplete upload (${received.length}/${meta.totalChunks} chunks).`}await writeUploadMeta(meta)}}}catch(error){console.warn('Large-media cleanup skipped:',error.message)}}
async function handleUploadInit(req,res){try{const body=await readBody(req,64_000);const filename=sanitizeUploadName(body.filename);const size=Number(body.size||0);const mimeType=String(body.mimeType||'application/octet-stream').slice(0,120);if(!TRANSCRIBE_EXTENSIONS.has(extension(filename)))return json(res,415,{error:'Unsupported transcription format'});if(!Number.isFinite(size)||size<=0)return json(res,400,{error:'Invalid upload size'});if(size>MAX_LARGE_MEDIA_BYTES)return json(res,413,{error:`File exceeds large-media gateway limit (${Math.round(MAX_LARGE_MEDIA_BYTES/1024/1024)} MB)`});const uploadId=uploadIdFromResumeKey(body.resumeKey);let meta=await readUploadMeta(uploadId);if(meta&&(meta.size!==size||meta.filename!==filename))return json(res,409,{error:'Resume key belongs to a different file'});if(!meta){const now=new Date().toISOString();meta={uploadId,filename,size,mimeType,chunkSize:UPLOAD_CHUNK_BYTES,totalChunks:totalChunks(size,UPLOAD_CHUNK_BYTES),status:'uploading',phase:'upload',progress:0,createdAt:now,updatedAt:now,error:null};await writeUploadMeta(meta)}const received=await actualReceivedChunks(meta);return json(res,200,publicUploadMeta(meta,received))}catch(error){return json(res,400,{error:error.message||'Unable to initialize upload'})}}
async function handleUploadChunk(req,res,id,indexRaw){try{const meta=await readUploadMeta(id);if(!meta)return json(res,404,{error:'Upload session not found'});if(!['uploading','ready','failed'].includes(meta.status))return json(res,409,{error:`Upload is ${meta.status}`});const index=Number(indexRaw);const expected=expectedChunkBytes(meta.size,meta.chunkSize,index);const declared=Number(req.headers['x-chunk-bytes']||expected);if(declared!==expected)return json(res,400,{error:`Chunk ${index} should contain ${expected} bytes`});const bytes=await readBinaryBody(req,Math.min(meta.chunkSize+1,16*1024*1024+1));if(bytes.length!==expected)return json(res,400,{error:`Chunk ${index} contains ${bytes.length} bytes; expected ${expected}`});await mkdir(uploadDir(id),{recursive:true});const temp=`${uploadChunkPath(id,index)}.tmp-${process.pid}`;await writeFile(temp,bytes);await rename(temp,uploadChunkPath(id,index));const received=await actualReceivedChunks(meta);meta.status=received.length===meta.totalChunks?'ready':'uploading';meta.phase=meta.status==='ready'?'uploaded':'upload';meta.progress=meta.status==='ready'?0.45:uploadProgress(received,meta.totalChunks)*0.45;meta.error=null;meta.updatedAt=new Date().toISOString();await writeUploadMeta(meta);return json(res,200,publicUploadMeta(meta,received))}catch(error){return json(res,400,{error:error.message||'Unable to store upload chunk'})}}
async function assembleUpload(meta){const received=await actualReceivedChunks(meta);if(received.length!==meta.totalChunks)throw new Error(`Upload incomplete (${received.length}/${meta.totalChunks} chunks)`);const assembled=join(uploadDir(meta.uploadId),`source-${meta.filename}`);await writeFile(assembled,new Uint8Array());for(let i=0;i<meta.totalChunks;i+=1)await appendFile(assembled,await readFile(uploadChunkPath(meta.uploadId,i)));return assembled}
function runCommand(command,args,timeout=300_000){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',d=>{err+=d.toString();if(err.length>8000)err=err.slice(-8000)});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`${command} timed out`))},timeout);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(err.trim()||`${command} exited with ${code}`))})})}
async function probeDuration(path){return new Promise((resolve,reject)=>{const child=spawn(FFPROBE_PATH,['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>{const value=Number.parseFloat(out);code===0&&Number.isFinite(value)?resolve(value):reject(new Error(err.trim()||'Unable to read media duration'))})})}
async function segmentMediaAudio(meta,assembled){if(!ffmpegAvailable)throw new Error('FFmpeg/ffprobe is required on the gateway for large-media segmentation');const dir=join(uploadDir(meta.uploadId),'segments');await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});const pattern=join(dir,'segment-%04d.mp3');await runCommand(FFMPEG_PATH,['-hide_banner','-loglevel','error','-i',assembled,'-map','0:a:0','-vn','-ac','1','-ar','16000','-b:a','64k','-f','segment','-segment_time',String(MEDIA_SEGMENT_SECONDS),'-reset_timestamps','1',pattern],Math.max(300_000,Math.min(3_600_000,meta.size/25_000)));const names=(await readdir(dir)).filter(x=>/^segment-\d{4}\.mp3$/.test(x)).sort();if(!names.length)throw new Error('No audio track could be extracted from this media file');return names.map(name=>join(dir,name))}
async function transcribeSegment(path,index,offsetSeconds){const bytes=await readFile(path);let model=OPENAI_TRANSCRIBE_MODEL;let{upstream,data}=await transcribeUpstream(bytes,`segment-${String(index).padStart(4,'0')}.mp3`,'audio/mpeg',model);if(!upstream.ok&&model.includes('diarize')){model='gpt-4o-transcribe';({upstream,data}=await transcribeUpstream(bytes,`segment-${String(index).padStart(4,'0')}.mp3`,'audio/mpeg',model))}if(!upstream.ok)throw Object.assign(new Error(data?.error?.message||`Transcription failed for segment ${index+1}`),{status:upstream.status});const normalized=normalizeTranscription(data);return{index,offsetSeconds,normalized,model,usage:data.usage||null}}
async function processLargeMedia(meta){const id=meta.uploadId;try{meta.status='processing';meta.phase='assembling';meta.progress=0.48;meta.error=null;meta.cancelRequested=false;meta.startedAt=new Date().toISOString();meta.updatedAt=meta.startedAt;await writeUploadMeta(meta);if(await cancelRequested(meta))throw Object.assign(new Error('Job cancelled'),{cancelled:true});const assembled=await assembleUpload(meta);meta.phase='segmenting';meta.progress=0.52;await writeUploadMeta(meta);const segments=await segmentMediaAudio(meta,assembled);meta.segmented=segments.length>1;meta.segmentCount=segments.length;meta.speakerContinuity=segments.length>1?'per-segment labels; identity may reset between segments':'continuous';await writeUploadMeta(meta);const parts=[];let offset=0;const usages=[];const models=new Set();for(let i=0;i<segments.length;i+=1){if(await cancelRequested(meta))throw Object.assign(new Error('Job cancelled'),{cancelled:true});meta.phase=`transcribing ${i+1}/${segments.length}`;meta.progress=0.55+0.4*(i/segments.length);meta.updatedAt=new Date().toISOString();await writeUploadMeta(meta);const duration=await probeDuration(segments[i]);const part=await transcribeSegment(segments[i],i,offset);part.duration=duration;parts.push(part);if(part.usage)usages.push(part.usage);models.add(part.model);offset+=duration}const merged=mergeTranscriptionParts(parts);const result={...merged,quality:assessExtractionQuality(merged.text,merged.sections),model:[...models].join(','),transcribedAt:new Date().toISOString(),diarized:merged.speakers.length>0,segmented:segments.length>1,segmentCount:segments.length,speakerContinuity:meta.speakerContinuity,rawUsage:usages};await writeFile(join(uploadDir(id),'result.json'),JSON.stringify(result));meta.status='done';meta.phase='done';meta.progress=1;meta.completedAt=new Date().toISOString();meta.updatedAt=meta.completedAt;await writeUploadMeta(meta);await rm(join(uploadDir(id),'segments'),{recursive:true,force:true});await rm(assembled,{force:true});for(let i=0;i<meta.totalChunks;i+=1)await rm(uploadChunkPath(id,i),{force:true});return result}catch(error){meta.status=error.cancelled?'cancelled':'failed';meta.phase=meta.status;meta.error=error.cancelled?'Cancelled by user':(error.message||'Large-media transcription failed');meta.updatedAt=new Date().toISOString();await writeUploadMeta(meta).catch(()=>{});throw error}}
async function handleUploadTranscribe(req,res,id){if(!OPENAI_API_KEY)return json(res,503,{error:'OPENAI_API_KEY is not configured'});try{let meta=await readUploadMeta(id);if(!meta)return json(res,404,{error:'Upload session not found'});if(meta.status==='done'){const result=JSON.parse(await readFile(join(uploadDir(id),'result.json'),'utf8'));return json(res,200,{status:'done',result})}const received=await actualReceivedChunks(meta);if(received.length!==meta.totalChunks)return json(res,409,{error:`Upload incomplete (${received.length}/${meta.totalChunks})`});if(!ffmpegAvailable)return json(res,503,{error:'FFmpeg/ffprobe is not available on this gateway'});if(!['queued','processing'].includes(meta.status)){meta.status='queued';meta.phase='queued';meta.progress=Math.max(Number(meta.progress||0),0.46);meta.queuedAt=new Date().toISOString();meta.error=null;meta.cancelRequested=false;meta.updatedAt=meta.queuedAt;await writeUploadMeta(meta)}await pumpLargeMediaQueue();meta=await readUploadMeta(id)||meta;return json(res,202,publicUploadMeta(meta,received,await queuePositionFor(id)))}catch(error){return json(res,500,{error:error.message||'Unable to queue large-media transcription'})}}
async function handleUploadStatus(req,res,id){try{const meta=await readUploadMeta(id);if(!meta)return json(res,404,{error:'Upload session not found'});const received=await actualReceivedChunks(meta);const body=publicUploadMeta(meta,received,meta.status==='queued'?await queuePositionFor(id):null);if(meta.status==='done')body.result=JSON.parse(await readFile(join(uploadDir(id),'result.json'),'utf8'));return json(res,200,body)}catch(error){return json(res,500,{error:error.message||'Unable to read upload status'})}}
async function handleUploadDelete(req,res,id){try{const meta=await readUploadMeta(id);if(!meta)return json(res,404,{error:'Upload session not found'});if(largeMediaTasks.has(id)||meta.status==='processing'){meta.cancelRequested=true;meta.updatedAt=new Date().toISOString();await writeUploadMeta(meta);return json(res,202,{ok:true,status:'cancelling'})}await rm(uploadDir(id),{recursive:true,force:true});return json(res,200,{ok:true,status:'deleted'})}catch(error){return json(res,500,{error:error.message||'Unable to cancel/delete upload session'})}}

async function fetchYoutube(rawUrl){
  const id=youtubeVideoId(rawUrl);if(!id)throw new Error('Invalid YouTube URL')
  const canonical=`https://www.youtube.com/watch?v=${id}`
  const headers={'User-Agent':'Mozilla/5.0 NoteAI/3.6','Accept-Language':'en-US,en;q=0.9'}
  const [oembedResponse,pageResponse]=await Promise.all([
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,{headers,signal:AbortSignal.timeout(12_000)}).catch(()=>null),
    fetch(canonical,{headers,signal:AbortSignal.timeout(15_000)})
  ])
  if(!pageResponse.ok)throw new Error(`YouTube returned ${pageResponse.status}`)
  const html=await pageResponse.text()
  const meta=oembedResponse?.ok?await oembedResponse.json().catch(()=>({})):{}
  const tracks=captionTracksFromHtml(html)
  const track=[...tracks].sort((a,b)=>Number(a.isAuto)-Number(b.isAuto))[0]||null
  let sections=[],captionLanguage=null,autoCaptions=false
  if(track){
    const captionUrl=new URL(track.baseUrl);const host=captionUrl.hostname.toLowerCase();if(!(host.endsWith('youtube.com')||host.endsWith('googlevideo.com')))throw new Error('Unexpected captions host')
    captionUrl.searchParams.set('fmt','json3')
    const response=await fetch(captionUrl,{headers,signal:AbortSignal.timeout(15_000)})
    if(response.ok){const payload=await response.json().catch(()=>({}));sections=captionEventsToSections(payload);captionLanguage=track.languageCode;autoCaptions=track.isAuto}
  }
  const transcript=sections.map(section=>`[${formatSeconds(section.locator?.startSeconds)}] ${section.text}`).join('\n')
  return{id,url:canonical,title:meta.title||`YouTube ${id}`,channel:meta.author_name||'',thumbnail:meta.thumbnail_url||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,captionLanguage,autoCaptions,tracks:tracks.map(({baseUrl,...rest})=>rest),sections,transcript,status:sections.length?'ready':'metadata-only',fetchedAt:new Date().toISOString()}
}
async function handleYoutube(req,res){try{const body=await readBody(req,64_000);return json(res,200,await fetchYoutube(String(body.url||'')))}catch(error){return json(res,400,{error:error.message||'YouTube ingestion failed'})}}


function syncAuthorized(req){if(!SYNC_TOKEN)return false;const raw=String(req.headers.authorization||'');const token=raw.startsWith('Bearer ')?raw.slice(7):'';const a=Buffer.from(token),b=Buffer.from(SYNC_TOKEN);return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)}
function syncPath(workspaceId){if(!validWorkspaceId(workspaceId))throw new Error('Invalid workspace id');return join(SYNC_ROOT,`${workspaceId}.json`)}
async function readSyncRecord(workspaceId){try{return JSON.parse(await readFile(syncPath(workspaceId),'utf8'))}catch(error){if(error?.code==='ENOENT')return null;throw error}}
async function writeSyncRecord(workspaceId,record){await mkdir(SYNC_ROOT,{recursive:true});const target=syncPath(workspaceId),temp=`${target}.tmp-${process.pid}`;await writeFile(temp,JSON.stringify(record));await rename(temp,target)}
async function handleSyncGet(req,res,workspaceId){if(!SYNC_TOKEN)return json(res,503,{error:'Sync is not configured on this gateway'});if(!syncAuthorized(req))return json(res,401,{error:'Invalid sync token'});try{const record=await readSyncRecord(workspaceId);if(!record)return json(res,404,{error:'Workspace has no remote snapshot yet',revision:0});return json(res,200,record)}catch(error){return json(res,400,{error:error.message||'Unable to read sync workspace'})}}
async function handleSyncPut(req,res,workspaceId){if(!SYNC_TOKEN)return json(res,503,{error:'Sync is not configured on this gateway'});if(!syncAuthorized(req))return json(res,401,{error:'Invalid sync token'});try{const body=await readBody(req,MAX_SYNC_BYTES);const snapshot=validateSyncSnapshot(body.snapshot);const current=await readSyncRecord(workspaceId);const currentRevision=Number(current?.revision||0),baseRevision=Number(body.baseRevision||0);if(baseRevision!==currentRevision)return json(res,409,{error:'revision_conflict',currentRevision,updatedAt:current?.updatedAt||null});const record={revision:currentRevision+1,updatedAt:new Date().toISOString(),snapshot};await writeSyncRecord(workspaceId,record);return json(res,200,{revision:record.revision,updatedAt:record.updatedAt})}catch(error){return json(res,400,{error:error.message||'Unable to write sync workspace'})}}


function safeSecretEqual(a,b){const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));return left.length===right.length&&left.length>0&&timingSafeEqual(left,right)}
function accountPath(accountId){if(!/^[a-f0-9]{32}$/.test(String(accountId||'')))throw new Error('Invalid account id');return join(AUTH_ROOT,'accounts',`${accountId}.json`)}
function sessionPath(sessionId){if(!/^[A-Za-z0-9_-]{8,40}$/.test(String(sessionId||'')))throw new Error('Invalid session id');return join(AUTH_ROOT,'sessions',`${sessionId}.json`)}
async function readJsonFile(path){try{return JSON.parse(await readFile(path,'utf8'))}catch(error){if(error?.code==='ENOENT')return null;throw error}}
async function atomicJson(path,value){await mkdir(dirname(path),{recursive:true});const temp=`${path}.tmp-${process.pid}-${Date.now()}`;await writeFile(temp,JSON.stringify(value));await rename(temp,path)}
async function readAccount(accountId){return readJsonFile(accountPath(accountId))}
async function writeAccount(account){return atomicJson(accountPath(account.id),account)}
async function readSession(sessionId){return readJsonFile(sessionPath(sessionId))}
async function writeSession(session){return atomicJson(sessionPath(session.id),session)}
function bearer(req){const raw=String(req.headers.authorization||'');return raw.startsWith('Bearer ')?raw.slice(7):''}
async function accountSession(req,{touch=true}={}){const parsed=parseSessionToken(bearer(req));if(!parsed)return null;const session=await readSession(parsed.sessionId);if(!session||session.revokedAt||!verifySessionSecret(parsed.secret,session.secretHash))return null;if(Date.parse(session.expiresAt||0)<=Date.now()){await rm(sessionPath(session.id),{force:true}).catch(()=>{});return null}const account=await readAccount(session.accountId);if(!account||account.disabledAt)return null;if(touch&&Date.now()-Date.parse(session.lastSeenAt||0)>300_000){session.lastSeenAt=new Date().toISOString();await writeSession(session).catch(()=>{})}return{account,session}}
async function activeSessionRecords(accountId){const files=await readdir(join(AUTH_ROOT,'sessions')).catch(()=>[]);const active=[];for(const name of files){if(!name.endsWith('.json'))continue;const path=join(AUTH_ROOT,'sessions',name);const session=await readJsonFile(path);if(!session||session.accountId!==accountId||session.revokedAt)continue;if(Date.parse(session.expiresAt||0)<=Date.now()){await rm(path,{force:true}).catch(()=>{});continue}active.push(session)}return active}
async function pruneAccountSessions(accountId){const sessions=(await activeSessionRecords(accountId)).sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));while(sessions.length>=ACCOUNT_MAX_SESSIONS){const oldest=sessions.shift();if(oldest)await rm(sessionPath(oldest.id),{force:true}).catch(()=>{})}}
async function issueAccountSession(account,deviceName='NoteAI device'){await pruneAccountSessions(account.id);const credential=createSessionCredential();const now=new Date().toISOString();const session={id:credential.sessionId,accountId:account.id,secretHash:credential.secretHash,deviceName:String(deviceName||'NoteAI device').slice(0,120),createdAt:now,lastSeenAt:now,expiresAt:sessionExpiry(ACCOUNT_SESSION_TTL_DAYS)};await writeSession(session);return{token:credential.token,session}}
function loginFailureKey(req,email){return `${String(req.socket?.remoteAddress||'unknown').slice(0,80)}|${String(email||'').slice(0,180)}`}
function loginRetryAfter(req,email){const key=loginFailureKey(req,email),entry=loginFailures.get(key);if(!entry)return 0;const elapsed=Date.now()-entry.startedAt;if(elapsed>=LOGIN_WINDOW_MS){loginFailures.delete(key);return 0}return entry.count>=LOGIN_MAX_FAILURES?Math.max(1,Math.ceil((LOGIN_WINDOW_MS-elapsed)/1000)):0}
function recordLoginFailure(req,email){const key=loginFailureKey(req,email),now=Date.now(),entry=loginFailures.get(key);if(!entry||now-entry.startedAt>=LOGIN_WINDOW_MS)loginFailures.set(key,{count:1,startedAt:now});else entry.count+=1;if(loginFailures.size>5000){const oldest=loginFailures.keys().next().value;if(oldest)loginFailures.delete(oldest)}}
function clearLoginFailures(req,email){loginFailures.delete(loginFailureKey(req,email))}
async function handleAccountRegister(req,res){if(!REGISTRATION_TOKEN)return json(res,503,{error:'Account registration is disabled on this gateway'});if(!safeSecretEqual(req.headers['x-registration-token'],REGISTRATION_TOKEN))return json(res,403,{error:'Invalid registration token'});try{const body=await readBody(req,64_000);const email=normalizeEmail(body.email);if(!validEmail(email))return json(res,400,{error:'Invalid email address'});validatePassword(body.password);const accountId=accountIdForEmail(email);if(await readAccount(accountId))return json(res,409,{error:'Account already exists'});const now=new Date().toISOString();const account={format:'noteai-account-v1',id:accountId,email,displayName:String(body.displayName||'').trim().slice(0,120),password:await createPasswordRecord(body.password),createdAt:now,updatedAt:now};await writeAccount(account);const issued=await issueAccountSession(account,body.deviceName);return json(res,201,{account:publicAccount(account),token:issued.token,session:publicSession({...issued.session,current:true})})}catch(error){return json(res,400,{error:error.message||'Unable to create account'})}}
async function handleAccountLogin(req,res){try{const body=await readBody(req,64_000);const email=normalizeEmail(body.email);const retryAfter=loginRetryAfter(req,email);if(retryAfter){res.setHeader('Retry-After',String(retryAfter));return json(res,429,{error:'Too many sign-in attempts. Try again later.',retryAfter})}if(!validEmail(email)){recordLoginFailure(req,email);return json(res,401,{error:'Invalid email or password'})}const account=await readAccount(accountIdForEmail(email));if(!account||!(await verifyPassword(body.password,account.password))){recordLoginFailure(req,email);return json(res,401,{error:'Invalid email or password'})}clearLoginFailures(req,email);const issued=await issueAccountSession(account,body.deviceName);return json(res,200,{account:publicAccount(account),token:issued.token,session:publicSession({...issued.session,current:true})})}catch(error){return json(res,400,{error:error.message||'Unable to sign in'})}}
async function handleAccountMe(req,res){const auth=await accountSession(req);if(!auth)return json(res,401,{error:'Session expired or invalid'});return json(res,200,{account:publicAccount(auth.account),session:publicSession({...auth.session,current:true})})}
async function accountSessions(accountId,currentId){const active=await activeSessionRecords(accountId);return active.map(session=>publicSession({...session,current:session.id===currentId})).sort((a,b)=>Date.parse(b.lastSeenAt||b.createdAt)-Date.parse(a.lastSeenAt||a.createdAt))}
async function handleAccountSessions(req,res){const auth=await accountSession(req);if(!auth)return json(res,401,{error:'Session expired or invalid'});return json(res,200,{sessions:await accountSessions(auth.account.id,auth.session.id)})}
async function handleAccountLogout(req,res){const auth=await accountSession(req,{touch:false});if(!auth)return json(res,200,{ok:true});await rm(sessionPath(auth.session.id),{force:true});return json(res,200,{ok:true})}
async function handleAccountSessionDelete(req,res,sessionId){const auth=await accountSession(req,{touch:false});if(!auth)return json(res,401,{error:'Session expired or invalid'});const target=await readSession(sessionId);if(!target||target.accountId!==auth.account.id)return json(res,404,{error:'Session not found'});await rm(sessionPath(sessionId),{force:true});return json(res,200,{ok:true,current:sessionId===auth.session.id})}
function accountSyncPath(accountId,workspaceId){if(!validWorkspaceId(workspaceId))throw new Error('Invalid workspace id');if(!/^[a-f0-9]{32}$/.test(accountId))throw new Error('Invalid account id');return join(ACCOUNT_SYNC_ROOT,accountId,`${workspaceId}.json`)}
async function readAccountSyncRecord(accountId,workspaceId){return readJsonFile(accountSyncPath(accountId,workspaceId))}
async function writeAccountSyncRecord(accountId,workspaceId,record){return atomicJson(accountSyncPath(accountId,workspaceId),record)}
async function handleAccountSyncGet(req,res,workspaceId){const auth=await accountSession(req);if(!auth)return json(res,401,{error:'Session expired or invalid'});try{const record=await readAccountSyncRecord(auth.account.id,workspaceId);if(!record)return json(res,404,{error:'Workspace has no remote snapshot yet',revision:0});return json(res,200,record)}catch(error){return json(res,400,{error:error.message||'Unable to read account workspace'})}}
async function handleAccountSyncPut(req,res,workspaceId){const auth=await accountSession(req);if(!auth)return json(res,401,{error:'Session expired or invalid'});try{const body=await readBody(req,MAX_SYNC_BYTES);const snapshot=validateSyncSnapshot(body.snapshot);const current=await readAccountSyncRecord(auth.account.id,workspaceId);const currentRevision=Number(current?.revision||0),baseRevision=Number(body.baseRevision||0);if(baseRevision!==currentRevision)return json(res,409,{error:'revision_conflict',currentRevision,updatedAt:current?.updatedAt||null});const record={revision:currentRevision+1,updatedAt:new Date().toISOString(),snapshot};await writeAccountSyncRecord(auth.account.id,workspaceId,record);return json(res,200,{revision:record.revision,updatedAt:record.updatedAt})}catch(error){return json(res,400,{error:error.message||'Unable to write account workspace'})}}

function serveStatic(req,res){if(!existsSync(DIST)){res.writeHead(503,{...commonHeaders,'Content-Type':'text/plain; charset=utf-8'});return res.end('Build not found. Run npm run build first.')}const rawPath=new URL(req.url,'http://localhost').pathname;const candidate=normalize(join(DIST,rawPath==='/'?'index.html':rawPath));const safe=candidate.startsWith(normalize(DIST))?candidate:join(DIST,'index.html');const file=existsSync(safe)&&statSync(safe).isFile()?safe:join(DIST,'index.html');res.writeHead(200,{...commonHeaders,'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});createReadStream(file).pipe(res)}

await cleanupStaleUploads()
await pumpLargeMediaQueue()

function accountProtectedPath(path){return path==='/api/ai'||path==='/api/embed'||path==='/api/source-url'||path==='/api/vision'||path==='/api/transcribe'||path==='/api/youtube'||path.startsWith('/api/instagram')||path.startsWith('/api/uploads/')}

const server = http.createServer(async (req,res)=>{
  applyCors(req,res)
  if(req.method==='OPTIONS'){res.writeHead(204,commonHeaders);return res.end()}
  const url=new URL(req.url,'http://localhost')
  const path=url.pathname
  if(REQUIRE_ACCOUNT_AUTH&&accountProtectedPath(path)){const auth=await accountSession(req);if(!auth)return json(res,401,{error:'Account session required'})}
  if(req.method==='GET'&&path==='/api/health')return json(res,200,{ok:true,version:'3.6.0',aiConfigured:Boolean(OPENAI_API_KEY),model:OPENAI_MODEL,visionModel:OPENAI_VISION_MODEL,embeddingModel:OPENAI_EMBED_MODEL,transcriptionModel:OPENAI_TRANSCRIBE_MODEL,youtubeCaptions:true,instagramArchive:true,instagramProvider:'instaloader',corsOrigins:CORS_ORIGINS.length,resumableUploads:true,durableWorkerQueue:true,ffmpeg:ffmpegAvailable,uploadChunkBytes:UPLOAD_CHUNK_BYTES,largeMediaLimitBytes:MAX_LARGE_MEDIA_BYTES,segmentSeconds:MEDIA_SEGMENT_SECONDS,largeMediaTtlHours:LARGE_MEDIA_TTL_HOURS,maxLargeMediaTasks:MAX_LARGE_MEDIA_TASKS,activeLargeMediaTasks:largeMediaTasks.size,syncConfigured:Boolean(SYNC_TOKEN),accountAuth:true,registrationEnabled:Boolean(REGISTRATION_TOKEN),sessionTtlDays:ACCOUNT_SESSION_TTL_DAYS,maxAccountSessions:ACCOUNT_MAX_SESSIONS,loginMaxFailures:LOGIN_MAX_FAILURES,accountRequiredForGateway:REQUIRE_ACCOUNT_AUTH})
  if(req.method==='POST'&&path==='/api/ai')return handleAI(req,res)
  if(req.method==='POST'&&path==='/api/embed')return handleEmbed(req,res)
  if(req.method==='POST'&&path==='/api/source-url')return handleSourceUrl(req,res)
  if(req.method==='POST'&&path==='/api/vision')return handleVision(req,res)
  if(req.method==='POST'&&path==='/api/transcribe')return handleTranscribe(req,res)
  if(req.method==='POST'&&path==='/api/youtube')return handleYoutube(req,res)
  if(req.method==='POST'&&path==='/api/instagram')return handleInstagram(req,res)
  const instagramMediaMatch=path.match(/^\/api\/instagram\/([A-Za-z0-9_-]{4,64})\/media\/(\d{1,2})$/)
  if(instagramMediaMatch&&req.method==='GET')return handleInstagramMedia(req,res,instagramMediaMatch[1],Number(instagramMediaMatch[2]))
  const instagramMetaMatch=path.match(/^\/api\/instagram\/([A-Za-z0-9_-]{4,64})$/)
  if(instagramMetaMatch&&req.method==='GET')return handleInstagramMetadata(req,res,instagramMetaMatch[1])
  if(req.method==='POST'&&path==='/api/uploads/init')return handleUploadInit(req,res)
  if(req.method==='POST'&&path==='/api/account/register')return handleAccountRegister(req,res)
  if(req.method==='POST'&&path==='/api/account/login')return handleAccountLogin(req,res)
  if(req.method==='GET'&&path==='/api/account/me')return handleAccountMe(req,res)
  if(req.method==='POST'&&path==='/api/account/logout')return handleAccountLogout(req,res)
  if(req.method==='GET'&&path==='/api/account/sessions')return handleAccountSessions(req,res)
  const accountSessionMatch=path.match(/^\/api\/account\/sessions\/([A-Za-z0-9_-]{8,40})$/)
  if(accountSessionMatch&&req.method==='DELETE')return handleAccountSessionDelete(req,res,accountSessionMatch[1])
  const accountSyncMatch=path.match(/^\/api\/account\/sync\/([A-Za-z0-9_-]{1,64})$/)
  if(accountSyncMatch){if(req.method==='GET')return handleAccountSyncGet(req,res,accountSyncMatch[1]);if(req.method==='PUT')return handleAccountSyncPut(req,res,accountSyncMatch[1])}
  const syncMatch=path.match(/^\/api\/sync\/([A-Za-z0-9_-]{1,64})$/)
  if(syncMatch){if(req.method==='GET')return handleSyncGet(req,res,syncMatch[1]);if(req.method==='PUT')return handleSyncPut(req,res,syncMatch[1])}
  const uploadMatch=path.match(/^\/api\/uploads\/([a-f0-9]{32})(?:\/chunks\/(\d+)|\/transcribe)?$/)
  if(uploadMatch){const[,id,index]=uploadMatch;if(req.method==='PUT'&&index!==undefined)return handleUploadChunk(req,res,id,index);if(req.method==='POST'&&path.endsWith('/transcribe'))return handleUploadTranscribe(req,res,id);if(req.method==='GET'&&index===undefined&&!path.endsWith('/transcribe'))return handleUploadStatus(req,res,id);if(req.method==='DELETE'&&index===undefined&&!path.endsWith('/transcribe'))return handleUploadDelete(req,res,id)}
  if(req.method==='GET')return serveStatic(req,res)
  res.writeHead(405,commonHeaders);res.end('Method Not Allowed')
})
server.listen(PORT,()=>console.log(`NoteAI listening on http://0.0.0.0:${PORT}`))

function gracefulShutdown(signal){
  if(shuttingDown)return
  shuttingDown=true
  console.log(`${signal} received; stopping new requests. Active large-media tasks may finish; queued jobs remain durable for the next start.`)
  server.close(()=>{})
  const deadline=Date.now()+110_000
  const timer=setInterval(()=>{
    if(largeMediaTasks.size===0||Date.now()>=deadline){
      clearInterval(timer)
      process.exit(largeMediaTasks.size===0?0:1)
    }
  },250)
  timer.unref()
}
process.on('SIGTERM',()=>gracefulShutdown('SIGTERM'))
process.on('SIGINT',()=>gracefulShutdown('SIGINT'))
