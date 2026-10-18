import { NextResponse } from 'next/server';
import { setActiveCampaign } from '../../../utils/campaigns';
import { campaignErrorResponse, readStringField } from '../errors';

// Opens another campaign for the whole app
export async function POST(request: Request) {
  const id = await readStringField(request, 'id');
  if (id === null) return NextResponse.json({ error: 'Send the campaign id as { "id": "..." }.' }, { status: 400 });
  try {
    setActiveCampaign(id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return campaignErrorResponse(error, 'Failed to open the campaign');
  }
}
