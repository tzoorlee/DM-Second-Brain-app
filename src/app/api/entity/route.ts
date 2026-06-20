import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCampaignRoot, parseMarkdown } from '../../utils/wiki';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const relPath = searchParams.get('path');

    if (!relPath) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    const root = getCampaignRoot();
    const absolutePath = path.join(root, 'wiki', relPath);

    // Safety check: ensure the resolved path lies within the wiki directory
    const wikiDir = path.join(root, 'wiki');
    const relative = path.relative(wikiDir, absolutePath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isSafe || !fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 404 });
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const { frontmatter, body } = parseMarkdown(content);

    let title = path.basename(absolutePath, '.md');
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1].trim();
    }

    return NextResponse.json({
      title,
      relativePath: relPath,
      absolutePath,
      frontmatter,
      body
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to retrieve entity' }, { status: 500 });
  }
}
