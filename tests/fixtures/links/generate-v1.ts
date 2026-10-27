/**
 * ONE-TIME generator for the v1 link fixtures (SPEC §9: "Fixtures of every v1
 * payload are kept ... and decoding them must keep working in every future
 * release"). The committed `v1-*.txt` files are the contract. Do NOT rerun this
 * to "refresh" them: if a change breaks decoding of a committed file, the
 * change is wrong, not the file. Run once with: pnpm tsx tests/fixtures/links/generate-v1.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToBase64Url, deflateRaw, encodeJson } from '../../../src/domain/links/codec';

const dir = import.meta.dirname;
const b64 = (file: string): string => readFileSync(join(dir, '..', 'cheers', file)).toString('base64');

const valid: Record<string, unknown> = {
  'v1-join-full': {
    v: 1,
    t: 'join',
    coach: 'Arjun',
    address: 'Paati',
    player: 'Meenakshi',
    cats: ['bank', 'government', 'family', 'tech', 'delivery', 'utility', 'prize', 'romance'],
    legitRate: 0.4,
  },
  'v1-join-minimal': { v: 1, t: 'join', coach: 'A', address: 'Nana', cats: ['bank'] },
  // Messy on purpose (ADR §6): 30-character name, right-to-left script, accents.
  'v1-join-messy-names': {
    v: 1,
    t: 'join',
    coach: 'سارة الأحمد',
    address: 'Abuela',
    player: 'Wolfeschlegelstein-Hausenfeld',
    cats: ['bank', 'tech'],
    legitRate: 0.3,
  },
  'v1-cheer-aac': { v: 1, t: 'cheer', from: 'Arjun', mime: 'audio/mp4', b64: b64('cheer-aac.m4a'), text: 'Nice one, Paati!' },
  'v1-cheer-opus': {
    v: 1,
    t: 'cheer',
    from: 'Sam',
    mime: 'audio/webm;codecs=opus',
    b64: b64('cheer-opus.webm'),
  },
  'v1-family-scam': {
    v: 1,
    t: 'family',
    from: 'Arjun',
    id: 'a1b2c3d4e5f6',
    call: {
      kind: 'scam',
      caller: 'Sam',
      opener: 'Nana? It is Sam. Please do not hang up.',
      warning: 'I had an accident and I need you to keep this between us.',
      ask: 'Can you buy gift cards and read me the numbers right now?',
      warningTactics: ['secrecy', 'fear'],
      askTactics: ['unusual-payment'],
      advice: 'Sam would never ask for gift cards. Hang up and ring him on the number you have.',
    },
  },
  'v1-family-legit': {
    v: 1,
    t: 'family',
    from: 'Priya',
    id: 'q9w8e7r6t5y4',
    call: {
      kind: 'legit',
      caller: 'Aunt Lakshmi',
      opener: 'Hello Paati, it is Lakshmi calling about Sunday.',
      warning: 'We are all coming for lunch and I will bring the sweets.',
      ask: 'That is all. See you soon, bye bye.',
      advice: 'A relative planning lunch is a social call with nothing asked of you.',
    },
  },
  'v1-result-sharp': {
    v: 1,
    t: 'result',
    name: 'Paati',
    date: '2026-10-20',
    title: 'a fake bank call',
    kind: 'scam',
    outcome: 'sharp',
    tAction: 6400,
    tAsk: 40200,
    streak: 4,
    rate30: 0.87,
  },
  'v1-result-caught': {
    v: 1,
    t: 'result',
    name: 'Nana',
    date: '2026-02-28',
    title: 'a fake power company call',
    kind: 'scam',
    outcome: 'caught',
    streak: 0,
  },
  'v1-result-stayed': {
    v: 1,
    t: 'result',
    name: 'Grandpa',
    date: '2026-12-31',
    title: 'a real pharmacy call',
    kind: 'legit',
    outcome: 'stayed',
    streak: 12,
    rate30: 1,
  },
};

for (const [name, payload] of Object.entries(valid)) {
  writeFileSync(join(dir, `${name}.txt`), (await encodeJson(payload)) + '\n');
}

// Hostile and damaged links (AC-F8-7): each must be rejected with a friendly error, never a crash.
const hostile: Record<string, string> = {
  'v1-bad-not-base64': '!!!not base64!!!',
  'v1-bad-truncated': (await encodeJson(valid['v1-join-full'])).slice(0, 40),
  'v1-bad-empty-object': await encodeJson({}),
  'v1-bad-wrong-type': await encodeJson(valid['v1-join-minimal']), // decoded as a cheer in the test
  'v1-bad-future-version': await encodeJson({ v: 2, t: 'join', coach: 'A', address: 'Nana', cats: ['bank'] }),
  'v1-bad-extra-field': await encodeJson({ v: 1, t: 'join', coach: 'A', address: 'Nana', cats: ['bank'], admin: true }),
  'v1-bad-control-chars': await encodeJson({ v: 1, t: 'join', coach: 'A\u0000B', address: 'Nana', cats: ['bank'] }),
  'v1-bad-unknown-category': await encodeJson({ v: 1, t: 'join', coach: 'A', address: 'Nana', cats: ['crypto'] }),
  'v1-bad-bad-mime': await encodeJson({ v: 1, t: 'cheer', from: 'A', mime: 'text/html', b64: 'AAAAAAAAAAAAAAAAAAAA' }),
  // A small link that inflates past the decompression ceiling (a "zip bomb").
  'v1-bad-inflate-bomb': bytesToBase64Url(await deflateRaw(new TextEncoder().encode(' '.repeat(300_000)))),
  // Longer than the join ceiling once encoded.
  'v1-bad-oversized-join': await encodeJson({
    v: 1,
    t: 'join',
    coach: 'A',
    address: 'Nana',
    cats: ['bank'],
    junk: Array.from({ length: 400 }, (_, i) => `${String(i)}-${Math.random().toString(36)}`),
  }),
};
for (const [name, text] of Object.entries(hostile)) {
  writeFileSync(join(dir, `${name}.txt`), text + '\n');
}
console.log(`wrote ${String(Object.keys(valid).length)} valid and ${String(Object.keys(hostile).length)} hostile fixtures`);
