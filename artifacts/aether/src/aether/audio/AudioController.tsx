import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';

/**
 * Procedural ambient audio for AETHER.
 *
 * Section index map (0-indexed in DOM order under <main>):
 *   0 Intro
 *   1 Singularity   → Voice 2
 *   2 Aurora        → Voice 3
 *   3 Crystalline   → Voice 4
 *   4 Caustics      → Voice 5
 *   5 Particle Storm→ Voice 6
 *   6 Wormhole      → Voice 7
 *   7 Outro         → Voice 8
 *
 * Voice 1 (deep drone) is always-on as the baseline. Each voice's
 * gain is driven by an asymmetric triangle: ramps 0→1 across the
 * previous section + the first half of its own section, then 1→0
 * across the second half of its own section + first half of next.
 */

const SESSION_KEY = 'aether.audio.unmuted';
const PEAK_DB = -12;

interface Voice {
  /** Linear gain 0..1, multiplied into the voice's send. */
  gain: Tone.Gain;
  /** Per-voice target peak (dB) when fully present. */
  peakDb: number;
  /** Section index whose presence drives this voice's gain. */
  sectionIndex: number;
  /** Optional callback per rAF tick — for filter sweeps etc. */
  onTick?: (presence: number, localProgress: number) => void;
  /** Optional callback when entering / leaving the section. */
  onEnter?: () => void;
  onLeave?: () => void;
}

interface Engine {
  masterVolume: Tone.Volume;
  voices: Voice[];
  bellTimer: number | null;
  pluckTimer: number | null;
  arpSequence: Tone.Sequence | null;
  started: boolean;
  bellSynth: Tone.MetalSynth;
  pluck: Tone.PluckSynth;
  arpSynth: Tone.PolySynth;
}

// Singleton stored on globalThis (not module-local) so that Vite HMR module
// replacement reuses the same Web Audio graph instead of constructing a fresh
// one on every hot update. Also covers React StrictMode double-invoke.
// Avoids "cannot connect to an AudioNode belonging to a different audio
// context" errors and prevents duplicated timers / synths.
const ENGINE_KEY = Symbol.for('aether.audio.engine');
type EngineHost = typeof globalThis & { [ENGINE_KEY]?: Engine };

