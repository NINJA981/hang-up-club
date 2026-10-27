import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_INFLATED_BYTES,
  base64UrlToBytes,
  bytesToBase64Url,
  decodeJson,
  deflateRaw,
  encodeJson,
  inflateRaw,
} from '../../src/domain/links/codec';
import {
  FAMILY_CODA,
  draftToTemplate,
  familyTemplateId,
  newFamilyLinkId,
  noBraces,
  validateFamilyTemplate,
} from '../../src/domain/links/family';
import {
  LinkError,
  decodePayload,
  encodePayload,
  isLinkType,
  linkUrl,
  makeLink,
  parseLinkFragment,
} from '../../src/domain/links/links';
import {
  CHEER_MIME_RE,
  MAX_CHEER_B64,
  MAX_ENCODED,
  MAX_JOIN_URL,
  normaliseMime,
  type CheerLinkV1,
  type FamilyCallDraft,
  type JoinLinkV1,
  type PayloadByType,
  type ResultCardV1,
} from '../../src/domain/links/payloads';
import { resolveWithVars } from '../../src/domain/scenario/expand';
import { allPaths } from '../../src/domain/scenario/timeline';
import { FIXTURES } from './helpers/fixtures';

const dir = join(FIXTURES, 'links');
const fixture = (name: string): string => readFileSync(join(dir, `${name}.txt`), 'utf8').trim();

describe('codec', () => {
  it('round-trips bytes through base64url without padding or unsafe characters', () => {
    for (const len of [0, 1, 2, 3, 4, 100, 1000, 70_000]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256);
      const text = bytesToBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlToBytes(text)).toEqual(bytes);
    }
  });
  it('rejects text that is not base64url', () => {
    for (const bad of ['a+b', 'a/b', 'a=b', 'a b', 'é', 'a'])
      expect(() => base64UrlToBytes(bad), bad).toThrow(SyntaxError);
  });
  it('round-trips JSON, including non-Latin text', async () => {
    const value = { v: 1, name: 'سارة', note: 'Grüße 👋', n: [1, 2, 3] };
    expect(await decodeJson(await encodeJson(value))).toEqual(value);
  });
  it('compresses repetitive text', async () => {
    const encoded = await encodeJson({ text: 'abc'.repeat(500) });
    expect(encoded.length).toBeLessThan(120);
  });
  it('refuses to inflate past the ceiling', async () => {
    const bomb = await deflateRaw(new TextEncoder().encode(' '.repeat(MAX_INFLATED_BYTES + 10)));
    expect(bomb.length).toBeLessThan(500);
    await expect(inflateRaw(bomb)).rejects.toThrow(RangeError);
    expect((await inflateRaw(bomb, MAX_INFLATED_BYTES + 100)).length).toBe(MAX_INFLATED_BYTES + 10);
  });
  it('rejects bytes that are not a deflate stream', async () => {
    await expect(decodeJson('AAAAAAAAAAAAAAAA')).rejects.toThrow();
  });
  it('rejects invalid UTF-8 inside the payload', async () => {
    const text = bytesToBase64Url(await deflateRaw(Uint8Array.from([0xff, 0xfe, 0xfd])));
    await expect(decodeJson(text)).rejects.toThrow();
  });
});

describe('fragments and URLs', () => {
  it('parses the four link routes', () => {
    expect(parseLinkFragment('#/join?d=abc')).toEqual({ type: 'join', encoded: 'abc' });
    expect(parseLinkFragment('#/cheer?d=abc')).toEqual({ type: 'cheer', encoded: 'abc' });
    expect(parseLinkFragment('#/family?d=abc')).toEqual({ type: 'family', encoded: 'abc' });
    expect(parseLinkFragment('#/r?d=abc')).toEqual({ type: 'result', encoded: 'abc' });
  });
  it('ignores anything else', () => {
    for (const h of [
      '',
      '#',
      '#/today',
      '#/join',
      '#/join?',
      '#/join?x=1',
      '#/join?d=',
      '#/result?d=abc',
      'join?d=abc',
      '#/joinx?d=abc',
    ]) {
      expect(parseLinkFragment(h), h).toBeNull();
    }
  });
  it('knows its link types', () => {
    expect(isLinkType('join')).toBe(true);
    expect(isLinkType('r')).toBe(false);
  });
  it('builds a URL that puts the payload in the fragment, never the query', () => {
    const url = linkUrl('https://example.org/app?x=1#/old', 'result', 'PAYLOAD');
    expect(url).toBe('https://example.org/app?x=1/#/r?d=PAYLOAD');
    expect(new URL(url).hash).toBe('#/r?d=PAYLOAD');
    expect(new URL(linkUrl('https://example.org', 'join', 'X')).search).toBe('');
    expect(parseLinkFragment(new URL(linkUrl('https://example.org/', 'family', 'abc_-')).hash)).toEqual({
      type: 'family',
      encoded: 'abc_-',
    });
  });
});

