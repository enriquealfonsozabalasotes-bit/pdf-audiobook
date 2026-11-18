// Google Cloud Text-to-Speech REST client (called directly from the device).
import { DEFAULT_VOICE } from './voices.js'

const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'

export class TtsError extends Error {
  constructor(kind, message, { status, billable = false } = {}) {
    super(message)
    this.name = 'TtsError'
    this.kind = kind // 'auth' | 'bad-request' | 'retryable' | 'network'
    this.status = status
    this.billable = billable // Google may have processed (and billed) the request
  }
}

function errorFor(status, detail) {
  if (status === 400) return new TtsError('bad-request', detail || 'Requisição recusada', { status })
  if (status === 401 || status === 403) return new TtsError('auth', detail || 'Chave recusada', { status })
  if (status === 429) return new TtsError('retryable', detail || 'Muitas requisições', { status })
  return new TtsError('retryable', detail || `Erro ${status}`, { status, billable: status >= 500 })
}

function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export async function synthesize({ text, voiceName, apiKey, fetchImpl = fetch }) {
  let res
  try {
    res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'pt-BR', name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    })
  } catch (err) {
    throw new TtsError('network', err?.message || 'Sem conexão')
  }
  if (!res.ok) {
    const detail = await res.json().then((j) => j?.error?.message).catch(() => undefined)
    throw errorFor(res.status, detail)
  }
  const { audioContent } = await res.json()
  return new Blob([base64ToBytes(audioContent)], { type: 'audio/mpeg' })
}

export const testKey = ({ apiKey, fetchImpl }) =>
  synthesize({ text: 'Teste.', voiceName: DEFAULT_VOICE, apiKey, fetchImpl })
