import { NextResponse } from 'next/server';
import { runChatTurn } from '../../../utils/studio-ai';
import { getStudioModel } from '../../../utils/studio-model';
import { getCampaignRoot } from '../../../utils/vault';
import { BadRequest, parseStep, readJson, studioError } from '../common';

// One chat exchange, streamed as NDJSON: one StudioEvent per line
export async function POST(request: Request) {
  try {
    getCampaignRoot();
    const body = await readJson(request);
    const n = parseStep(body.n);
    if (typeof body.message !== 'string' || !body.message.trim()) throw new BadRequest('Write a message.');
    const model = getStudioModel();
    if (!(await model.available())) {
      return NextResponse.json({ error: 'The AI is not available: set ANTHROPIC_API_KEY or run `ant auth login`.' }, { status: 503 });
    }
    const message = body.message.trim();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        await runChatTurn(n, message, model, event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return studioError(error);
  }
}
