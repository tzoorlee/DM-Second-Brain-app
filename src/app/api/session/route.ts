import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getCampaignRoot } from '../../utils/wiki';

export async function GET() {
  try {
    const root = getCampaignRoot();
    const sessionsDir = path.join(root, 'raw/sessions');

    let nextSessionNum = 1;

    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir);
      let maxSessionNum = 0;

      for (const file of files) {
        // Match session-NN.md or session-N.md
        const match = file.match(/^session-(\d+)\.md$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSessionNum) {
            maxSessionNum = num;
          }
        }
      }
      nextSessionNum = maxSessionNum + 1;
    }

    return NextResponse.json({ nextSessionNum });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to detect next session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const root = getCampaignRoot();
    const sessionsDir = path.join(root, 'raw/sessions');

    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const body = await request.json();
    const { content, title } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Auto-detect session number
    const files = fs.readdirSync(sessionsDir);
    let maxSessionNum = 0;
    for (const file of files) {
      const match = file.match(/^session-(\d+)\.md$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSessionNum) {
          maxSessionNum = num;
        }
      }
    }
    const nextSessionNum = maxSessionNum + 1;
    const paddedNum = String(nextSessionNum).padStart(2, '0');
    const fileName = `session-${paddedNum}.md`;
    const filePath = path.join(sessionsDir, fileName);

    // Format file with a header
    const fileTitle = title || `Session ${paddedNum}`;
    const fileContent = `# ${fileTitle}\n\n${content.trim()}\n`;

    fs.writeFileSync(filePath, fileContent, 'utf-8');

    return NextResponse.json({
      success: true,
      fileName,
      sessionNum: nextSessionNum,
      filePath
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to save session' }, { status: 500 });
  }
}
