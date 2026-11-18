// pt-BR voices offered in the app.
// Source: https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types (checked 2026-11-18).
//
// Free tier: Google's pricing page and third-party summaries disagree on the per-model free
// allowance (1M vs 4M chars/month) and on whether Standard/WaveNet/Neural2 share one pool.
// The owner's rule is "never pay", so every voice counts against ONE pool with the smallest
// published allowance: 1,000,000 characters per calendar month.
// https://cloud.google.com/text-to-speech/pricing (checked 2026-11-18)

export const VOICES = [
  { name: 'pt-BR-Neural2-A', label: 'Neural — feminina A', gender: 'F', tier: 'neural2' },
  { name: 'pt-BR-Neural2-C', label: 'Neural — feminina C', gender: 'F', tier: 'neural2' },
  { name: 'pt-BR-Neural2-B', label: 'Neural — masculina B', gender: 'M', tier: 'neural2' },
  { name: 'pt-BR-Wavenet-A', label: 'WaveNet — feminina A', gender: 'F', tier: 'wavenet' },
  { name: 'pt-BR-Wavenet-B', label: 'WaveNet — masculina B', gender: 'M', tier: 'wavenet' },
  { name: 'pt-BR-Chirp3-HD-Kore', label: 'Chirp HD — feminina (Kore)', gender: 'F', tier: 'chirp3-hd' },
  { name: 'pt-BR-Chirp3-HD-Charon', label: 'Chirp HD — masculina (Charon)', gender: 'M', tier: 'chirp3-hd' },
  { name: 'pt-BR-Standard-A', label: 'Padrão — feminina A', gender: 'F', tier: 'standard' },
  { name: 'pt-BR-Standard-B', label: 'Padrão — masculina B', gender: 'M', tier: 'standard' },
]

export const DEFAULT_VOICE = 'pt-BR-Neural2-A'

export const FREE_TIER_CHARS = { free: 1_000_000 }

export const tierOf = (voiceName) => VOICES.find((v) => v.name === voiceName)?.tier || 'neural2'

/** Usage pool a voice counts against (see note above: one shared pool). */
export const quotaPoolOf = () => 'free'
