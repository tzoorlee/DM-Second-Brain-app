import { NextResponse } from 'next/server';
import { listSources, openIngest } from '../../utils/ingest-sources';
import { getStudioModel } from '../../utils/studio-model';
import { getCampaignRoot } from '../../utils/vault';
import { ingestError } from './common';

// The sessions to ingest, the open ingest, and whether the AI can be used
export async function GET() {
  try {
    const root = getCampaignRoot();
    const model = getStudioModel('ingest');
    const sessions = listSources().filter(s => s.kind === 'session');
    const next = sessions.find(s => s.status !== 'ingested');
    return NextResponse.json({
      aiAvailable: await model.available(),
      model: model.name,
      sessions,
      open: openIngest(),
      // Single quotes so $, ` and " in the path stay literal when pasted in a shell
      terminalCommand: `cd '${root.replace(/'/g, `'\\''`)}' && claude "ingest ${next ? next.files[0] : 'raw/sessions/session-NN.md'}"`,
    });
  } catch (error) {
    return ingestError(error);
  }
}
