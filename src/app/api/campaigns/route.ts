import { NextResponse } from 'next/server';
import { createCampaign, getCampaignsInfo } from '../../utils/campaigns';
import { campaignErrorResponse } from './errors';

// The campaigns in CAMPAIGNS_DIR and which one is open. Ids only, never paths.
export async function GET() {
  try {
    return NextResponse.json(getCampaignsInfo());
  } catch (error: unknown) {
    return campaignErrorResponse(error, 'Failed to list campaigns');
  }
}

// Creates a campaign from the template, or from the world of another campaign
// ({ from: "<id>", copyHouseRules }), and opens it
export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    // handled below
  }
  const name = typeof body.name === 'string' ? body.name : null;
  if (name === null) return NextResponse.json({ error: 'Send the campaign name as { "name": "..." }.' }, { status: 400 });
  try {
    const options = typeof body.from === 'string' ? { from: body.from, copyHouseRules: body.copyHouseRules !== false } : {};
    return NextResponse.json(await createCampaign(name, undefined, options), { status: 201 });
  } catch (error: unknown) {
    return campaignErrorResponse(error, 'Failed to create the campaign');
  }
}
