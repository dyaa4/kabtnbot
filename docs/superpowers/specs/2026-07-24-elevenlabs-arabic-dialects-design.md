# ElevenLabs Arabic dialect voices for the live voice assistant — Design

**Date:** 2026-07-24 · **Status:** approved (scope confirmed by owner)

## Context

The live voice assistant (`AnswerSession`, VOICE_V2) is one OpenAI Realtime
WS per guild: audio in, audio out, server VAD drives turn-taking (barge-in,
handoff). It replaced an older Groq Whisper → Groq Llama → Groq
Orpheus/ElevenLabs chain (`328e72d`, 2026-07-17) that had a working
Arabic-dialect voice picker (`5a7034b`) hidden in the dashboard for
non-Arabic guilds. The owner wants dialect voices back — specifically via
ElevenLabs, which has real per-dialect Arabic voices (Groq's Orpheus only
covered one Saudi-flavored voice family under different speaker names).

Owner confirmed scope explicitly:
- Live assistant only — not the `/speak`/warn-kick/scheduler announcements
  (`tts.ts`, stays on OpenAI TTS).
- Arabic guilds only (`language === 'ar'`) — every other language keeps the
  current OpenAI Realtime audio-native path untouched.
- OpenAI stays the "brain" (STT + LLM + server VAD) — only the voice output
  swaps to ElevenLabs. A real Groq-LLM swap was considered and rejected: it
  would require rebuilding server-VAD barge-in/turn-detection from scratch
  for Arabic guilds, which is the exact thing that's been tuned all week.

## Design

**Trigger condition:** a guild uses the ElevenLabs path only when ALL of:
`language === 'ar'`, `ELEVENLABS_API_KEY` is set, and the guild's chosen
dialect has a configured ElevenLabs voice id. Missing any of these silently
falls back to the current OpenAI audio-native session (`output_modalities:
['audio']`) — never a hard failure, matching the existing
`TTS_NOT_CONFIGURED` fallback convention in `tts.ts`.

**`AnswerSession` change (`apps/bot/src/modules/voice-ai/answer-session.ts`):**
when the trigger condition holds, `sendSessionUpdate()` sets
`output_modalities: ['text']` instead of `['audio']` (audio *input* config —
format, `turn_detection: server_vad` — is unchanged; server VAD keeps
driving barge-in/turn-taking exactly as today). `onMessage` gains handling
for the text-output events:
- `response.output_text.delta` — accumulate into a buffer (mirrors today's
  `response.output_audio_transcript.done` text capture, just assembled from
  deltas instead of a single event).
- `response.done` — once text-modality is active for this response, call
  `synthesizeDialectSpeech(fullText, dialect)`, write the result to
  `callbacks.openAudioSink()` (same sink `response.output_audio.delta`
  writes to today), then `onAnswerText(fullText)`. On synthesis failure: log
  and skip audio for this turn (mirror the "answer degrades to text-only"
  behavior elsewhere) — the turn still completes (`onResponseDone` fires),
  it just plays no audio.
- `response.created` / `input_audio_buffer.speech_started` (barge-in) /
  `response.cancelled` handling is untouched. A barge-in that lands while an
  ElevenLabs call is in flight must drop that in-flight synthesis result
  instead of writing stale audio to a sink that's already been torn down —
  guard the write with the same active-response/generation check the
  existing audio-delta path implicitly gets from the WS event order.

**New module `apps/bot/src/modules/voice-ai/elevenlabs-tts.ts`:**
`synthesizeDialectSpeech(text: string, dialect: Dialect): Promise<Buffer>` —
POSTs to ElevenLabs `/v1/text-to-speech/{voiceId}` with
`output_format=pcm_24000` (matches the existing PCM pipeline — no ffmpeg,
consistent with `328e72d` dropping `ffmpeg-static`) and
`model_id: config.ELEVENLABS_MODEL`, then reuses
`upsample24to48Stereo` (already used by `tts.ts`) to get 48k stereo PCM.
Throws `ELEVENLABS_NOT_CONFIGURED` / `ELEVENLABS_VOICE_NOT_CONFIGURED` when
the key or the dialect's voice id is missing, so the caller can decide
fallback vs. skip.

**Dialects & config:** four dialects — `gulf` (Khaliji), `egyptian`,
`levantine` (Sham), `msa` (default) — as a `Dialect` enum in
`packages/shared` alongside `TTS_VOICES`/`LANGUAGES`. (Saudi was dropped: it
is part of the Khaliji/Gulf family, so a separate option was redundant —
owner decision.) New guild-config field
`voice.dialect: z.enum(DIALECTS).default('msa').catch('msa')`, same
self-healing pattern as `tts_voice`. New env vars in `apps/bot/src/config.ts`:
`ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` (default `eleven_turbo_v2_5` —
lower latency than the multilingual model, relevant since this path already
pays a full-response round trip before synthesis starts), and one voice id
var per dialect: `ELEVENLABS_VOICE_GULF`, `ELEVENLABS_VOICE_EGYPTIAN`,
`ELEVENLABS_VOICE_LEVANTINE`, `ELEVENLABS_VOICE_MSA`.
Real voice ids are filled in on Railway by the owner after this ships — the
feature fails open (falls back to OpenAI audio) until they are.

**Dashboard (`SettingsTab.tsx`):** a dialect dropdown next to the existing
voice picker, visible only when `language === 'ar'` — same visibility rule
`5a7034b` used for the old dialect picker. PATCH schema in
`packages/shared`/`apps/web/src/server/routes/api.ts` accepts
`voice.dialect`. Localized labels in all six locale files, matching the
`0402a45` pattern for `tts_voice`.

**Latency trade-off (accepted for v1):** ElevenLabs synthesis starts only
after `response.done` (full text), not per-sentence streaming — slightly
slower than the native OpenAI audio stream, which starts speaking before the
full answer is generated. Per-sentence chunked streaming to ElevenLabs is a
future optimization, out of scope here (YAGNI — ship the simple version,
measure, revisit if latency actually bothers users).

## Out of scope

- Announcements (`/speak`, warn/kick, scheduler) — stay on OpenAI TTS.
- Non-Arabic languages — stay on the current OpenAI audio-native path.
- Groq as LLM/STT provider — rejected, see Context.
- Per-sentence streaming synthesis (latency optimization) — noted above,
  deferred.
- Sourcing/validating the actual ElevenLabs voice ids per dialect — owner
  fills these in on Railway after the code ships.

## Testing

- `elevenlabs-tts.test.ts`: request shape (voice id in URL, `pcm_24000`
  format, model id), missing-key/missing-voice-id throws, upsample applied
  to the response.
- `answer-session.test.ts`: session-update payload picks `output_modalities:
  ['text']` vs `['audio']` based on the trigger condition; text-delta
  accumulation across multiple events; `response.done` in text mode calls
  synthesis and writes to the sink; synthesis failure still fires
  `onResponseDone` without throwing; barge-in during an in-flight synthesis
  doesn't write to a torn-down sink.
- `guild-config.test.ts`: `voice.dialect` defaults to `msa`, coerces unknown
  values via `.catch`.
- `SettingsTab.test.tsx`: dialect dropdown hidden for non-`ar` languages,
  visible and wired to PATCH for `ar`.
