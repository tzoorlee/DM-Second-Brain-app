import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTemplateArchive, extractTemplate, isAllowedTemplatePath, templateArchiveUrl } from '../src/app/utils/template';
import { makeTempDir, makeTemplateArchive } from './helpers';

describe('template archive', () => {
  it.each(['CLAUDE.md', 'TEMPLATES.md', 'dm-second-brain.json', '.gitignore', 'wiki', 'wiki/', 'wiki/index.md', 'raw/sessions/README.md', 'output/.gitkeep'])(
    'allows %j',
    (p) => expect(isAllowedTemplatePath(p)).toBe(true),
  );

  it.each(['README.md', 'examples/x/wiki/a.md', '../x', '/etc/passwd', 'wiki/../../x', 'wiki/./../x', 'wikis/a.md', 'wiki\\..\\x', ''])(
    'rejects %j',
    (p) => expect(isAllowedTemplatePath(p)).toBe(false),
  );

  it('extracts only the allowed files and no links', async () => {
    const dest = makeTempDir();
    await extractTemplate(await makeTemplateArchive(), dest);
    expect(fs.readFileSync(path.join(dest, 'wiki', 'index.md'), 'utf-8')).toContain('Campaign Index');
    expect(fs.existsSync(path.join(dest, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'raw', 'sessions', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'output', '.gitkeep'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'examples'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'DM-Second-Brain-0.4.0'))).toBe(false);
    expect(() => fs.lstatSync(path.join(dest, 'wiki', 'link.md'))).toThrow();
  });

  it('rejects a corrupt archive', async () => {
    await expect(extractTemplate(Buffer.from('<html>offline</html>'), makeTempDir())).rejects.toThrow();
  });

  it('templateArchiveUrl', () => {
    expect(templateArchiveUrl()).toBe('https://codeload.github.com/tzoorlee/DM-Second-Brain/tar.gz/refs/tags/v0.5.0');
  });
});

describe('template download', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A body streamed in 1 MB chunks, with no Content-Length to rely on
  const streamOf = (megabytes: number) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < megabytes; i++) controller.enqueue(new Uint8Array(1024 * 1024));
        controller.close();
      },
    });

  // The byte count or the error: never a big Buffer that Vitest would try to print
  const outcome = () => downloadTemplateArchive().then(archive => archive.length, (error: unknown) => error);

  it('returns the archive bytes', async () => {
    vi.stubGlobal('fetch', async () => new Response(streamOf(2)));
    expect((await downloadTemplateArchive()).length).toBe(2 * 1024 * 1024);
  });

  it('stops a download over 20 MB', async () => {
    vi.stubGlobal('fetch', async () => new Response(streamOf(21)));
    expect(await outcome()).toMatchObject({ status: 502, message: 'The template download is too large.' });
  });

  it('refuses a Content-Length over 20 MB before reading', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { headers: { 'Content-Length': String(25 * 1024 * 1024) } }));
    expect(await outcome()).toMatchObject({ status: 502, message: 'The template download is too large.' });
  });
});
