import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { CampaignError } from '../../../../utils/campaign-error';
import { sourceFiles } from '../../../../utils/ingest-sources';
import { getCampaignRoot } from '../../../../utils/vault';
import { IdContext, ingestError, parseId } from '../../common';

// The session recap, shown read-only beside the chat
export async function GET(_request: Request, context: IdContext) {
  try {
    const file = path.join(getCampaignRoot(), sourceFiles(await parseId(context))[0]);
    if (!fs.existsSync(file)) throw new CampaignError('There is no such session.', 404);
    return NextResponse.json({ text: fs.readFileSync(file, 'utf-8') });
  } catch (error) {
    return ingestError(error);
  }
}
