// Everything the gateway needs to know, read from the environment once.
//
// No upstream has a default. A gateway that silently points somewhere is worse
// than one that refuses to start a feature: the app's rule is that AI output
// must never be substituted, and an unconfigured route must say so rather than
// invent a destination.

import { resolve } from 'node:path'

export function loadConfig(env = process.env) {
  const read = name => String(env[name] ?? '').trim()
  const readInt = (name, fallback) => {
    const value = Number.parseInt(read(name), 10)
    return Number.isFinite(value) && value > 0 ? value : fallback
  }

  return {
    port: readInt('NOTE2_PORT', readInt('PORT', 8787)),
    host: read('NOTE2_HOST') || '0.0.0.0',
    dataDir: resolve(read('NOTE2_DATA_DIR') || '.note2-data'),
    staticDir: resolve(read('NOTE2_STATIC_DIR') || 'dist'),

    // Text generation and embeddings. An OpenAI-compatible base URL, which
    // covers Ollama, LM Studio, OpenRouter, Groq, Mistral and OpenAI itself.
    ai: {
      baseUrl: read('NOTE2_AI_BASE_URL'),
      apiKey: read('NOTE2_AI_API_KEY'),
      model: read('NOTE2_AI_MODEL'),
      embedModel: read('NOTE2_EMBED_MODEL'),
      visionModel: read('NOTE2_VISION_MODEL')
    },

    // Speech to text. Separate because it is usually a different service
    // (whisper.cpp, faster-whisper, OpenAI /audio/transcriptions).
    transcribe: {
      baseUrl: read('NOTE2_TRANSCRIBE_BASE_URL'),
      apiKey: read('NOTE2_TRANSCRIBE_API_KEY') || read('NOTE2_AI_API_KEY'),
      model: read('NOTE2_TRANSCRIBE_MODEL')
    },

    // Instagram needs an external fetcher; there is no public API for this.
    instagram: {
      command: read('NOTE2_INSTAGRAM_COMMAND')
    },

    // Registration is closed unless a token is set, so a gateway exposed to
    // the internet does not accumulate strangers' accounts.
    accountRegistrationToken: read('NOTE2_REGISTRATION_TOKEN'),
    allowOpenRegistration: read('NOTE2_ALLOW_OPEN_REGISTRATION') === '1',

    limits: {
      urlBytes: readInt('NOTE2_MAX_URL_BYTES', 8 * 1024 * 1024),
      uploadBytes: readInt('NOTE2_MAX_UPLOAD_BYTES', 24 * 1024 * 1024),
      visionBytes: readInt('NOTE2_MAX_VISION_BYTES', 18 * 1024 * 1024),
      snapshotBytes: readInt('NOTE2_MAX_SNAPSHOT_BYTES', 64 * 1024 * 1024),
      requestTimeoutMs: readInt('NOTE2_REQUEST_TIMEOUT_MS', 20_000),
      upstreamTimeoutMs: readInt('NOTE2_UPSTREAM_TIMEOUT_MS', 120_000)
    }
  }
}

/** True when text generation can actually reach a model. */
export function aiConfigured(config) {
  return Boolean(config?.ai?.baseUrl && config?.ai?.model)
}
export function embedConfigured(config) {
  return Boolean(config?.ai?.baseUrl && config?.ai?.embedModel)
}
export function visionConfigured(config) {
  return Boolean(config?.ai?.baseUrl && config?.ai?.visionModel)
}
export function transcribeConfigured(config) {
  return Boolean(config?.transcribe?.baseUrl && config?.transcribe?.model)
}
