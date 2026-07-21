// ── Conversation state machine ──────────────────────────────────────────────
// The brain of the multi-user voice assistant. PURE (no I/O, no timers, no
// Discord/OpenAI): every effect is expressed as a return value the manager
// executes, and time is passed in as `now`. That makes the concurrency-sensitive
// rules — active-user lock, wake-word queue, dynamic post-answer timeout —
// deterministically unit-testable and free of race conditions.
//
// Guarantees it enforces (spec §3–§8):
//  - Exactly ONE active user at a time; only their audio may drive a response.
//  - A wake word from anyone else is QUEUED, never an instant takeover.
//  - No timeout while the user speaks or the bot answers; a configurable idle
//    timeout starts only AFTER an answer and resets on the active user's speech.
//  - When it lapses (or the active user leaves) the conversation ends and the
//    next queued user is promoted automatically.

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Result of ending/handing off a conversation: who was released, who took over. */
export interface HandoffResult {
  ended: string | null;
  promoted: string | null;
}

export class Conversation {
  private _phase: VoicePhase = 'idle';
  private _activeUser: string | null = null;
  private readonly queue: string[] = [];
  // Epoch ms at which the idle timeout fires, or null when no timer is armed
  // (the user is speaking, the bot is answering, or the channel is idle).
  private deadline: number | null = null;

  /** @param timeoutMs dynamic idle timeout after an answer (spec §5, default 6s) */
  constructor(private timeoutMs: number) {}

  get phase(): VoicePhase {
    return this._phase;
  }
  get activeUser(): string | null {
    return this._activeUser;
  }
  get queued(): readonly string[] {
    return this.queue;
  }
  /** When the idle timer will fire (ms epoch), or null if none is armed. */
  get idleDeadline(): number | null {
    return this.deadline;
  }

  /** Update the configured idle timeout (guild-config change). Never negative. */
  setTimeout(ms: number): void {
    this.timeoutMs = Math.max(0, ms);
  }

  /** Whether this user currently holds the floor (active-user lock, spec §4/§6). */
  isActive(userId: string): boolean {
    return this._activeUser === userId;
  }

  /**
   * A user said the wake word (spec §3/§7).
   *  - No active user → they engage and become active.
   *  - Already the active user → treated as staying engaged (timer disarmed).
   *  - Someone else is active → queued (once), NOT an instant switch.
   */
  onWakeWord(userId: string): 'engaged' | 'already-active' | 'queued' {
    if (this._activeUser === null) {
      this._activeUser = userId;
      this._phase = 'listening';
      this.deadline = null;
      return 'engaged';
    }
    if (this._activeUser === userId) {
      this.deadline = null;
      return 'already-active';
    }
    if (!this.queue.includes(userId)) this.queue.push(userId);
    return 'queued';
  }

  /** The active user produced an utterance we're about to answer → Thinking. */
  onActiveUtterance(): void {
    if (this._activeUser === null) return;
    this._phase = 'thinking';
    this.deadline = null;
  }

  /** The model started producing the answer → Speaking. */
  onResponseStart(): void {
    if (this._activeUser === null) return;
    this._phase = 'speaking';
    this.deadline = null;
  }

  /** The answer finished → back to Listening and arm the idle timeout (spec §5). */
  onResponseEnd(now: number): void {
    if (this._activeUser === null) return;
    this._phase = 'listening';
    this.deadline = this.timeoutMs > 0 ? now + this.timeoutMs : now;
  }

  /** Any speech from the active user while the timer is armed resets it (spec §5). */
  onActiveSpeech(now: number): void {
    if (this.deadline !== null && this.timeoutMs > 0) this.deadline = now + this.timeoutMs;
  }

  /** Advance time; ends the conversation (and promotes the next) once the idle timeout lapses. */
  tick(now: number): HandoffResult {
    if (this.deadline !== null && now >= this.deadline) return this.end(now);
    return { ended: null, promoted: null };
  }

  /** End the current conversation and promote the next queued user, if any (spec §7). */
  end(now: number): HandoffResult {
    const ended = this._activeUser;
    this._activeUser = null;
    this.deadline = null;
    this._phase = 'idle';
    const next = this.queue.shift() ?? null;
    if (next !== null) {
      this._activeUser = next;
      this._phase = 'listening';
      // The promoted user gets the idle window to actually start talking.
      this.deadline = this.timeoutMs > 0 ? now + this.timeoutMs : now;
    }
    return { ended, promoted: next };
  }

  /** A user left the channel: drop them from the queue; hand off if they were active (spec §11). */
  onUserLeft(userId: string, now: number): HandoffResult {
    const qi = this.queue.indexOf(userId);
    if (qi !== -1) this.queue.splice(qi, 1);
    if (this._activeUser === userId) return this.end(now);
    return { ended: null, promoted: null };
  }
}
