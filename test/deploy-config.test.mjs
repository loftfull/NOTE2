import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('deployment profile preserves resumable/sync state and installs ffmpeg', async () => {
  const [dockerfile, render] = await Promise.all([
    readFile(new URL('../Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../render.yaml', import.meta.url), 'utf8')
  ])
  assert.match(dockerfile, /apt-get install[^\n]*ffmpeg/)
  assert.match(dockerfile, /python3 python3-pip/)
  assert.match(dockerfile, /instaloader==4\.15\.3/)
  assert.match(dockerfile, /instagram-core\.mjs/)
  assert.match(dockerfile, /instagram_fetch\.py/)
  assert.match(dockerfile, /npm run build/)
  assert.match(dockerfile, /COPY --from=build \/app\/package\.json \.\/package\.json/)
  assert.match(render, /healthCheckPath:\s*\/api\/health/)
  assert.match(render, /mountPath:\s*\/var\/data/)
  assert.match(render, /LARGE_MEDIA_ROOT[\s\S]*\/var\/data\/uploads/)
  assert.match(render, /SYNC_ROOT[\s\S]*\/var\/data\/sync/)
  assert.match(render, /AUTH_ROOT[\s\S]*\/var\/data\/auth/)
  assert.match(render, /ACCOUNT_SYNC_ROOT[\s\S]*\/var\/data\/account-sync/)
  assert.match(render, /INSTAGRAM_ROOT[\s\S]*\/var\/data\/instagram/)
  assert.match(render, /REQUIRE_ACCOUNT_AUTH[\s\S]*value:\s*"true"/)
  assert.match(render, /ACCOUNT_MAX_SESSIONS[\s\S]*value:\s*"12"/)
  assert.match(render, /LOGIN_MAX_FAILURES[\s\S]*value:\s*"8"/)
  assert.match(render, /LOGIN_WINDOW_MS[\s\S]*value:\s*"300000"/)
  assert.match(dockerfile, /account-auth-core\.mjs/)
  assert.match(render, /OPENAI_API_KEY\s*\n\s*sync:\s*false/)
  assert.doesNotMatch(render, /sk-[A-Za-z0-9_-]{10,}/)
})
