import { NextResponse } from 'next/server';
import { getEntity, SearchMode } from '../../utils/search';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');
    // Anything other than an explicit DM request is treated as player-safe.
    const mode: SearchMode = searchParams.get('mode') === 'dm' ? 'dm' : 'player';

    if (!relPath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    // Hidden and missing pages get the same answer, so a path reveals nothing
    const entity = getEntity(relPath, mode);
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 404 });
    }

    return NextResponse.json(entity);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to retrieve entity' }, { status: 500 });
  }
}
