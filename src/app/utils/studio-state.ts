import fs from 'fs';
import type Anthropic from '@anthropic-ai/sdk';
import { getStep, resolveInCampaign, studioSteps, writeFileAtomic } from './studio-steps';

// One JSON file per step in .dm-second-brain/studio/, so the DM can stop and resume.
// Conversations are not canon: they never go in raw/.

export type StepStatus = 'todo' | 'in-progress' | 'approved';

export interface Proposal {
  id: string;
  section: string;
  newText: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Inconsistency {
  id: string;
  file: string;
  quote: string;
  problem: string;
  proposedFix: string;
  severity: 'error' | 'warning';
  status: 'open' | 'fixed' | 'kept';
}

export interface StepState {
  n: number;
  status: StepStatus;
  // The draft being edited; null until the DM or the AI changes it
  draft: string | null;
  // The conversation as sent to the API, content blocks preserved
  messages: Anthropic.Beta.Messages.BetaMessageParam[];
  proposals: Proposal[];
  inconsistencies: Inconsistency[];
  usage: { input: number; output: number; cacheRead: number };
}

const fileOf = (n: number) => resolveInCampaign(`.dm-second-brain/studio/step-${getStep(n).n}.json`);

const fresh = (n: number): StepState => ({
  n, status: 'todo', draft: null, messages: [], proposals: [], inconsistencies: [],
  usage: { input: 0, output: 0, cacheRead: 0 },
});

export function loadStep(n: number): StepState {
  const file = fileOf(n);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<StepState>;
    return { ...fresh(n), ...saved, n };
  } catch {
    return fresh(n);
  }
}

export function saveStep(state: StepState): void {
  writeFileAtomic(fileOf(state.n), JSON.stringify(state, null, 2) + '\n');
}

export function listSteps(): StepState[] {
  return studioSteps().map(s => loadStep(s.n));
}
