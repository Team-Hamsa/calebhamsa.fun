/**
 * sound.js — the sound machine every page shares.
 *
 * It makes notes with the browser's Web Audio API (no sound files!).
 * The Note Blocks page and the Build page's singing note blocks both
 * play through here, so they sound the same. It also makes the Build
 * page's buzzer hum (setHum).
 */
import { midiToFrequency } from './music-theory.js';

/**
 * How long each note rings, in seconds.
 * 🧪 Try this! 0.2 for short "plinks", 3 for long dreamy notes.
 */
const NOTE_SECONDS = 0.9;

/**
 * How long a note takes to fade in, in seconds.
 * If a sound starts at full loudness instantly, the speaker has to jump
 * all at once and you hear a "click". A tiny fade-in smooths it out.
 * 🧪 Try this! Set it to 0 and listen for the click. Try 0.5 for a slow "swell".
 */
const ATTACK_SECONDS = 0.01;

/** The kinds of taps that browsers accept as "yes, you may make sound" (see unlockAudio). */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

/**
 * The three voices. `wave` is the shape of the sound wave:
 *
 *   sine      ∿∿∿∿   smooth and round: a pure, soft tone
 *   square    ⊓⊔⊓⊔   jumps straight up and down: buzzy, like old video games
 *   triangle  /\/\   pointy: in between, a bit like a bell or a flute
 *
 * Square waves sound much louder, so that voice gets a smaller volume.
 * 🧪 Try this! Add  saw: { wave: 'sawtooth', volume: 0.15 },  and a button in music.html.
 */
export const VOICES = {
  soft: { wave: 'sine', volume: 0.3 },
  beep: { wave: 'square', volume: 0.1 },
  bell: { wave: 'triangle', volume: 0.3 },
};

/**
 * The buzzer's hum: a buzzy square wave, and how loud it gets at full power.
 * 🧪 Try this! 440 for a higher hum, 110 for a deep one.
 */
const HUM_HZ = 220;
const HUM_VOLUME = 0.06;

/** The browser's sound machine. Made on the first tap (see getAudio). */
let audioContext = null;

/** The buzzer hum that's playing now: { oscillator, gain }, or null. */
let hum = null;

/**
 * Get the browser's sound machine, making it the first time.
 *
 * Browsers don't let a page make sound until the person has tapped or
 * clicked something, so websites can't suddenly blare at you. That's why
 * we only make the AudioContext inside a tap, and "resume" it in case
 * the browser paused it.
 *
 * @returns {AudioContext} the sound machine
 */
export function getAudio() {
  if (!audioContext) audioContext = new AudioContext();
  // Not just 'suspended': iPads also say 'interrupted' after the screen
  // locks or a phone call, and we want sound back after either.
  if (audioContext.state !== 'running') audioContext.resume();
  return audioContext;
}

/**
 * Wake up the sound machine on Caleb's first real tap.
 *
 * Browsers only allow sound after certain kinds of taps: a finger lifting
 * off (pointerup or touchend), a click, or a key press. Blocks play on
 * pointerdown, the instant a finger lands, and some tablets don't count
 * that. So these events also wake the sound machine, and once it's
 * running they stop listening.
 * @returns {void}
 */
function unlockAudio() {
  if (getAudio().state === 'running') {
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlockAudio);
  }
}

/**
 * Has Caleb tapped yet, so sound is allowed and the sound machine is on?
 * Things that play by themselves (like a note block in a circuit) check
 * this first. If they played before the first tap, the iPad would save
 * them all up and blast them out together on that tap.
 * @returns {boolean} true once sound is running
 */
export function audioRunning() {
  return audioContext?.state === 'running';
}

/**
 * Start listening for the first tap that unlocks sound (see unlockAudio).
 * Each page calls this once when it starts.
 * @returns {void}
 */
export function listenForUnlock() {
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlockAudio);
}

/**
 * Make the sound of one or more notes at the same time.
 *
 * For each note we build a tiny chain, like plugging in guitar pedals:
 *
 *   oscillator (makes the wave) → gain (volume knob) → speakers
 *
 * The volume knob turns up quickly (ATTACK_SECONDS), then fades away
 * over NOTE_SECONDS, which sounds like a plucked or struck note.
 *
 * @param {number[]} midis - the notes to play, as MIDI numbers
 * @param {{wave: string, volume: number}} [voice] - one of the VOICES
 * @returns {void}
 */
export function playTones(midis, voice = VOICES.soft) {
  const audio = getAudio();
  // Three notes at full volume would be three times as loud, so chords
  // share the loudness between their notes.
  const volume = voice.volume / Math.sqrt(midis.length);
  const start = audio.currentTime;

  for (const midi of midis) {
    const oscillator = audio.createOscillator();
    oscillator.type = voice.wave;
    oscillator.frequency.value = midiToFrequency(midi);

    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + ATTACK_SECONDS);
    // "exponential" fades sound natural to our ears. It can't reach exactly
    // 0, so we fade to a tiny 0.0001 instead.
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_SECONDS);

    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + NOTE_SECONDS);
  }
}

/**
 * Set how loud the buzzers hum: 0 is silent, 1 is normal, 2 is loud.
 * All buzzers share one hum. Before Caleb's first tap there's no sound
 * machine yet, and this quietly does nothing (it never makes one).
 * @param {number} level - how hard the loudest buzzer is buzzing (0 to 2)
 * @returns {void}
 */
export function setHum(level) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  if (level <= 0) {
    if (!hum) return;
    hum.gain.gain.setTargetAtTime(0, now, 0.02); // fade out quickly...
    hum.oscillator.stop(now + 0.1);               // ...then stop
    hum = null;
    return;
  }
  if (!hum) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = HUM_HZ;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0, now);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    hum = { oscillator, gain };
  }
  // setTargetAtTime glides to the new loudness, so it doesn't click.
  hum.gain.gain.setTargetAtTime(HUM_VOLUME * Math.min(level, 2) / 2, now, 0.05);
}
