// Generates assets/sounds/timer-end.wav: two short 880 Hz beeps, 44.1 kHz mono 16-bit.
// Run from apps/mobile: node scripts/gen-timer-sound.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const FREQ = 880;
const BEEP_S = 0.15;
const GAP_S = 0.1;
const FADE_S = 0.015;

const beepN = Math.round(BEEP_S * RATE);
const gapN = Math.round(GAP_S * RATE);
const fadeN = Math.round(FADE_S * RATE);
const total = beepN * 2 + gapN;
const samples = new Int16Array(total);

function beep(offset) {
  for (let i = 0; i < beepN; i++) {
    const env = Math.min(1, i / fadeN, (beepN - 1 - i) / fadeN);
    samples[offset + i] = Math.round(Math.sin((2 * Math.PI * FREQ * i) / RATE) * env * 0.6 * 32767);
  }
}
beep(0);
beep(beepN + gapN);

const data = Buffer.from(samples.buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds', 'timer-end.wav');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log('wrote', out, header.length + data.length, 'bytes');
