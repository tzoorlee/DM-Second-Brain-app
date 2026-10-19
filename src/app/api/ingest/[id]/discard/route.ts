import { NextResponse } from 'next/server';
import { CampaignError } from '../../../../utils/campaign-error';
import { isRunning } from '../../../../utils/ingest-agent';
import { discardIngest } from '../../../../utils/ingest-state';
import { getCampaignRoot } from '../../../../utils/vault';
import { IdContext, ingestError, parseId, requireIngest } from '../../common';

// Drops the ingest and its staged pages; the session can be ingested again
export async function POST(_request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const s = requireIngest(await parseId(context));
    if (isRunning(s.id)) throw new CampaignError('The agent is working: wait for it to stop, then discard.', 409);
    if (s.phase === 'applied' || s.phase === 'discarded') throw new CampaignError(`${s.id} is already ${s.phase}.`, 409);
    discardIngest(s);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return ingestError(error);
  }
}
