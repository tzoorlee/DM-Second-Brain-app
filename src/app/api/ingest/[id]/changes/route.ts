import { requestChanges } from '../../../../utils/ingest-agent';
import { getCampaignRoot } from '../../../../utils/vault';
import { IdContext, ingestError, parseId, requireIngest, streamAgent } from '../../common';

// Sends the DM's "Ask for changes" notes to the agent
export async function POST(_request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const id = await parseId(context);
    requireIngest(id);
    return await streamAgent((model, emit) => requestChanges(id, model, emit));
  } catch (error) {
    return ingestError(error);
  }
}
