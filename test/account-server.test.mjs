import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 19185
async function waitFor(url, attempts=80){for(let i=0;i<attempts;i+=1){try{const r=await fetch(url);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,50))}throw new Error('server did not start')}

async function jsonFetch(url, options={}) { const response=await fetch(url,options); return {response,data:await response.json().catch(()=>({}))} }

test('self-hosted account sessions protect gateway routes and isolate revision-guarded sync', async t => {
  const root=await mkdtemp(join(tmpdir(),'noteai-account-server-'))
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,PORT:String(PORT),OPENAI_API_KEY:'',AUTH_ROOT:join(root,'auth'),ACCOUNT_SYNC_ROOT:join(root,'account-sync'),REGISTRATION_TOKEN:'register-secret-123456789',REQUIRE_ACCOUNT_AUTH:'true',LARGE_MEDIA_ROOT:join(root,'uploads')},stdio:['ignore','pipe','pipe']})
  t.after(async()=>{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,80));await rm(root,{recursive:true,force:true})})
  await waitFor(`http://127.0.0.1:${PORT}/api/health`)

  const protectedRoute=await fetch(`http://127.0.0.1:${PORT}/api/ai`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
  assert.equal(protectedRoute.status,401)

  const denied=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/register`,{method:'POST',headers:{'content-type':'application/json','x-registration-token':'wrong'},body:JSON.stringify({email:'user@example.com',password:'correct horse battery staple'})})
  assert.equal(denied.response.status,403)

  const registered=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/register`,{method:'POST',headers:{'content-type':'application/json','x-registration-token':'register-secret-123456789'},body:JSON.stringify({email:'user@example.com',password:'correct horse battery staple',displayName:'User',deviceName:'Android test'})})
  assert.equal(registered.response.status,201)
  assert.match(registered.data.token,/^nai1\./)
  const token1=registered.data.token

  const me=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/me`,{headers:{authorization:`Bearer ${token1}`}})
  assert.equal(me.response.status,200)
  assert.equal(me.data.account.email,'user@example.com')

  const accountFiles=await readdir(join(root,'auth','accounts'))
  const accountRecord=JSON.parse(await readFile(join(root,'auth','accounts',accountFiles[0]),'utf8'))
  assert.equal(accountRecord.password.algorithm,'scrypt')
  assert.equal(JSON.stringify(accountRecord).includes('correct horse battery staple'),false)

  const snapshot={format:'noteai-sync-v1',createdAt:new Date().toISOString(),workspace:{notes:[],tasks:[],chats:[]},settings:{theme:'dark'},sources:[],chunks:[]}
  const pushed=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/sync/default`,{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token1}`},body:JSON.stringify({baseRevision:0,snapshot})})
  assert.equal(pushed.response.status,200); assert.equal(pushed.data.revision,1)
  const conflict=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/sync/default`,{method:'PUT',headers:{'content-type':'application/json',authorization:`Bearer ${token1}`},body:JSON.stringify({baseRevision:0,snapshot})})
  assert.equal(conflict.response.status,409); assert.equal(conflict.data.error,'revision_conflict')

  const login=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'USER@example.com',password:'correct horse battery staple',deviceName:'Browser test'})})
  assert.equal(login.response.status,200)
  const token2=login.data.token
  const sessions=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/sessions`,{headers:{authorization:`Bearer ${token1}`}})
  assert.equal(sessions.response.status,200); assert.equal(sessions.data.sessions.length,2)
  const second=sessions.data.sessions.find(x=>x.id===login.data.session.id)
  assert.ok(second)
  const revoked=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/sessions/${second.id}`,{method:'DELETE',headers:{authorization:`Bearer ${token1}`}})
  assert.equal(revoked.response.status,200)
  const revokedMe=await fetch(`http://127.0.0.1:${PORT}/api/account/me`,{headers:{authorization:`Bearer ${token2}`}})
  assert.equal(revokedMe.status,401)

  const logout=await fetch(`http://127.0.0.1:${PORT}/api/account/logout`,{method:'POST',headers:{authorization:`Bearer ${token1}`}})
  assert.equal(logout.status,200)
  const expired=await fetch(`http://127.0.0.1:${PORT}/api/account/me`,{headers:{authorization:`Bearer ${token1}`}})
  assert.equal(expired.status,401)
})
