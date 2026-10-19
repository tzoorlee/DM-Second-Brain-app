import { NextResponse } from 'next/server';
import { isWikiPath, readReal, readStaged } from '../../../../utils/ingest-state';
import { getCampaignRoot } from '../../../../utils/vault';
import { BadRequest } from '../../../studio/common';
import { IdContext, ingestError, parseId, requireIngest } from '../../common';

// A change for the review's diff: the wiki's version (before) and the staged one (after).
// For a moved page, before is the page at its old path.
export async function GET(request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const s = requireIngest(await parseId(context));
    const p = new URL(request.url).searchParams.get('path') ?? '';
    if (!isWikiPath(p)) throw new BadRequest(`"${p}" is not a wiki path.`);
    const change = s.changes.find(c => c.path === p);
    return NextResponse.json({ before: readReal(change?.kind === 'moved' ? change.from! : p), after: readStaged(s, p) });
  } catch (error) {
    return ingestError(error);
  }
}