function getOrBuildEngine(): Engine {
  const host = globalThis as EngineHost;
  if (host[ENGINE_KEY]) return host[ENGINE_KEY] as Engine;

  const limiter = new Tone.Limiter(-1).toDestination();
  const reverb = new Tone.Reverb({ decay: 4, wet: 0.4 }).connect(limiter);
  void reverb.generate();
  const masterVolume = new Tone.Volume(-Infinity).connect(reverb);

  const makeSend = (peakDb: number) => {
    const voiceVolume = new Tone.Volume(peakDb).connect(masterVolume);
    const gain = new Tone.Gain(0).connect(voiceVolume);
    return { in: gain, gain, voiceVolume };
  };

  const voices: Voice[] = [];

  // Voice 1 (deep drone) was removed at user request — only the per-section
  // voices V2..V8 play, so each phenomenon's character is unobstructed.

  // V2 — Singularity
  {
    const send = makeSend(-10);
    const dist = new Tone.Distortion(0.15).connect(send.in);
    const af = new Tone.AutoFilter({
      frequency: 0.1,
      depth: 0.7,
      baseFrequency: 240,
      octaves: 2
    })
      .start()
      .connect(dist);
    const fm1 = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 6,
      envelope: { attack: 3, decay: 0, sustain: 1, release: 3 }
    }).connect(af);
    const fm2 = new Tone.FMSynth({
      harmonicity: 1.5,
      modulationIndex: 6,
      envelope: { attack: 3, decay: 0, sustain: 1, release: 3 }
    }).connect(af);
    fm1.triggerAttack('G1');
    fm2.triggerAttack('C2');
    voices.push({ gain: send.gain, peakDb: -10, sectionIndex: 1 });
  }

  // V3 — Aurora
  {
    const send = makeSend(-14);
    const delay = new Tone.FeedbackDelay({
      delayTime: '8n.',
      feedback: 0.5,
      wet: 0.4
    }).connect(send.in);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 3, decay: 0, sustain: 1, release: 5 }
    }).connect(delay);
    pad.triggerAttack(['D5', 'F#5', 'A5', 'C#6']);
    voices.push({ gain: send.gain, peakDb: -14, sectionIndex: 2 });
  }

  // V4 — Crystalline (bells)
  const bellSynth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.4, release: 0.2 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5
  });
  {
    const send = makeSend(-20);
    bellSynth.connect(send.in);
    voices.push({ gain: send.gain, peakDb: -20, sectionIndex: 3 });
  }

  // V5 — Caustics
  {
    const send = makeSend(-12);
    const pp = new Tone.PingPongDelay({
      delayTime: '4n',
      feedback: 0.3,
      wet: 0.5
    }).connect(send.in);
    const tr = new Tone.Tremolo({ frequency: 0.4, depth: 0.6 })
      .start()
      .connect(pp);
    const filter = new Tone.Filter({
      frequency: 1500,
      type: 'lowpass',
      Q: 4
    }).connect(tr);
    const mono = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 2, decay: 0, sustain: 1, release: 4 }
    }).connect(filter);
    mono.triggerAttack('A2');
    const notes = ['A2', 'E3'];
    let idx = 0;
    // Note interval: lives for the page lifetime — singleton engine.
    window.setInterval(() => {
      idx = (idx + 1) % notes.length;
      mono.setNote(notes[idx]);
    }, 8000);
    voices.push({ gain: send.gain, peakDb: -12, sectionIndex: 4 });
  }

  // V6 — Particle Storm (pink noise gated + pluck)
  const pluck = new Tone.PluckSynth({
    attackNoise: 1,
    dampening: 4000,
    resonance: 0.85
  });
  {
    const send = makeSend(-14);
    const noiseAf = new Tone.AutoFilter({
      frequency: 0.5,
      depth: 0.85,
      baseFrequency: 600,
      octaves: 3
    })
      .start()
      .connect(send.in);
    const noise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.5, decay: 0, sustain: 1, release: 1 }
    }).connect(noiseAf);
    noise.triggerAttack();
    pluck.connect(send.in);
    voices.push({ gain: send.gain, peakDb: -14, sectionIndex: 5 });
  }

  // V7 — Wormhole (arpeggio with cutoff sweep)
  const arpSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 }
  });
  {
    const send = makeSend(-10);
    const v7Filter = new Tone.Filter({
      frequency: 500,
      type: 'lowpass',
      Q: 1
    }).connect(send.in);
    const wd = new Tone.FeedbackDelay({
      delayTime: '8n.',
      feedback: 0.6,
      wet: 0.6
    }).connect(v7Filter);
    arpSynth.connect(wd);
    voices.push({
      gain: send.gain,
      peakDb: -10,
      sectionIndex: 6,
      onTick: (_p, lp) => {
        v7Filter.frequency.rampTo(
          500 + (5000 - 500) * Math.max(0, Math.min(1, lp)),
          0.05
        );
      }
    });
  }

  // V8 — Outro (sustained D major)
  {
    const send = makeSend(-16);
    const outroSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 6, decay: 0, sustain: 1, release: 6 }
    }).connect(send.in);
    voices.push({
      gain: send.gain,
      peakDb: -16,
      sectionIndex: 7,
      onEnter: () => outroSynth.triggerAttack(['D4', 'F#4', 'A4', 'D5']),
      onLeave: () => outroSynth.releaseAll()
    });
  }

  const engine: Engine = {
    masterVolume,
    voices,
    bellTimer: null,
    pluckTimer: null,
    arpSequence: null,
    started: false,
    bellSynth,
    pluck,
    arpSynth
  };
  host[ENGINE_KEY] = engine;
  return engine;
}


