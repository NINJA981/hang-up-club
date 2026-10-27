import { hash53Hex } from '../schedule/rng';
import { FamilyTemplateSchema, type ScenarioTemplate, type Tactic } from '../scenario/schema';
import { validateTemplate, type Issue } from '../scenario/library';
import type { FamilyCallDraft } from './payloads';

/** Family calls are voiced at runtime (Kitten or the phone's own voice), never pre-rendered. */
export const FAMILY_VOICE = 'family';
/** Fictional number shown for every family-written call. */
export const FAMILY_NUMBER = '(555) 555-0199';
export const FAMILY_CALLBACK_LABEL = 'Hang up and call them back myself';

const DEFAULT_WARNING_TACTICS: Tactic[] = ['secrecy', 'urgency'];
const DEFAULT_ASK_TACTICS: Tactic[] = ['unusual-payment'];

/** The "caught" coda every scam path must end with (SPEC §7.1). */
export const FAMILY_CODA = "Okay. I'll stay on the line while you do that.";

/** Family text is literal: braces would read as `{var}` placeholders, so they become parentheses. */
export function noBraces(text: string): string {
  return text.replace(/\{/g, '(').replace(/\}/g, ')');
}

export function familyTemplateId(linkId: string): string {
  return `F-${linkId}`;
}

/**
 * Turn the coach's guided form into a playable template. The structure is
 * fixed so every family scam has a flag before its single ask, and a family
 * real call has neither (AC-F3-2 also holds for family calls).
 */
export function draftToTemplate(input: FamilyCallDraft, linkId: string, fromRaw: string): ScenarioTemplate {
  const draft: FamilyCallDraft = {
    ...input,
    caller: noBraces(input.caller),
    opener: noBraces(input.opener),
    warning: noBraces(input.warning),
    ask: noBraces(input.ask),
    advice: noBraces(input.advice),
  };
  const from = noBraces(fromRaw);
  const scam = draft.kind === 'scam';
  const lines: ScenarioTemplate['lines'] = scam
    ? [
        { id: 'opener', say: draft.opener, speaker: draft.caller },
        {
          id: 'warning',
          say: draft.warning,
          speaker: draft.caller,
          flag: true,
          tactics: draft.warningTactics ?? DEFAULT_WARNING_TACTICS,
        },
        {
          id: 'ask',
          say: draft.ask,
          speaker: draft.caller,
          ask: true,
          tactics: draft.askTactics ?? DEFAULT_ASK_TACTICS,
        },
        { id: 'coda', say: FAMILY_CODA, speaker: draft.caller },
      ]
    : [
        { id: 'opener', say: draft.opener, speaker: draft.caller },
        { id: 'middle', say: draft.warning, speaker: draft.caller },
        { id: 'goodbye', say: draft.ask, speaker: draft.caller },
      ];
  const template = {
    id: familyTemplateId(linkId),
    kind: draft.kind,
    group: scam ? 'family' : 'real',
    category: 'family.custom',
    summary: scam ? 'a family-written practice call' : 'a family-written real call',
    caller: { display: draft.caller, number: FAMILY_NUMBER, voice: FAMILY_VOICE, bed: 'none' },
    vars: {},
    lines,
    callback: {
      label: FAMILY_CALLBACK_LABEL,
      trustedSource: 'the number you already have',
      number: FAMILY_NUMBER,
      voice: FAMILY_VOICE,
      ivr: [
        {
          id: 'family-ivr',
          say: scam
            ? `This is ${from}. I didn't call you. Thanks for checking with me first.`
            : `This is ${from}. Yes, that was really me. Thanks for checking.`,
        },
      ],
    },
    advice: draft.advice,
    sources: [],
  };
  return FamilyTemplateSchema.parse(template);
}

/** Semantic checks for a family template (one variant is enough: no variables). */
export function validateFamilyTemplate(t: ScenarioTemplate): Issue[] {
  return validateTemplate(t, { addressTerms: [], minVariants: 1 });
}

/** A random-looking id for a new family link, derived from content + a nonce. */
export function newFamilyLinkId(draft: FamilyCallDraft, nonce: string): string {
  return hash53Hex(JSON.stringify(draft) + nonce).slice(0, 12);
}
