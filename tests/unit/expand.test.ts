import { describe, expect, it } from 'vitest';
import {
  clipKey,
  clipsForTemplate,
  interpolate,
  normaliseClipText,
  parseVariantKey,
  placeholders,
  resolveVariant,
  usedVars,
  varDomains,
  variantCount,
  variantFromIndices,
  variantIndices,
  variantKey,
  varsForVariant,
} from '../../src/domain/scenario/expand';
import { realLibrary } from './helpers/content';
import { MINI_LEGIT, MINI_SCAM, MINI_TERMS } from './helpers/fixtures';

describe('placeholders and interpolation', () => {
  it('lists each placeholder once, in order', () => {
    expect(placeholders('Hi {address}, this is {org}. Bye {address}.')).toEqual(['address', 'org']);
    expect(placeholders('No variables here.')).toEqual([]);
  });
  it('fills known variables and leaves unknown ones visible', () => {
    expect(interpolate('Hello {address} from {org}', { address: 'Nana', org: 'Test Bank' })).toBe(
      'Hello Nana from Test Bank',
    );
    expect(interpolate('Hello {address} from {org}', { address: 'Nana' })).toBe('Hello Nana from {org}');
  });
  it('does not treat braces that are not identifiers as placeholders', () => {
    expect(placeholders('{ } {1} {a-b}')).toEqual([]);
  });
});

describe('variant domains', () => {
  it('uses only the variables the template mentions, sorted', () => {
    expect(usedVars(MINI_SCAM)).toEqual(['address', 'org']);
    expect(usedVars(MINI_LEGIT)).toEqual(['address', 'time']);
  });
  it('takes address values from the shared terms and others from vars', () => {
    const d = varDomains(MINI_SCAM, MINI_TERMS);
    expect(d['address']).toEqual(MINI_TERMS);
    expect(d['org']).toEqual(['Test Harbor Bank', 'Test Ridge Credit Union']);
    expect(variantCount(d)).toBe(MINI_TERMS.length * 2);
  });
  it('throws when a used variable is not declared', () => {
    const t = {
      ...MINI_LEGIT,
      lines: [
        { id: 'a', say: 'Hi {mystery}' },
        { id: 'b', say: 'Bye' },
      ],
    };
    expect(() => varDomains(t, MINI_TERMS)).toThrow(/mystery/);
  });
  it('a template with no variables has exactly one variant', () => {
    expect(variantCount({})).toBe(1);
  });
});

describe('variant numbering', () => {
  const domains = { a: ['x', 'y', 'z'], b: ['p', 'q'] };
  it('enumerates every combination exactly once (mixed radix)', () => {
    const seen = new Set<string>();
    for (let v = 0; v < variantCount(domains); v++) {
      const vars = varsForVariant(domains, v);
      seen.add(`${vars['a'] ?? ''}${vars['b'] ?? ''}`);
    }
    expect(seen.size).toBe(6);
  });
  it('round-trips between a variant number and its index tuple', () => {
    for (let v = 0; v < 6; v++) expect(variantFromIndices(domains, variantIndices(domains, v))).toBe(v);
  });
  it('rejects out-of-range variants and indices', () => {
    expect(() => variantIndices(domains, 6)).toThrow(RangeError);
    expect(() => variantIndices(domains, -1)).toThrow(RangeError);
    expect(() => variantIndices(domains, 1.5)).toThrow(RangeError);
    expect(() => variantFromIndices(domains, [3, 0])).toThrow(RangeError);
  });
  it('variant keys are stable and parse back', () => {
    const key = variantKey('S90-x', domains, 4);
    expect(key).toBe('S90-x#a=1,b=1');
    expect(parseVariantKey(key, domains)).toEqual({ templateId: 'S90-x', variant: 4 });
    expect(variantKey('L1', {}, 0)).toBe('L1#-');
    expect(parseVariantKey('L1#-', {})).toEqual({ templateId: 'L1', variant: 0 });
  });
  it('rejects damaged variant keys without throwing', () => {
    for (const bad of ['nohash', '#a=0,b=0', 'S#a=0', 'S#a=9,b=0', 'S#b=0,a=0', 'S#a=x,b=0', 'S#-']) {
      expect(parseVariantKey(bad, domains), bad).toBeNull();
    }
    expect(parseVariantKey('S#a=0', {})).toBeNull();
  });
});

