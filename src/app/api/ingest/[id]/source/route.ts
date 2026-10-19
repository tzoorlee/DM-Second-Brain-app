import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { CampaignError } from '../../../../utils/campaign-error';
import { kindOf, sourceFiles } from '../../../../utils/ingest-sources';
import { getCampaignRoot } from '../../../../utils/vault';
import { IdContext, ingestError, parseId } from '../../common';

// The material of a source, shown read-only beside the chat: the file, or for the
// initial design every file under its path
export async function GET(_request: Request, context: IdContext) {
  try {
    const root = getCampaignRoot();
    const id = await parseId(context);
    const files = sourceFiles(id).filter(f => fs.existsSync(path.join(root, f)));
    if (files.length === 0) throw new CampaignError(`There is no ${id}.`, 404);
    const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8');
    const text = kindOf(id) === 'design-initial' ? files.map(f => `### ${f}\n\n${read(f)}`).join('\n') : read(files[0]);
    return NextResponse.json({ text });
  } catch (error) {
    return ingestError(error);
  }
}
