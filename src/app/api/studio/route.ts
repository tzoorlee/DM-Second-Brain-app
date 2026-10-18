import { NextResponse } from 'next/server';
import { getStudioModel } from '../../utils/studio-model';
import { loadStep } from '../../utils/studio-state';
import { campaignHasSessions, STUDIO_STEPS } from '../../utils/studio-steps';
import { getCampaignRoot } from '../../utils/vault';
import { studioError } from './common';

// The Studio's overview: which steps are done and whether the AI can be used
export async function GET() {
  try {
    const root = getCampaignRoot();
    const model = getStudioModel();
    return NextResponse.json({
      aiAvailable: await model.available(),
      model: model.name,
      hasSessions: campaignHasSessions(),
      ingestCommand: `cd "${root}" && claude "design ingest of raw/worldbuilding"`,
      steps: STUDIO_STEPS.map(step => {
        const state = loadStep(step.n);
        return { n: step.n, id: step.id, title: step.title, kind: step.kind, status: state.status, usage: state.usage };
      }),
    });
  } catch (error) {
    return studioError(error);
  }
}
