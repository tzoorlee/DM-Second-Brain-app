import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface EntityFrontmatter {
  type?: string;
  tags?: string[];
  status?: string;
  canon_status?: string;
  first_seen?: string;
  last_updated?: string;
  pg_known?: boolean;
  faction?: string;
  location?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface Entity {
  title: string;
  relativePath: string; // e.g. "characters/npcs/elder-maren.md"
  absolutePath: string;
  frontmatter: EntityFrontmatter;
  body: string;
}

// The campaign vault defaults to the folder above dashboard/. Set VAULT_PATH
// (absolute, or relative to dashboard/) to point at a campaign stored elsewhere.
export function getCampaignRoot(): string {
  return path.resolve(process.cwd(), process.env.VAULT_PATH?.trim() || '..');
}

export function parseMarkdown(content: string): { frontmatter: EntityFrontmatter; body: string } {
  const { data, content: body } = matter(content);
  return { frontmatter: data as EntityFrontmatter, body: body.trim() };
}

export interface WikiFile {
  absolutePath: string;
  relativePath: string; // relative to wiki/
  mtimeMs: number;
}

// Pages that are scaffolding, not campaign content: the wiki's meta files and
// the `_template-*.md` starters.
function isContentPage(relativePath: string): boolean {
  if (relativePath === 'index.md' || relativePath === 'log.md') return false;
  return !path.basename(relativePath).startsWith('_');
}

function walkMarkdownFiles(dir: string, wikiDir: string, fileList: WikiFile[] = []): WikiFile[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkMarkdownFiles(filePath, wikiDir, fileList);
    } else if (file.endsWith('.md')) {
      const relativePath = path.relative(wikiDir, filePath);
      if (isContentPage(relativePath)) {
        fileList.push({ absolutePath: filePath, relativePath, mtimeMs: stat.mtimeMs });
      }
    }
  }
  return fileList;
}

export function listWikiFiles(): WikiFile[] {
  const wikiDir = path.join(getCampaignRoot(), 'wiki');
  return walkMarkdownFiles(wikiDir, wikiDir);
}

const DM_SECRETS_HEADING = /^## Secrets \(DM only\)[\s\S]*$/im;

// Splits a page body into what players may see and the inline
// `## Secrets (DM only)` section, which by convention runs to the end of the page.
export function splitDmSecrets(body: string): { publicBody: string; dmBody: string } {
  const match = body.match(DM_SECRETS_HEADING);
  if (!match || match.index === undefined) return { publicBody: body, dmBody: '' };
  return { publicBody: body.slice(0, match.index).trimEnd(), dmBody: match[0] };
}

// Whether a page may be shown in player-safe mode: never `secrets/` pages
// or entities the PCs don't know about yet.
export function isPlayerVisible(entity: Entity): boolean {
  if (entity.frontmatter.type === 'secret') return false;
  if (entity.relativePath.split(path.sep)[0] === 'secrets') return false;
  return entity.frontmatter.pg_known !== false;
}

export function getAllEntities(files: WikiFile[] = listWikiFiles()): Entity[] {
  const entities: Entity[] = [];

  for (const { absolutePath, relativePath } of files) {
    try {
      const fileContent = fs.readFileSync(absolutePath, 'utf-8');
      const { frontmatter, body } = parseMarkdown(fileContent);
      
      // Infer title from file name or first H1
      let title = path.basename(absolutePath, '.md');
      const h1Match = body.match(/^#\s+(.+)$/m);
      if (h1Match) {
        title = h1Match[1].trim();
      }

      entities.push({
        title,
        relativePath,
        absolutePath,
        frontmatter,
        body
      });
    } catch (e) {
      console.error(`Error reading/parsing file ${absolutePath}:`, e);
    }
  }

  return entities;
}
