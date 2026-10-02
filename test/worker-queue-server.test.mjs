import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const APP_PORT=19186, MOCK_PORT=19187
const ffmpeg=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0
async function waitFor(url,p=r=>r.ok,attempts=120){for(let i=0;i<attempts;i+=1){try{const r=await fetch(url);if(await p(r))return r}catch{}await new Promise(r=>setTimeout(r,60))}throw new Error(`timeout ${url}`)}
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',d=>err+=d);child.on('close',c=>c===0?resolve():reject(new Error(err)));child.on('error',reject)})}

async function uploadJob(port,filePath,name,key){const bytes=await readFile(filePath);const init=await fetch(`http://127.0.0.1:${port}/api/uploads/init`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resumeKey:key,filename:name,size:bytes.length,mimeType:'audio/wav'})}).then(r=>r.json());await fetch(`http://127.0.0.1:${port}/api/uploads/${init.uploadId}/chunks/0`,{method:'PUT',headers:{'content-type':'application/octet-stream','x-chunk-bytes':String(bytes.length)},body:bytes});return init}

test('durable media queue accepts work beyond active capacity and drains FIFO', {skip:!ffmpeg}, async t=>{
  const root=await mkdtemp(join(tmpdir(),'noteai-worker-queue-'));const wav1=join(root,'a.wav'),wav2=join(root,'b.wav')
  await run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=700:duration=2','-ar','16000','-ac','1','-c:a','pcm_s16le',wav1])
  await run('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=800:duration=2','-ar','16000','-ac','1','-c:a','pcm_s16le',wav2])
  let calls=0
  const mock=http.createServer((req,res)=>{if(req.method==='POST'&&req.url==='/audio/transcriptions'){req.resume();req.on('end',async()=>{calls+=1;await new Promise(r=>setTimeout(r,350));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({task:'transcribe',duration:2,text:`job ${calls}`,segments:[{type:'transcript.text.segment',id:`s${calls}`,start:0,end:1,text:`job ${calls}`,speaker:'A'}]}))});return}res.writeHead(404);res.end()})
  await new Promise(r=>mock.listen(MOCK_PORT,'127.0.0.1',r))
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:String(APP_PORT),OPENAI_API_KEY:'test',OPENAI_BASE_URL:`http://127.0.0.1:${MOCK_PORT}`,LARGE_MEDIA_ROOT:join(root,'uploads'),MAX_LARGE_MEDIA_TASKS:'1'},stdio:['ignore','pipe','pipe']})
  t.after(async()=>{child.kill('SIGTERM');await new Promise(r=>mock.close(r));await rm(root,{recursive:true,force:true})})
  await waitFor(`http://127.0.0.1:${APP_PORT}/api/health`)
  const a=await uploadJob(APP_PORT,wav1,'a.wav','queue-a-123456789');const b=await uploadJob(APP_PORT,wav2,'b.wav','queue-b-123456789')
  const startA=await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/${a.uploadId}/transcribe`,{method:'POST'});assert.equal(startA.status,202)
  const startB=await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/${b.uploadId}/transcribe`,{method:'POST'});assert.equal(startB.status,202)
  const bEarly=await fetch(`http://127.0.0.1:${APP_PORT}/api/uploads/${b.uploadId}`).then(r=>r.json())
  assert.ok(['queued','processing','done'].includes(bEarly.status))
  if(bEarly.status==='queued')assert.equal(bEarly.queuePosition,1)
  for(const id of [a.uploadId,b.uploadId])await waitFor(`http://127.0.0.1:${APP_PORT}/api/uploads/${id}`,async r=>{const d=await r.clone().json();return d.status==='done'},160)
  assert.equal(calls,2)
})
