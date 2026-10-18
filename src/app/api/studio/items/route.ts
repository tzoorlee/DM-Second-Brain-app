import { NextResponse } from 'next/server';
import { createItem } from '../../../utils/studio-items';
import { getCampaignRoot } from '../../../utils/vault';
import { BadRequest, readJson, studioError } from '../common';

// "+ Prepare" and "+ Interlude": a new dated file to work on in the Studio
export async function POST(request: Request) {
  try {
    getCampaignRoot();
    const body = await readJson(request);
    if (body.kind !== 'prepare' && body.kind !== 'interlude') throw new BadRequest('kind is prepare or interlude.');
    if (typeof body.title !== 'string') throw new BadRequest('Give it a title.');
    const item = createItem(body.kind, body.title, {
      dateInWorld: typeof body.dateInWorld === 'string' ? body.dateInWorld : undefined,
      afterSession: typeof body.afterSession === 'string' ? body.afterSession : undefined,
    });
    return NextResponse.json({ n: item.n }, { status: 201 });
  } catch (error) {
    return studioError(error);
  }
}
