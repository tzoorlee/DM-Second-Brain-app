import { NextResponse } from 'next/server';
import type { IngestEvent } from '../../utils/ingest-agent';
import { isSourceId } from '../../utils/ingest-sources';
import { IngestState, loadIngest } from '../../utils/ingest-state';
import { getStudioModel } from '../../utils/studio-model';
import { CampaignError } from '../../utils/campaign-error';
import { BadRequest } from '../studio/common';

export { readJson, studioError as ingestError } from '../studio/common';

export type IdContext = { params: Promise<{ id: string }> };

// Only source ids cross the API, never a path
export async function parseId({ params }: IdContext): Promise<string> {
  const { id } = await params;
  if (!isSourceId(id)) throw new BadRequest(`"${id}" is not something the app can ingest.`);
  return id;
}

export function requireIngest(id: string): IngestState {
  const s = loadIngest(id);
  if (!s) throw new CampaignError(`${id} has no ingest.`, 404);
  return s;
}

export const NO_AI = 'The AI is not available: set ANTHROPIC_API_KEY or run `ant auth login`.';

// Runs an agent exchange, streamed as NDJSON: one IngestEvent per line. 503 without credentials.
export async function streamAgent(run: (model: ReturnType<typeof getStudioModel>, emit: (e: IngestEvent) => void) => Promise<void>) {
  const model = getStudioModel('ingest');
  if (!(await model.available())) return NextResponse.json({ error: NO_AI }, { status: 503 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      await run(model, event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
