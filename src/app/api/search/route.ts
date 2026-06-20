import { NextResponse } from 'next/server';
import { getAllEntities } from '../../utils/wiki';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase().trim() || '';

    const allEntities = getAllEntities();

    if (!query) {
      return NextResponse.json({ entities: allEntities });
    }

    const filtered = allEntities.filter(entity => {
      const titleMatch = entity.title.toLowerCase().includes(query);
      const bodyMatch = entity.body.toLowerCase().includes(query);
      const tagMatch = entity.frontmatter.tags?.some(tag => tag.toLowerCase().includes(query)) || false;
      const typeMatch = entity.frontmatter.type?.toLowerCase().includes(query) || false;

      return titleMatch || bodyMatch || tagMatch || typeMatch;
    });

    return NextResponse.json({ entities: filtered });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to search entities' }, { status: 500 });
  }
}