describe('resolving a variant', () => {
  it('fills every placeholder in caller, lines and the call-back menu', () => {
    const r = resolveVariant(MINI_SCAM, MINI_TERMS, 0);
    expect(r.caller.display).toBe('Test Harbor Bank Fraud Dept');
    expect(r.lines[0]?.text).toBe('Hello, Nana.');
    expect(r.lines[1]?.text).toBe('This is the fraud team at Test Harbor Bank.');
    expect(r.callback.ivr[0]?.say).toBe('Thank you for calling Test Harbor Bank. We did not call you.');
    expect(JSON.stringify(r)).not.toMatch(/\{(address|org)\}/);
  });
  it('different variants differ and the same variant repeats', () => {
    const a = resolveVariant(MINI_SCAM, MINI_TERMS, 1);
    const b = resolveVariant(MINI_SCAM, MINI_TERMS, 2);
    expect(a.lines[0]?.text).not.toBe(b.lines[0]?.text);
    expect(resolveVariant(MINI_SCAM, MINI_TERMS, 1)).toEqual(a);
  });
  it('defaults the speaker and voice and keeps template metadata', () => {
    const r = resolveVariant(MINI_LEGIT, MINI_TERMS, 0);
    expect(r.lines.every((l) => l.speaker === 'Caller' && l.voice === 'zira-calm')).toBe(true);
    expect(r.who).toBe('the real pharmacy');
    expect(r.missCost).toContain('refill');
    expect(r.askFor).toBeUndefined();
    expect(resolveVariant(MINI_SCAM, MINI_TERMS, 0).askFor).toBe('the code');
  });
});

describe('clips', () => {
  it('normalises whitespace and unicode', () => {
    expect(normaliseClipText('  Hello \n  world  ')).toBe('Hello world');
    expect(normaliseClipText('é')).toBe('é');
  });
  it('keys depend on voice and text', () => {
    expect(clipKey('zira-calm', 'Hello')).toBe(clipKey('zira-calm', ' Hello '));
    expect(clipKey('zira-calm', 'Hello')).not.toBe(clipKey('david-firm', 'Hello'));
    expect(clipKey('zira-calm', 'Hello')).not.toBe(clipKey('zira-calm', 'Hello.'));
    expect(clipKey('zira-calm', 'Hello')).toMatch(/^zira-calm-[0-9a-f]{14}$/);
  });
  it('expands a line only over the variables it uses', () => {
    const clips = clipsForTemplate(MINI_SCAM, MINI_TERMS);
    // greetings (one per address term) + 2 intro + warning + ask + coda + who + 2 call-back lines
    expect(clips).toHaveLength(MINI_TERMS.length + 2 + 1 + 1 + 1 + 1 + 2);
    expect(clips.filter((c) => c.text.startsWith('Hello, '))).toHaveLength(MINI_TERMS.length);
    expect(new Set(clips.map((c) => c.key)).size).toBe(clips.length);
  });
  it('every clip a variant can play exists in the clip list', () => {
    const keys = new Set(clipsForTemplate(MINI_SCAM, MINI_TERMS).map((c) => c.key));
    for (let v = 0; v < variantCount(varDomains(MINI_SCAM, MINI_TERMS)); v++) {
      const r = resolveVariant(MINI_SCAM, MINI_TERMS, v);
      for (const l of r.lines)
        expect(keys.has(clipKey(l.voice, l.text)), `${r.variantKey} ${l.id}`).toBe(true);
      for (const l of r.callback.ivr) expect(keys.has(clipKey(r.callback.voice, l.say))).toBe(true);
    }
  });
  it('holds for the whole production library', () => {
    const lib = realLibrary();
    for (const t of lib.templates) {
      const keys = new Set(clipsForTemplate(t, lib.addressTerms).map((c) => c.key));
      const n = variantCount(varDomains(t, lib.addressTerms));
      for (let v = 0; v < n; v += Math.max(1, Math.floor(n / 9))) {
        const r = resolveVariant(t, lib.addressTerms, v);
        for (const l of r.lines)
          expect(keys.has(clipKey(l.voice, l.text)), `${r.variantKey} ${l.id}`).toBe(true);
      }
    }
  });
});
