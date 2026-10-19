import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { approveAll, askChanges, conflicts, linkWarnings, setReview } from '../../../utils/ingest-apply';
import { sessionFile } from '../../../utils/ingest-sessions';
import { IngestState } from '../../../utils/ingest-state';
import { getCampaignRoot } from '../../../utils/vault';
import { BadRequest } from '../../studio/common';
import { IdContext, ingestError, parseId, readJson, requireIngest } from '../common';

function withChecks(s: IngestState) {
  const recap = path.join(getCampaignRoot(), sessionFile(s.id));
  const open = s.phase === 'discuss' || s.phase === 'working' || s.phase === 'review';
  return {
    ...s,
    // The recap was edited after the ingest started: the DM may want to restart
    sourceChanged: open && fs.existsSync(recap) && fs.statSync(recap).mtimeMs !== s.sourceMtime,
    linkWarnings: s.phase === 'review' ? linkWarnings(s) : [],
    conflicts: s.phase === 'review' ? conflicts(s) : [],
  };
}

export async function GET(_request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    return NextResponse.json(withChecks(requireIngest(await parseId(context))));
  } catch (error) {
    return ingestError(error);
  }
}

// The DM's review: { path, review: approved|rejected } or { path, note } (ask for
// changes) or { approveAll: true }
export async function PUT(request: Request, context: IdContext) {
  try {
    getCampaignRoot();
    const id = await parseId(context);
    // Body first: a state loaded before a slow body could be saved over a newer one (an apply)
    const body = await readJson(request);
    const s = requireIngest(id);
    if (body.approveAll === true) return NextResponse.json(withChecks(approveAll(s)));
    if (typeof body.path !== 'string') throw new BadRequest('Name the page to review.');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (body.review === undefined) {
      if (!note) throw new BadRequest('Write what to change.');
      return NextResponse.json(withChecks(askChanges(s, body.path, note)));
    }
    if (body.review !== 'approved' && body.review !== 'rejected') throw new BadRequest('review is "approved" or "rejected".');
    return NextResponse.json(withChecks(setReview(s, body.path, body.review, note || undefined)));
  } catch (error) {
    return ingestError(error);
  }
}
