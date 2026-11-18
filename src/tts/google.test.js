// @vitest-environment node
import { synthesize, testKey, TtsError } from './google.js'
import { DEFAULT_VOICE, VOICES, quotaPoolOf, FREE_TIER_CHARS } from './voices.js'

const okFetch = (calls) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body), method: init.method })
  return new Response(JSON.stringify({ audioContent: btoa('ID3fake') }), { status: 200 })
}

test('posts text, voice and MP3 encoding; returns an audio/mpeg Blob', async () => {
  const calls = []
  const blob = await synthesize({ text: 'Olá, mundo.', voiceName: 'pt-BR-Neural2-A', apiKey: 'K', fetchImpl: okFetch(calls) })
  expect(calls[0].method).toBe('POST')
  expect(calls[0].url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize?key=K')
  expect(calls[0].body).toEqual({
    input: { text: 'Olá, mundo.' },
    voice: { languageCode: 'pt-BR', name: 'pt-BR-Neural2-A' },
    audioConfig: { audioEncoding: 'MP3' },
  })
  expect(blob.type).toBe('audio/mpeg')
  expect(new TextDecoder().decode(await new Response(blob).arrayBuffer())).toBe('ID3fake')
})

test.each([
  [400, 'bad-request', false],
  [401, 'auth', false],
  [403, 'auth', false],
  [429, 'retryable', false],
  [503, 'retryable', true],
])('HTTP %i maps to %s (billable %s)', async (status, kind, billable) => {
  const fetchImpl = async () => new Response('{}', { status })
  const err = await synthesize({ text: 'x', voiceName: 'v', apiKey: 'K', fetchImpl }).catch((e) => e)
  expect(err).toBeInstanceOf(TtsError)
  expect(err).toMatchObject({ kind, status, billable })
})

test('a rejected fetch is a network error that may have been billed', async () => {
  const fetchImpl = () => Promise.reject(new TypeError('offline'))
  const err = await synthesize({ text: 'x', voiceName: 'v', apiKey: 'K', fetchImpl }).catch((e) => e)
  expect(err).toMatchObject({ kind: 'network', billable: true })
})

test('testKey synthesizes a short phrase with the default voice', async () => {
  const calls = []
  await testKey({ apiKey: 'K', fetchImpl: okFetch(calls) })
  expect(calls[0].body.input.text).toBe('Teste.')
  expect(calls[0].body.voice.name).toBe(DEFAULT_VOICE)
})

test('voices are pt-BR, default is in the list, all share one conservative free pool', () => {
  expect(VOICES.every((v) => v.name.startsWith('pt-BR-'))).toBe(true)
  expect(VOICES.map((v) => v.name)).toContain(DEFAULT_VOICE)
  expect(new Set(VOICES.map((v) => quotaPoolOf(v.name)))).toEqual(new Set(['free']))
  expect(FREE_TIER_CHARS.free).toBe(1_000_000)
  expect(VOICES.some((v) => v.name.includes('Chirp'))).toBe(false) // free tier unverified
})
