import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 19187
const ROOT = new URL('..', import.meta.url).pathname
async function waitFor(url, attempts=80){for(let i=0;i<attempts;i+=1){try{const r=await fetch(url);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,50))}throw new Error('server did not start')}
async function jsonFetch(url, options={}){const response=await fetch(url,options);return{response,data:await response.json().catch(()=>({}))}}
const post=(url,body,headers={})=>jsonFetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})

test('account gateway throttles repeated login failures and caps active device sessions', async t=>{
  const root=await mkdtemp(join(tmpdir(),'noteai-account-guards-'))
  const child=spawn(process.execPath,['server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(PORT),OPENAI_API_KEY:'',AUTH_ROOT:join(root,'auth'),ACCOUNT_SYNC_ROOT:join(root,'sync'),LARGE_MEDIA_ROOT:join(root,'uploads'),REGISTRATION_TOKEN:'registration-guard-secret',ACCOUNT_MAX_SESSIONS:'2',LOGIN_MAX_FAILURES:'3',LOGIN_WINDOW_MS:'60000'},stdio:['ignore','pipe','pipe']})
  t.after(async()=>{child.kill('SIGTERM');await new Promise(r=>setTimeout(r,60));await rm(root,{recursive:true,force:true})})
  await waitFor(`http://127.0.0.1:${PORT}/api/health`)

  const registerHeaders={'x-registration-token':'registration-guard-secret'}
  const created=await post(`http://127.0.0.1:${PORT}/api/account/register`,{email:'sessions@example.com',password:'correct horse battery staple',deviceName:'Device 1'},registerHeaders)
  assert.equal(created.response.status,201)
  const token1=created.data.token
  const login2=await post(`http://127.0.0.1:${PORT}/api/account/login`,{email:'sessions@example.com',password:'correct horse battery staple',deviceName:'Device 2'})
  const login3=await post(`http://127.0.0.1:${PORT}/api/account/login`,{email:'sessions@example.com',password:'correct horse battery staple',deviceName:'Device 3'})
  assert.equal(login2.response.status,200)
  assert.equal(login3.response.status,200)

  const pruned=await fetch(`http://127.0.0.1:${PORT}/api/account/me`,{headers:{authorization:`Bearer ${token1}`}})
  assert.equal(pruned.status,401)
  const sessions=await jsonFetch(`http://127.0.0.1:${PORT}/api/account/sessions`,{headers:{authorization:`Bearer ${login3.data.token}`}})
  assert.equal(sessions.response.status,200)
  assert.equal(sessions.data.sessions.length,2)

  const abuseAccount=await post(`http://127.0.0.1:${PORT}/api/account/register`,{email:'throttle@example.com',password:'a long and valid password 123',deviceName:'Guard test'},registerHeaders)
  assert.equal(abuseAccount.response.status,201)
  for(let i=0;i<3;i+=1){
    const bad=await post(`http://127.0.0.1:${PORT}/api/account/login`,{email:'throttle@example.com',password:'wrong password value',deviceName:'Attacker'})
    assert.equal(bad.response.status,401)
  }
  const throttled=await post(`http://127.0.0.1:${PORT}/api/account/login`,{email:'throttle@example.com',password:'wrong password value',deviceName:'Attacker'})
  assert.equal(throttled.response.status,429)
  assert.match(throttled.data.error,/Too many sign-in attempts/i)
  assert.ok(Number(throttled.response.headers.get('retry-after'))>=1)
})
