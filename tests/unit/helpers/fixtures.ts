import { join } from 'node:path';
import { loadScenarios } from '../../../scripts/lib/scenarios';
import type { ScenarioTemplate } from '../../../src/domain/scenario/schema';

export const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures');

const ok = loadScenarios(join(FIXTURES, 'scenarios', 'ok'));

export const MINI_TERMS = ok.library.addressTerms;
export const MINI_SCAM = ok.library.templates.find((t) => t.id === 'S90-mini-bank') as ScenarioTemplate;
export const MINI_LEGIT = ok.library.templates.find((t) => t.id === 'L90-mini-pharmacy') as ScenarioTemplate;
