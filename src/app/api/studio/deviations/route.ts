import fs from 'fs';
import { NextResponse } from 'next/server';
import { resolveInCampaign, WORLD_BIBLE, writeFileAtomic } from '../../../utils/studio-steps';
import { addDeviation } from '../../../utils/worldbible';
import { BadRequest, readJson, studioError } from '../common';

// "Keep as deviation": a published-lore warning the DM keeps becomes a Deviation
export async function POST(request: Request) {
  try {
    const { text } = await readJson(request);
    if (typeof text !== 'string' || !text.trim()) throw new BadRequest('Write the deviation.');
    const file = resolveInCampaign(WORLD_BIBLE);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '# World Bible\n\n';
    writeFileAtomic(file, addDeviation(current, text.trim().replace(/\s+/g, ' ')));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return studioError(error);
  }
}
