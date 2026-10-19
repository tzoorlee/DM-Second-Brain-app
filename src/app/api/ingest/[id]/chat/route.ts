import { runIngestTurn } from '../../../../utils/ingest-agent';
import { getCampaignRoot } from '../../../../utils/vault';
import { BadRequest } from '../../../studio/common';
import { IdContext, ingestError, parseId, readJson, requireIngest, streamAgent } from '../../common';

// { message } | { proceed: true } | { continue: true }
export async function POST(request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const id = await parseId(context);
    requireIngest(id);
    const body = await readJson(request);
    const input = {
      message: typeof body.message === 'string' && body.message.trim() ? body.message.trim() : undefined,
      proceed: body.proceed === true,
      continue: body.continue === true,
    };
    if (!input.message && !input.proceed && !input.continue) throw new BadRequest('Write a message.');
    return await streamAgent((model, emit) => runIngestTurn(id, input, model, emit));
  } catch (error) {
    return ingestError(error);
  }
}
