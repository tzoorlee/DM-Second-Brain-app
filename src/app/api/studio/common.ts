import { NextResponse } from 'next/server';
import { CampaignError } from '../../utils/campaign-error';
import { getStep } from '../../utils/studio-steps';
import { VaultUnavailableError } from '../../utils/vault';

export class BadRequest extends Error {}

// A step (1–9) or a preparation/interlude (101+) of the open campaign
export function parseStep(value: unknown): number {
  const n = Number(value);
  try {
    if (Number.isInteger(n)) return getStep(n).n;
  } catch {
    // fall through
  }
  throw new BadRequest(`There is no step ${String(value)}.`);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === 'object') return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequest('Send a JSON object.');
}

// Maps errors to the API's answers: no open campaign → 409, bad input → 400
export function studioError(error: unknown) {
  const message = error instanceof Error ? error.message : 'The Studio request failed.';
  const status =
    error instanceof BadRequest ? 400 : error instanceof VaultUnavailableError ? 409 : error instanceof CampaignError ? error.status : 500;
  return NextResponse.json({ error: message }, { status });
}