describe('encoding payloads', () => {
  const join: JoinLinkV1 = { v: 1, t: 'join', coach: 'Arjun', address: 'Paati', cats: ['bank', 'tech'] };

  it('encodes then decodes a valid payload', async () => {
    const encoded = await encodePayload('join', join);
    const decoded = await decodePayload('join', encoded);
    expect(decoded).toEqual({ ok: true, value: join });
  });
  it('rejects an invalid payload before encoding', async () => {
    await expect(encodePayload('join', { ...join, coach: '' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(encodePayload('join', { ...join, v: 2 } as unknown as JoinLinkV1)).rejects.toMatchObject({
      code: 'unsupported-version',
    });
    await expect(encodePayload('join', { ...join, cats: [] })).rejects.toBeInstanceOf(LinkError);
  });
  it('rejects a payload that encodes past its ceiling', async () => {
    const big: CheerLinkV1 = {
      v: 1,
      t: 'cheer',
      from: 'A',
      mime: 'audio/mp4',
      b64: Buffer.from(crypto.getRandomValues(new Uint8Array(MAX_CHEER_B64))).toString('base64'),
    };
    await expect(encodePayload('cheer', big)).rejects.toMatchObject({ code: 'invalid' }); // longer than MAX_CHEER_B64 chars
  });
  it('keeps a full join link QR-sized (AC-F8-1)', async () => {
    const link = await makeLink('https://example.org/hang-up-club/', 'join', {
      v: 1,
      t: 'join',
      coach: 'Wolfeschlegelstein-Hausenfeld',
      address: 'Wolfeschlegelstein-Hausenfeld',
      player: 'Wolfeschlegelstein-Hausenfeld',
      cats: ['bank', 'government', 'family', 'tech', 'delivery', 'utility', 'prize', 'romance'],
      legitRate: 0.4,
    });
    expect(link.length).toBeLessThanOrEqual(MAX_JOIN_URL);
  });
  it('trims names and strips nothing else', async () => {
    const d = await decodePayload('join', await encodeJson({ ...join, coach: '  Arjun  ' }));
    expect(d.ok && d.value.coach).toBe('Arjun');
  });
});

describe('decoding hostile and damaged links (AC-F8-7)', () => {
  const code = async <T extends keyof PayloadByType>(type: T, name: string): Promise<string> => {
    const r = await decodePayload(type, fixture(name));
    return r.ok ? 'ok' : r.error.code;
  };

  it('answers every hostile fixture with a friendly error and never throws', async () => {
    const expected: Record<string, string> = {
      'v1-bad-not-base64': 'malformed',
      'v1-bad-truncated': 'malformed',
      'v1-bad-empty-object': 'wrong-type',
      'v1-bad-future-version': 'unsupported-version',
      'v1-bad-extra-field': 'invalid',
      'v1-bad-control-chars': 'invalid',
      'v1-bad-unknown-category': 'invalid',
      'v1-bad-inflate-bomb': 'too-large',
      'v1-bad-oversized-join': 'too-large',
    };
    for (const [name, want] of Object.entries(expected)) {
      expect(await code('join', name), name).toBe(want);
    }
    expect(await code('cheer', 'v1-bad-bad-mime')).toBe('invalid');
    expect(await code('cheer', 'v1-bad-wrong-type')).toBe('wrong-type'); // a join payload opened as a cheer
    expect(readdirSync(dir).filter((f) => f.startsWith('v1-bad-')).length).toBe(
      Object.keys(expected).length + 2,
    );
  });
  it('rejects a payload of the wrong type for the route', async () => {
    expect(await code('cheer', 'v1-join-minimal')).toBe('wrong-type');
    expect(await code('result', 'v1-family-scam')).toBe('wrong-type');
  });
  it('rejects an over-long encoded string without decompressing it', async () => {
    const r = await decodePayload('result', 'A'.repeat(MAX_ENCODED.result + 1));
    expect(r).toMatchObject({ ok: false, error: { code: 'too-large' } });
  });
  it('rejects non-object JSON', async () => {
    for (const v of [null, 5, 'text', [1, 2]]) {
      expect(await decodePayload('join', await encodeJson(v))).toMatchObject({
        ok: false,
        error: { code: 'malformed' },
      });
    }
  });
  it('never throws for random input', async () => {
    for (let i = 0; i < 60; i++) {
      const bytes = crypto.getRandomValues(new Uint8Array(1 + (i % 40)));
      const r = await decodePayload('join', bytesToBase64Url(bytes));
      expect(r.ok).toBe(false);
    }
  });
  it('uses text only: HTML in a name is kept as a harmless string, not interpreted', async () => {
    const r = await decodePayload(
      'join',
      await encodeJson({
        v: 1,
        t: 'join',
        coach: '<img src=x onerror=alert(1)>',
        address: 'Nana',
        cats: ['bank'],
      }),
    );
    expect(r.ok && r.value.coach).toBe('<img src=x onerror=alert(1)>'); // rendered by React as text; see the lint ban on dangerouslySetInnerHTML
  });
});

describe('v1 fixtures keep decoding in every release (SPEC section 9)', () => {
  it('join links', async () => {
    const full = await decodePayload('join', fixture('v1-join-full'));
    expect(full).toMatchObject({
      ok: true,
      value: { coach: 'Arjun', address: 'Paati', player: 'Meenakshi', legitRate: 0.4 },
    });
    expect(full.ok && full.value.cats).toHaveLength(8);
    expect(await decodePayload('join', fixture('v1-join-minimal'))).toMatchObject({
      ok: true,
      value: { coach: 'A', address: 'Nana', cats: ['bank'] },
    });
    const messy = await decodePayload('join', fixture('v1-join-messy-names'));
    expect(messy).toMatchObject({
      ok: true,
      value: { coach: 'سارة الأحمد', player: 'Wolfeschlegelstein-Hausenfeld', legitRate: 0.3 },
    });
  });
  it('cheer links, with audio that is still there byte for byte', async () => {
    const aac = await decodePayload('cheer', fixture('v1-cheer-aac'));
    expect(aac).toMatchObject({
      ok: true,
      value: { from: 'Arjun', mime: 'audio/mp4', text: 'Nice one, Paati!' },
    });
    expect(aac.ok && Buffer.from(aac.value.b64, 'base64')).toEqual(
      readFileSync(join(FIXTURES, 'cheers', 'cheer-aac.m4a')),
    );
    const opus = await decodePayload('cheer', fixture('v1-cheer-opus'));
    expect(opus).toMatchObject({ ok: true, value: { from: 'Sam', mime: 'audio/webm;codecs=opus' } });
    expect(opus.ok && opus.value.text).toBeUndefined();
  });
  it('family links', async () => {
    expect(await decodePayload('family', fixture('v1-family-scam'))).toMatchObject({
      ok: true,
      value: {
        from: 'Arjun',
        id: 'a1b2c3d4e5f6',
        call: { kind: 'scam', caller: 'Sam', askTactics: ['unusual-payment'] },
      },
    });
    expect(await decodePayload('family', fixture('v1-family-legit'))).toMatchObject({
      ok: true,
      value: { from: 'Priya', call: { kind: 'legit', caller: 'Aunt Lakshmi' } },
    });
  });
  it('result cards', async () => {
    expect(await decodePayload('result', fixture('v1-result-sharp'))).toMatchObject({
      ok: true,
      value: { name: 'Paati', outcome: 'sharp', tAction: 6400, tAsk: 40200, streak: 4, rate30: 0.87 },
    });
    expect(await decodePayload('result', fixture('v1-result-caught'))).toMatchObject({
      ok: true,
      value: { outcome: 'caught', streak: 0 },
    });
    expect(await decodePayload('result', fixture('v1-result-stayed'))).toMatchObject({
      ok: true,
      value: { kind: 'legit', date: '2026-12-31' },
    });
  });
  it('every valid fixture fits its size ceiling, and the cheer link fits under 8 KB (AC-F8-2)', () => {
    const limits: [string, keyof typeof MAX_ENCODED][] = [
      ['v1-join-full', 'join'],
      ['v1-join-minimal', 'join'],
      ['v1-cheer-aac', 'cheer'],
      ['v1-cheer-opus', 'cheer'],
      ['v1-family-scam', 'family'],
      ['v1-result-sharp', 'result'],
    ];
    for (const [name, type] of limits)
      expect(fixture(name).length, name).toBeLessThanOrEqual(MAX_ENCODED[type]);
  });
  it('the committed fixtures are exactly the contract: nothing was regenerated', () => {
    // A guard against "refreshing" fixtures: the file set is fixed.
    const valid = readdirSync(dir)
      .filter((f) => /^v1-(join|cheer|family|result)-/.test(f))
      .sort();
    expect(valid).toEqual([
      'v1-cheer-aac.txt',
      'v1-cheer-opus.txt',
      'v1-family-legit.txt',
      'v1-family-scam.txt',
      'v1-join-full.txt',
      'v1-join-messy-names.txt',
      'v1-join-minimal.txt',
      'v1-result-caught.txt',
      'v1-result-sharp.txt',
      'v1-result-stayed.txt',
    ]);
  });
});

describe('payload rules', () => {
  const join = { v: 1, t: 'join', coach: 'A', address: 'Nana', cats: ['bank'] };
  const decode = async (type: keyof PayloadByType, value: unknown): Promise<boolean> =>
    (await decodePayload(type, await encodeJson(value))).ok;

  it('limits names to 30 characters of printable text', async () => {
    expect(await decode('join', { ...join, coach: 'x'.repeat(30) })).toBe(true);
    expect(await decode('join', { ...join, coach: 'x'.repeat(31) })).toBe(false);
    expect(await decode('join', { ...join, coach: 'A‮B' })).toBe(false); // bidi override is a format character
    expect(await decode('join', { ...join, coach: '\n' })).toBe(false);
  });
  it('limits the legitimate-call rate to 0.3-0.5', async () => {
    expect(await decode('join', { ...join, legitRate: 0.3 })).toBe(true);
    expect(await decode('join', { ...join, legitRate: 0.5 })).toBe(true);
    expect(await decode('join', { ...join, legitRate: 0.6 })).toBe(false);
    expect(await decode('join', { ...join, legitRate: 0.2 })).toBe(false);
  });
  it('allows only known audio containers', () => {
    for (const ok of [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/ogg;codecs=opus',
    ]) {
      expect(CHEER_MIME_RE.test(normaliseMime(ok)), ok).toBe(true);
    }
    for (const bad of [
      'text/html',
      'audio/wav',
      'audio/webm;codecs=vp9',
      'audio/mp4;evil=1',
      'video/webm',
      'audio/webm;codecs=opus;x=1',
    ]) {
      expect(CHEER_MIME_RE.test(normaliseMime(bad)), bad).toBe(false);
    }
    expect(normaliseMime('Audio/WebM; codecs=Opus')).toBe('audio/webm;codecs=opus');
  });
  it('requires cheer audio to be base64', async () => {
    const cheer = { v: 1, t: 'cheer', from: 'A', mime: 'audio/mp4', b64: 'AAAAAAAAAAAAAAAAAAAA' };
    expect(await decode('cheer', cheer)).toBe(true);
    expect(await decode('cheer', { ...cheer, b64: 'AAAA AAAA AAAA AAAA' })).toBe(false);
    expect(await decode('cheer', { ...cheer, b64: 'short' })).toBe(false);
    expect(await decode('cheer', { ...cheer, b64: '<script>' + 'A'.repeat(20) })).toBe(false);
  });
  it('validates result cards (dates, ranges, outcomes)', async () => {
    const card: ResultCardV1 = {
      v: 1,
      t: 'result',
      name: 'Paati',
      date: '2026-10-20',
      title: 'a fake bank call',
      kind: 'scam',
      outcome: 'sharp',
      streak: 3,
    };
    expect(await decode('result', card)).toBe(true);
    expect(await decode('result', { ...card, date: '2026-02-30' })).toBe(false);
    expect(await decode('result', { ...card, outcome: 'won' })).toBe(false);
    expect(await decode('result', { ...card, streak: -1 })).toBe(false);
    expect(await decode('result', { ...card, rate30: 1.2 })).toBe(false);
    expect(await decode('result', { ...card, tAction: 1.5 })).toBe(false);
  });
});

describe('family calls become playable templates', () => {
  const scam: FamilyCallDraft = {
    kind: 'scam',
    caller: 'Sam',
    opener: 'Nana, it is Sam.',
    warning: 'Please keep this between us.',
    ask: 'Buy gift cards and read me the numbers.',
    advice: 'Sam would never ask for gift cards.',
  };
  const legit: FamilyCallDraft = { ...scam, kind: 'legit', ask: 'That is all, bye.' };

  it('builds a scam with one flag before one ask and a caught coda (AC-F3-2 holds for family calls)', () => {
    const t = draftToTemplate(scam, 'abc12345', 'Arjun');
    expect(t.id).toBe(familyTemplateId('abc12345'));
    expect(t.lines.map((l) => l.id)).toEqual(['opener', 'warning', 'ask', 'coda']);
    expect(t.lines.filter((l) => l.ask === true)).toHaveLength(1);
    expect(t.lines[1]?.flag).toBe(true);
    expect(t.lines.at(-1)?.say).toBe(FAMILY_CODA);
    expect(validateFamilyTemplate(t)).toEqual([]);
    expect(allPaths(t.lines)).toEqual([['opener', 'warning', 'ask', 'coda']]);
  });
  it('builds a legitimate call with neither flag nor ask', () => {
    const t = draftToTemplate(legit, 'abc12345', 'Arjun');
    expect(t.lines.some((l) => l.ask === true || l.flag === true)).toBe(false);
    expect(t.group).toBe('real');
    expect(validateFamilyTemplate(t)).toEqual([]);
  });
  it('uses the coach tactics when given and sensible defaults otherwise', () => {
    const d = draftToTemplate(scam, 'abc12345', 'Arjun');
    expect(d.lines[1]?.tactics).toEqual(['secrecy', 'urgency']);
    expect(d.lines[2]?.tactics).toEqual(['unusual-payment']);
    const custom = draftToTemplate(
      { ...scam, warningTactics: ['fear'], askTactics: ['personal-info'] },
      'abc12345',
      'Arjun',
    );
    expect(custom.lines[1]?.tactics).toEqual(['fear']);
    expect(custom.lines[2]?.tactics).toEqual(['personal-info']);
  });
  it('treats braces as literal text so a family cannot inject placeholders', () => {
    expect(noBraces('Hi {address} {x}')).toBe('Hi (address) (x)');
    const t = draftToTemplate({ ...scam, opener: 'Hi {address}' }, 'abc12345', 'A{b}');
    const r = resolveWithVars(t, {}, 'x');
    expect(r.lines[0]?.text).toBe('Hi (address)');
    expect(JSON.stringify(t)).not.toMatch(/\{[a-z]+\}/);
  });
  it('speaks the call-back line in the family member voice, not the caller', () => {
    expect(draftToTemplate(scam, 'abc12345', 'Arjun').callback.ivr[0]?.say).toContain("I didn't call you");
    expect(draftToTemplate(legit, 'abc12345', 'Arjun').callback.ivr[0]?.say).toContain('that was really me');
  });
  it('makes stable ids per content and nonce', () => {
    expect(newFamilyLinkId(scam, 'n1')).toBe(newFamilyLinkId(scam, 'n1'));
    expect(newFamilyLinkId(scam, 'n1')).not.toBe(newFamilyLinkId(scam, 'n2'));
    expect(newFamilyLinkId(scam, 'n1')).toMatch(/^[0-9a-f]{12}$/);
  });
  it('makes a real fixture link playable', async () => {
    const r = await decodePayload('family', fixture('v1-family-scam'));
    if (!r.ok) throw new Error('fixture must decode');
    const t = draftToTemplate(r.value.call, r.value.id, r.value.from);
    expect(validateFamilyTemplate(t)).toEqual([]);
  });
});
