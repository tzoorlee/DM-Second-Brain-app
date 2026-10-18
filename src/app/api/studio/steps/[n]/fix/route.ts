import { NextResponse } from 'next/server';
import { loadStep, saveStep } from '../../../../../utils/studio-state';
import { readStepContent } from '../../../../../utils/studio-steps';
import { getCampaignRoot } from '../../../../../utils/vault';
import { BadRequest, parseStep, readJson, studioError } from '../../../common';

// The step that owns a campaign file, or null when the Studio can't edit it (the wiki)
function stepFor(file: string, quote: string, current: number): number | null {
  if (file === 'draft') return current;
  if (file === 'raw/house-rules.md') return 5;
  if (file === 'raw/worldbuilding/starting-point.md') return 8;
  if (file.startsWith('raw/worldbuilding/')) return 7;
  if (file === 'raw/world-bible.md') return [1, 2, 3, 4].find(n => quote && readStepContent(n).includes(quote)) ?? 1;
  return null;
}

// "Fix the other file": the inconsistency moves to the step that owns that file
export async function POST(request: Request, { params }: { params: Promise<{ n: string }> }) {
  try {
    getCampaignRoot();
    const n = parseStep((await params).n);
    const body = await readJson(request);
    const state = loadStep(n);
    const issue = state.inconsistencies.find(i => i.id === body.inconsistencyId);
    if (!issue) throw new BadRequest('Unknown inconsistency.');
    const targetStep = stepFor(issue.file, issue.quote, n);
    if (targetStep !== null && targetStep !== n) {
      const target = loadStep(targetStep);
      target.inconsistencies.push({ ...issue, status: 'open' });
      if (target.status === 'approved') target.status = 'in-progress';
      saveStep(target);
      issue.status = 'fixed';
      saveStep(state);
    }
    return NextResponse.json({ targetStep });
  } catch (error) {
    return studioError(error);
  }
}
