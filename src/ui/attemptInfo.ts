import { draftToTemplate } from '../domain/links/family';
import type { ResolvedScenario } from '../domain/scenario/expand';
import { resolveWithVars } from '../domain/scenario/expand';
import { outcomeCopy, type OutcomeCopy } from '../domain/result/copy';
import type { AppState } from '../state/app';
import type { Content } from '../state/library';
import { resolveVariantKey } from '../state/selectors';
import type { Attempt } from '../storage/schemas';

/** Re-open the scenario an attempt was played on: a library variant, or a family call from its stored draft. */
export function scenarioOf(
  attempt: Attempt,
  content: Content,
  familyCalls: AppState['familyCalls'],
): ResolvedScenario | undefined {
  if (attempt.family === true) {
    const id = attempt.scenarioId.replace(/^F-/, '');
    const record = familyCalls.find((c) => c.id === id);
    if (!record) return undefined;
    const template = draftToTemplate(record.call, record.id, record.from);
    return resolveWithVars(template, {}, `${template.id}#-`);
  }
  return resolveVariantKey(content, attempt.variantKey);
}

export function copyOf(attempt: Attempt, scenario: ResolvedScenario | undefined): OutcomeCopy {
  return outcomeCopy({
    kind: attempt.kind,
    outcome: attempt.outcome,
    ...(attempt.tActionMs !== undefined ? { tActionMs: attempt.tActionMs } : {}),
    ...(attempt.tAskMs !== undefined ? { tAskMs: attempt.tAskMs } : {}),
    ...(scenario?.askFor !== undefined ? { askFor: scenario.askFor } : {}),
    ...(scenario?.who !== undefined ? { who: scenario.who } : {}),
    ...(scenario?.missCost !== undefined ? { missCost: scenario.missCost } : {}),
    ...(scenario ? { trustedSource: scenario.callback.trustedSource } : {}),
  });
}
