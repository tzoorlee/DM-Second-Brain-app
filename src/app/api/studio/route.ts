import { NextResponse } from 'next/server';
import { itemStatus, latestSession, listItems } from '../../utils/studio-items';
import { getStudioModel } from '../../utils/studio-model';
import { loadStep } from '../../utils/studio-state';
import fs from 'fs';
import path from 'path';
import { campaignHasSessions, STUDIO_STEPS, WORLD_BIBLE } from '../../utils/studio-steps';
import { getField } from '../../utils/worldbible';
import { getCampaignRoot } from '../../utils/vault';
import { studioError } from './common';

// The Studio's overview: which steps are done and whether the AI can be used
export async function GET() {
  try {
    const root = getCampaignRoot();
    const model = getStudioModel();
    const biblePath = path.join(root, WORLD_BIBLE);
    const bible = fs.existsSync(biblePath) ? fs.readFileSync(biblePath, 'utf-8') : '';
    return NextResponse.json({
      aiAvailable: await model.available(),
      model: model.name,
      hasSessions: campaignHasSessions(),
      published: /^(Published|Mixed)/i.test(getField(bible, 'Setting', 'World') ?? ''),
      rulesEdition: getField(bible, 'Campaign', 'Rules edition'),
      // Single quotes so $, ` and " in the path stay literal when pasted in a shell
      ingestCommand: `cd '${root.replace(/'/g, `'\\''`)}' && claude "design ingest of raw/worldbuilding"`,
      latestSession: latestSession(),
      prepModel: getStudioModel('prep').name,
      items: listItems().map(item => ({
        ...item,
        status: itemStatus(item),
        usage: loadStep(item.n).usage,
        ingestCommand: `cd '${root.replace(/'/g, `'\\''`)}' && claude "${item.kind === 'prepare' ? 'design' : 'interlude'} ingest of ${item.file}"`,
      })),
      steps: STUDIO_STEPS.map(step => {
        const state = loadStep(step.n);
        return { n: step.n, id: step.id, title: step.title, kind: step.kind, status: state.status, usage: state.usage };
      }),
    });
  } catch (error) {
    return studioError(error);
  }
}
