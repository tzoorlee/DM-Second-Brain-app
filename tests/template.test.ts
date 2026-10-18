import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { extractTemplate, isAllowedTemplatePath, templateArchiveUrl } from '../src/app/utils/template';
import { makeTempDir, makeTemplateArchive } from './helpers';

describe('template archive', () => {
  it.each(['CLAUDE.md', 'dm-second-brain.json', '.gitignore', 'wiki', 'wiki/', 'wiki/index.md', 'raw/sessions/README.md', 'output/.gitkeep'])(
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
    expect(templateArchiveUrl()).toBe('https://codeload.github.com/tzoorlee/DM-Second-Brain/tar.gz/refs/tags/v0.4.0');
  });
});
