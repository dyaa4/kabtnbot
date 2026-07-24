# Groq voice pipeline (drop OpenAI) — Design

**Date:** 2026-07-24 · **Status:** approved (owner: all languages, OpenAI out, keep it cheap)

## Why

OpenAI account hit `insufficient_quota` → the whole assistant died (STT 429,
Realtime insufficient_quota, `/speak` "فشل تحويل النص إلى صوت"). The current
pipeline depends on OpenAI for STT + brain + VAD. Owner has ElevenLabs and
wants the cheapest setup with no OpenAI.

## Insight

The VOICE_V2 firehose already does everything client-side except answer
generation: utterance boundaries come from Discord (`AfterSilence 300ms`),
`conversation.ts` owns turn-taking, `getAIProvider()` (Groq Llama) already
runs for text features. Only the OpenAI Realtime `AnswerSession` needs
OpenAI. Replace it with: **Groq Whisper (STT) → Groq Llama (answer) →
ElevenLabs (voice)**. Same latency as the ElevenLabs dialect design already
accepted (synthesis after full text). Costs: Groq STT+LLM ≈ free; ElevenLabs
is the only real cost → default `eleven_turbo_v2_5`, short replies.

## Design

**Engine switch:** new env `VOICE_ENGINE` (`groq` default | `openai`).
`voiceEngineGroq` gates the new path; `openai` keeps the Realtime
AnswerSession (rollback). Groq mode runs inside the V2 firehose (V2 must be
on, which it is by default).

**STT (`transcribe.ts`):** groq → POST Groq
`/openai/v1/audio/transcriptions`, `GROQ_STT_MODEL`
(default `whisper-large-v3-turbo`), `GROQ_API_KEY`, keep `language` + decode
`prompt` (whisper accepts it). openai → unchanged.

**Answer (`firehose.ts` + new `groq-answer.ts`):** in the `{kind:'model'}`
branch, groq mode: `stopPlayback` (coarse barge-in), `onResponseStart`,
generate via `getAIProvider().generateResponse(query, {systemPrompt,
username, history})`, synthesize via ElevenLabs, play through
`playPcmStream`, mirror, `onResponseEnd`. A small per-session history buffer
(last ~6 msgs) enables follow-ups; cleared on handover / takeover.

**Voice selection (`elevenlabs-tts.ts`):** `resolveVoiceId(language,
dialect)` = Arabic → dialect id (`dialectVoiceId`) else
`ELEVENLABS_VOICE_DEFAULT`; other languages → `ELEVENLABS_VOICE_DEFAULT`.
`synthesizeVoice(text, language, dialect)` wraps the POST + upsample. Throws
if no id resolves.

**Dialect in wording (`prompts.ts`):** Arabic system prompt takes the
dialect → instructs Llama to answer in that dialect (المصرية/الشامية/
الخليجية/الفصحى), so text and voice match.

**Announcements (`sessions.ts` `playSpeech`, `/speak`, warn/kick):** groq
mode → synthesize via ElevenLabs (`synthesizeVoice`) instead of OpenAI
`synthesizeSpeech`. Fixes `/speak` and removes the last OpenAI dependency.

**Listening (`listen.ts`):** groq mode → do NOT `ensureAnswerSession` (no
OpenAI WS opened, no quota error) and skip the live audio tap; the firehose
drives conversation timing directly.

## Out of scope / notes

- Mid-sentence barge-in (OpenAI server-VAD) → replaced by utterance-boundary
  `stopPlayback`. Coarser, fine for turn-based.
- Non-Arabic guilds need `ELEVENLABS_VOICE_DEFAULT` set or groq mode can't
  speak (no OpenAI fallback anymore). Logged, fails to text/log-mirror only.
- Per-sentence streaming synthesis — still deferred.

## Testing

- transcribe: groq endpoint/model/auth vs openai by engine.
- elevenlabs-tts: resolveVoiceId (ar dialect / ar fallback / non-ar default),
  synthesizeVoice request shape + throw when unresolved.
- groq-answer: builds prompt with dialect, passes history, returns text.
- firehose: groq model branch generates + speaks + mirrors + updates history;
  history cleared on takeover.
- prompts: dialect line per dialect; non-Arabic unchanged.
