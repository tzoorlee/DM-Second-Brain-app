import { NextResponse } from 'next/server';
import { searchEntities, SearchMode } from '../../utils/search';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';
    // Anything other than an explicit DM request is treated as player-safe.
    const mode: SearchMode = searchParams.get('mode') === 'dm' ? 'dm' : 'player';
    const filter = (name: string) => searchParams.get(name)?.toLowerCase().trim() || undefined;

    const entities = searchEntities(query, mode, {
      type: filter('type'),
      canonStatus: filter('canon'),
      status: filter('status'),
    });

    return NextResponse.json({ entities });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to search entities' }, { status: 500 });
  }
}
