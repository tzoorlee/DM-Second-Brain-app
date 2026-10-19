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
    // Single quotes so $, ` and " in the path stay literal when pasted in a shell
    const cd = `cd '${root.replace(/'/g, `'\\''`)}' && `;
    const sources = listSources().map(s => ({ ...s, command: s.status === 'invalid-name' ? null : cd + terminalCommand(s.id) }));
    const next = sources.find(s => s.status === 'not-ingested' || s.status === 'in-progress');
    return NextResponse.json({
      aiAvailable: await model.available(),
      model: model.name,
      sources,
      open: openIngest(),
      terminalCommand: next?.command ?? `${cd}claude "ingest raw/sessions/session-NN.md"`,
    });
  } catch (error) {
    return ingestError(error);
  }
}
