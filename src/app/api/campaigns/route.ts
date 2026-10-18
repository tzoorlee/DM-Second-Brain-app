import { NextResponse } from 'next/server';
import { createCampaign, getCampaignsInfo } from '../../utils/campaigns';
import { campaignErrorResponse, readStringField } from './errors';

// The campaigns in CAMPAIGNS_DIR and which one is open. Ids only, never paths.
export async function GET() {
  try {
    return NextResponse.json(getCampaignsInfo());
  } catch (error: unknown) {
    return campaignErrorResponse(error, 'Failed to list campaigns');
  }
}

// Creates a campaign from the template and opens it
export async function POST(request: Request) {
  const name = await readStringField(request, 'name');
  if (name === null) return NextResponse.json({ error: 'Send the campaign name as { "name": "..." }.' }, { status: 400 });
  try {
    return NextResponse.json(await createCampaign(name), { status: 201 });
  } catch (error: unknown) {
    return campaignErrorResponse(error, 'Failed to create the campaign');
  }
}
