import { NextResponse } from 'next/server';
import { listSources, openIngest, terminalCommand } from '../../utils/ingest-sources';
import { getStudioModel } from '../../utils/studio-model';
import { getCampaignRoot } from '../../utils/vault';
import { ingestError } from './common';

// What can be ingested (sessions and design), the open ingest, and whether the AI can be used
export async function GET() {
  try {
    const root = getCampaignRoot();
    const model = getStudioModel('ingest');
    const sources = listSources();
    const next = sources.find(s => s.status === 'not-ingested' || s.status === 'in-progress');
    return NextResponse.json({
      aiAvailable: await model.available(),
      model: model.name,
      sources,
      open: openIngest(),
      // Single quotes so $, ` and " in the path stay literal when pasted in a shell
      terminalCommand: `cd '${root.replace(/'/g, `'\\''`)}' && ${next ? terminalCommand(next.id) : 'claude "ingest raw/sessions/session-NN.md"'}`,
    });
  } catch (error) {
    return ingestError(error);
  }
}
