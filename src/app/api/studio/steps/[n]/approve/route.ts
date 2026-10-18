import { NextResponse } from 'next/server';
import { approveStep } from '../../../../../utils/studio-ai';
import { modelForStep } from '../../../../../utils/studio-model';
import { loadStep } from '../../../../../utils/studio-state';
import { readStepContent } from '../../../../../utils/studio-steps';
import { getCampaignRoot } from '../../../../../utils/vault';
import { parseStep, readJson, studioError } from '../../../common';

// Writes the step's draft. Without credentials the coherence check is skipped.
export async function POST(request: Request, { params }: { params: Promise<{ n: string }> }) {
  try {
    getCampaignRoot();
    const n = parseStep((await params).n);
    const body = await readJson(request);
    const state = loadStep(n);
    const model = modelForStep(n);
    const result = await approveStep(n, state.draft ?? readStepContent(n), (await model.available()) ? model : null, body.skipCheck === true);
    return NextResponse.json(result);
  } catch (error) {
    return studioError(error);
  }
}
