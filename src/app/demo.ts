import {
  resolveVariant,
  varDomains,
  variantFromIndices,
  type ResolvedScenario,
} from '../domain/scenario/expand';
import type { AppController } from '../state/app';
import type { Content } from '../state/library';

/**
 * `?demo=signature`: the profile and cheer the ten-second demo needs (SPEC
 * section 13). Everything is written to the throw-away `huc-demo` database.
 * The cheer's audio is a placeholder: demo mode is silent and shows its text.
 */
export async function seedDemo(controller: AppController): Promise<void> {
  await controller.setupProfile({ addressTerm: 'Paati', coachName: 'Arjun', playerName: 'Paati' });
  await controller.updateSettings({ sound: false, vibrate: false, captions: true });
  await controller.acceptCheer({
    v: 1,
    t: 'cheer',
    from: 'Arjun',
    mime: 'audio/webm',
    b64: 'AAAAAAAAAAAAAAAAAAAAAAAA',
    text: 'Nice one, Paati!',
  });
}

/** The S01 variant the demo uses, picked by its caller name. */
export const DEMO_TEMPLATE_ID = 'S01-bank-code';
export const DEMO_CALLER = 'First Meridian Bank Fraud Dept';

/** The S01 variant for the demo: First Meridian Bank, addressed as Paati. */
export function demoScenario(content: Content): ResolvedScenario | undefined {
  const template = content.byId.get(DEMO_TEMPLATE_ID);
  if (!template) return undefined;
  const domains = varDomains(template, content.library.addressTerms);
  const names = Object.keys(domains).sort();
  const indices = names.map((n) => {
    const list = domains[n] ?? [];
    const want = n === 'address' ? 'Paati' : 'First Meridian Bank';
    return Math.max(0, list.indexOf(want));
  });
  return resolveVariant(template, content.library.addressTerms, variantFromIndices(domains, indices));
}
