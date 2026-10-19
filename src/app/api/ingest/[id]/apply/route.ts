import { NextResponse } from 'next/server';
import { applyIngest, conflicts } from '../../../../utils/ingest-apply';
import { getCampaignRoot } from '../../../../utils/vault';
import { IdContext, ingestError, parseId, readJson, requireIngest } from '../../common';

const paths = (value: unknown) => (Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : []);

// Writes the approved changes to the wiki. { keepTheirs, takeAgent } resolve conflicts;
// unresolved ones answer 409 with the list.
export async function POST(request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const s = requireIngest(await parseId(context));
    const body = await readJson(request);
    const keepTheirs = paths(body.keepTheirs);
    const takeAgent = paths(body.takeAgent);
    const open = s.phase === 'review' ? conflicts(s).filter(p => !keepTheirs.includes(p) && !takeAgent.includes(p)) : [];
    if (open.length) {
      return NextResponse.json({ error: 'Some pages changed in the wiki during the ingest.', conflicts: open }, { status: 409 });
    }
    return NextResponse.json(applyIngest(s, keepTheirs, takeAgent));
  } catch (error) {
    return ingestError(error);
  }
}
