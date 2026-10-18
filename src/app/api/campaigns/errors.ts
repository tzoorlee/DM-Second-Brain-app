import { NextResponse } from 'next/server';
import { CampaignError } from '../../utils/campaigns';

// Reads one string field from a JSON body; null when the body or field is missing
export async function readStringField(request: Request, field: string): Promise<string | null> {
  try {
    const value: unknown = (await request.json())?.[field];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function campaignErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CampaignError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: (error as Error).message || fallback }, { status: 500 });
}
