import { NextResponse } from 'next/server';
import { startIngest } from '../../../../utils/ingest-agent';
import { canStart } from '../../../../utils/ingest-sessions';
import { getCampaignRoot } from '../../../../utils/vault';
import { IdContext, ingestError, parseId, streamAgent } from '../../common';

// Starts the ingest of a session: the agent opens the discussion
export async function POST(_request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const id = await parseId(context);
    const check = canStart(id);
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 409 });
    return await streamAgent((model, emit) => startIngest(id, model, emit));
  } catch (error) {
    return ingestError(error);
  }
}
