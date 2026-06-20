import fs from 'fs';
import path from 'path';

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

export function getCampaignRoot(): string {
  return path.resolve(process.cwd(), '..');
}

export function parseMarkdown(content: string): { frontmatter: EntityFrontmatter; body: string } {
  const frontmatter: EntityFrontmatter = {};
  let body = content;

  if (content.startsWith('---')) {
    const endFrontmatterIndex = content.indexOf('---', 3);
    if (endFrontmatterIndex !== -1) {
      const rawFrontmatter = content.substring(3, endFrontmatterIndex).trim();
      body = content.substring(endFrontmatterIndex + 3).trim();

      const lines = rawFrontmatter.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim();
          let valStr = line.substring(colonIndex + 1).trim();

          // Remove enclosing quotes if any
          if ((valStr.startsWith('"') && valStr.endsWith('"')) || (valStr.startsWith("'") && valStr.endsWith("'"))) {
            valStr = valStr.substring(1, valStr.length - 1);
          }

          // Parse array format: [tag1, tag2]
          if (valStr.startsWith('[') && valStr.endsWith(']')) {
            const arr = valStr.substring(1, valStr.length - 1)
              .split(',')
              .map(s => s.trim())
              .filter(s => s.length > 0)
              .map(s => {
                if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                  return s.substring(1, s.length - 1);
                }
                return s;
              });
            frontmatter[key] = arr;
          } else if (valStr === 'true') {
            frontmatter[key] = true;
          } else if (valStr === 'false') {
            frontmatter[key] = false;
          } else {
            frontmatter[key] = valStr;
          }
        }
      }
    }
  }

  return { frontmatter, body };
}

function getMarkdownFilesRecursively(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getMarkdownFilesRecursively(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

export function getAllEntities(): Entity[] {
  const root = getCampaignRoot();
  const wikiDir = path.join(root, 'wiki');
  const files = getMarkdownFilesRecursively(wikiDir);

  const entities: Entity[] = [];

  for (const file of files) {
    const relativePath = path.relative(wikiDir, file);
    
    // Ignore meta files in the wiki root
    if (relativePath === 'index.md' || relativePath === 'log.md') {
      continue;
    }

    try {
      const fileContent = fs.readFileSync(file, 'utf-8');
      const { frontmatter, body } = parseMarkdown(fileContent);
      
      // Infer title from file name or first H1
      let title = path.basename(file, '.md');
      const h1Match = body.match(/^#\s+(.+)$/m);
      if (h1Match) {
        title = h1Match[1].trim();
      }

      entities.push({
        title,
        relativePath,
        absolutePath: file,
        frontmatter,
        body
      });
    } catch (e) {
      console.error(`Error reading/parsing file ${file}:`, e);
    }
  }

  return entities;
}