export default function AudioController() {
  const engineRef = useRef<Engine | null>(null);

  // Persisted preference survives in-session scroll/HMR; reset on tab close.
  // Audio still cannot start without a user gesture, so the icon reflects the
  // last chosen state but the engine remains silent until first click.
  const [unmuted, setUnmuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  });
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef<number | null>(null);
  const tooltipShownRef = useRef(false);

  // ───── attach to the singleton engine + run scroll-driven mixing loop ─────
  useEffect(() => {
    const engine = getOrBuildEngine();
    engineRef.current = engine;

    // ───── scroll-driven mixing loop ─────
    let rafId = 0;
    const enteredFlags = new Map<number, boolean>();

    const tick = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>('main > section')
      );
      if (sections.length === 0) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const vh = window.innerHeight || 1;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      // Each section is 100vh in this app; index of the viewport top:
      const scrollIdx = scrollY / vh;
      // Max reachable scrollIdx — at the bottom of the page the viewport
      // shows the final section, so scrollIdx tops out at sectionCount - 1.
      // For the terminal section we collapse the right half of the triangle
      // so its peak shifts to the page-bottom anchor (otherwise the outro
      // voice never reaches full presence).
      const maxScrollIdx = Math.max(0, sections.length - 1);

      for (const v of eng.voices) {
        const n = v.sectionIndex;
        const peakAt = Math.min(n + 0.5, maxScrollIdx);
        const fadeInStart = n - 1;
        const fadeOutEnd = Math.min(n + 1.5, maxScrollIdx);
        let presence: number;
        if (scrollIdx <= fadeInStart || scrollIdx >= fadeOutEnd) {
          presence = scrollIdx >= peakAt && peakAt >= maxScrollIdx ? 1 : 0;
        } else if (scrollIdx <= peakAt) {
          const span = peakAt - fadeInStart;
          presence = span > 0 ? (scrollIdx - fadeInStart) / span : 1;
        } else {
          const span = fadeOutEnd - peakAt;
          presence = span > 0 ? (fadeOutEnd - scrollIdx) / span : 1;
        }
        presence = Math.max(0, Math.min(1, presence));

        v.gain.gain.rampTo(presence, 0.08);

        const wasIn = enteredFlags.get(n) ?? false;
        const isIn = presence > 0.05;
        if (isIn && !wasIn) {
          enteredFlags.set(n, true);
          v.onEnter?.();
        } else if (!isIn && wasIn) {
          enteredFlags.set(n, false);
          v.onLeave?.();
        }

        if (v.onTick) {
          const localProgress = scrollIdx - n;
          v.onTick(presence, localProgress);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      // The Tone graph + scheduled timers are owned by the globalThis-keyed
      // singleton and intentionally outlive the component so HMR / StrictMode
      // re-mounts don't tear down audio mid-playback.
      engineRef.current = null;
    };
  }, []);

  // ───── start audio on first unmute ─────
  const startEngine = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng || eng.started) return;
    await Tone.start();
    eng.started = true;

    Tone.getTransport().bpm.value = 110;
    Tone.getTransport().start();

    // V4 — Crystalline bells, random 1.5..3s.
    const bellNotes = ['D5', 'F5', 'G5', 'A5', 'C6'];
    const scheduleBell = () => {
      const wait = 1500 + Math.random() * 1500;
      eng.bellTimer = window.setTimeout(() => {
        // Only audible if the V4 gain is non-trivial — Tone still triggers
        // but the gain stage attenuates to silence.
        const v4 = eng.voices.find((v) => v.sectionIndex === 3);
        if (v4 && v4.gain.gain.value > 0.05 && eng.bellSynth) {
          const note = bellNotes[Math.floor(Math.random() * bellNotes.length)];
          eng.bellSynth.triggerAttackRelease(note, '8n');
        }
        scheduleBell();
      }, wait);
    };
    scheduleBell();

    // V6 — Pluck irregular 0.3..1.2s, D dorian, D3..D5.
    const dorianRoots = ['D', 'E', 'F', 'G', 'A', 'B', 'C'];
    const schedulePluck = () => {
      const wait = 300 + Math.random() * 900;
      eng.pluckTimer = window.setTimeout(() => {
        const v6 = eng.voices.find((v) => v.sectionIndex === 5);
        if (v6 && v6.gain.gain.value > 0.05 && eng.pluck) {
          const root = dorianRoots[Math.floor(Math.random() * dorianRoots.length)];
          const octave = 3 + Math.floor(Math.random() * 3); // 3..5
          eng.pluck.triggerAttack(`${root}${octave}`);
        }
        schedulePluck();
      }, wait);
    };
    schedulePluck();

    // V7 — arpeggio sequence on transport (1/8 note at 110 BPM).
    const arpNotes = ['D3', 'A3', 'D4', 'F4', 'A4', 'D5', 'F5', 'A5'];
    let arpIdx = 0;
    const seq = new Tone.Sequence(
      (time) => {
        const v7 = eng.voices.find((v) => v.sectionIndex === 6);
        if (v7 && v7.gain.gain.value > 0.03 && eng.arpSynth) {
          eng.arpSynth.triggerAttackRelease(
            arpNotes[arpIdx % arpNotes.length],
            '16n',
            time
          );
        }
        arpIdx++;
      },
      [0],
      '8n'
    );
    seq.start(0);
    eng.arpSequence = seq;
  }, []);

  // ───── mute / unmute ─────
  const applyMute = useCallback((on: boolean, rampSeconds: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.masterVolume.volume.rampTo(on ? PEAK_DB : -Infinity, rampSeconds);
  }, []);

  const toggle = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!eng.started) {
      await startEngine();
      // First click always unmutes — even if persisted state was muted, the
      // user just deliberately interacted with the audio control.
      applyMute(true, 1.5);
      setUnmuted(true);
      sessionStorage.setItem(SESSION_KEY, '1');
    } else {
      const next = !unmuted;
      applyMute(next, 0.4);
      setUnmuted(next);
      sessionStorage.setItem(SESSION_KEY, next ? '1' : '0');
    }
    // Dismiss tooltip on first interaction.
    if (showTooltip) {
      setShowTooltip(false);
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
    }
  }, [unmuted, showTooltip, startEngine, applyMute]);

  // ───── tooltip on first scroll past intro ─────
  useEffect(() => {
    const onScroll = () => {
      if (tooltipShownRef.current) return;
      const vh = window.innerHeight || 1;
      if (window.scrollY > vh * 0.5) {
        tooltipShownRef.current = true;
        setShowTooltip(true);
        tooltipTimerRef.current = window.setTimeout(() => {
          setShowTooltip(false);
        }, 4000);
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  return (
    <>
      {showTooltip && (
        <div
          className="fixed font-mono uppercase pointer-events-none"
          style={{
            right: 32,
            bottom: 32 + 40 + 12,
            fontSize: 10,
            letterSpacing: '0.3em',
            color: 'rgba(250,250,250,0.6)',
            zIndex: 10000
          }}
        >
          Sound recommended
        </div>
      )}
      <button
        type="button"
        aria-label={unmuted ? 'Mute audio' : 'Unmute audio'}
        onClick={() => {
          void toggle();
        }}
        className="fixed flex items-center justify-center rounded-full transition-colors"
        style={{
          right: 32,
          bottom: 32,
          width: 40,
          height: 40,
          background: 'transparent',
          border: '1px solid rgba(250,250,250,0.8)',
          color: 'rgba(250,250,250,0.9)',
          zIndex: 10000,
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'rgba(250,250,250,0.10)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <SpeakerIcon unmuted={unmuted} />
      </button>
    </>
  );
}

function SpeakerIcon({ unmuted }: { unmuted: boolean }) {
  // Compact line-art speaker; arcs appear when unmuted.
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5h4l5-4v13l-5-4H4z" />
      {unmuted ? (
        <>
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 6a8 8 0 0 1 0 12" />
        </>
      ) : (
        <>
          <line x1="17" y1="9" x2="22" y2="15" />
          <line x1="22" y1="9" x2="17" y2="15" />
        </>
      )}
    </svg>
  );
}
