import test from 'node:test'
import assert from 'node:assert/strict'
import { resumableUploadBase } from '../src/resumable-upload.js'

test('resumable endpoint follows same-origin and remote gateway', () => {
  assert.equal(resumableUploadBase('/api/transcribe'), '/api/uploads')
  assert.equal(resumableUploadBase('https://gateway.example/api/transcribe'), 'https://gateway.example/api/uploads')
})
