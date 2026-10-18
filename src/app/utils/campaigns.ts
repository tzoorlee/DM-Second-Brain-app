import fs from 'fs';
import path from 'path';
import {
  ACTIVE_CAMPAIGN_FILE,
  getCampaignsDir,
  getVaultMode,
  getVaultStatus,
  isValidCampaignId,
  readActiveCampaignId,
  readVaultFormat,
  TEMPLATE_RELEASE,
  VaultMode,
} from './vault';
import { downloadTemplateArchive, extractTemplate } from './template';

import { CampaignError } from './campaign-error';

export { CampaignError };

export interface CampaignSummary {
  id: string;
  title: string;
  vaultFormat: number | null;
  supported: boolean;
  // Why an unsupported campaign can't be opened
  problem?: 'unsupported-format' | 'bad-marker';
}

// Answer of GET /api/campaigns
export interface CampaignsInfo {
  mode: VaultMode;
  activeId: string | null;
  activeTitle: string | null;
  campaigns: CampaignSummary[];
}

// "La Valle di Silverbrook" → "la-valle-di-silverbrook"; '' when nothing usable is left
export function campaignIdFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

const TEMPLATE_INDEX_TITLE = 'Campaign Index';

// The first heading of wiki/index.md, without " — Index"; the folder name when the
// index is missing or still has the template's heading
export function getCampaignTitle(root: string): string {
  let heading: string | undefined;
  try {
    heading = fs.readFileSync(path.join(root, 'wiki', 'index.md'), 'utf-8').match(/^# (.+)$/m)?.[1];
  } catch {
    heading = undefined;
  }
  const title = heading?.replace(/\s+—\s+Index\s*$/, '').trim();
  return title && title !== TEMPLATE_INDEX_TITLE ? title : path.basename(root);
}

export function listCampaigns(): CampaignSummary[] {
  const dir = getCampaignsDir();
  if (getVaultMode() !== 'campaigns-dir' || !dir || !fs.existsSync(dir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // An unreadable folder is reported by getVaultStatus()
    return [];
  }

  const campaigns: CampaignSummary[] = [];
  for (const entry of entries) {
    // Dot folders (like .creating-*) and names that can't be ids are not campaigns
    if (!isValidCampaignId(entry.name)) continue;
    const root = path.join(dir, entry.name);
    // statSync follows symlinks, so a campaign linked in from elsewhere is listed too
    if (!isDirectoryPath(root) || !fs.existsSync(path.join(root, 'wiki'))) continue;

    const format = readVaultFormat(root);
    let vaultFormat: number | null = null;
    if (format.ok) {
      vaultFormat = format.vaultFormat;
    } else if (format.problem === 'unsupported-format') {
      const declared: unknown = JSON.parse(fs.readFileSync(path.join(root, 'dm-second-brain.json'), 'utf-8')).vaultFormat;
      vaultFormat = typeof declared === 'number' ? declared : null;
    }
    campaigns.push({
      id: entry.name,
      title: getCampaignTitle(root),
      vaultFormat,
      supported: format.ok,
      ...(format.ok ? {} : { problem: format.problem }),
    });
  }
  return campaigns.sort((a, b) => a.title.localeCompare(b.title));
}

function isDirectoryPath(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// Written to a temporary file and renamed, so a reader never sees it half-written
function writeActiveCampaign(dir: string, id: string) {
  const tmp = path.join(dir, `${ACTIVE_CAMPAIGN_FILE}.${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ id }) + '\n');
  fs.renameSync(tmp, path.join(dir, ACTIVE_CAMPAIGN_FILE));
}

export function requireCampaignsDir(): string {
  const dir = getCampaignsDir();
  if (getVaultMode() !== 'campaigns-dir' || !dir) {
    throw new CampaignError('Campaigns can only be managed when CAMPAIGNS_DIR is set and VAULT_PATH is not.', 409);
  }
  return dir;
}

export function setActiveCampaign(id: string): void {
  const dir = requireCampaignsDir();
  if (!isValidCampaignId(id)) throw new CampaignError(`"${id}" is not a campaign id.`, 400);
  const campaign = listCampaigns().find(c => c.id === id);
  if (!campaign) throw new CampaignError(`There is no campaign "${id}".`, 404);
  if (campaign.problem === 'bad-marker') {
    throw new CampaignError(`"${campaign.title}" can't be opened: its dm-second-brain.json is broken.`, 400);
  }
  if (!campaign.supported) throw new CampaignError(`"${campaign.title}" needs a newer version of the app.`, 400);
  writeActiveCampaign(dir, id);
}

export function getCampaignsInfo(): CampaignsInfo {
  const mode = getVaultMode();
  const status = getVaultStatus();
  return {
    mode,
    activeId: mode === 'campaigns-dir' && status.ok ? readActiveCampaignId() : null,
    activeTitle: status.ok ? getCampaignTitle(status.root) : null,
    campaigns: listCampaigns(),
  };
}

// For names in scripts the id can't spell ("Дракон"): campaign, campaign-2, ...
// '' when the name has no letters or numbers at all.
function genericCampaignId(dir: string, name: string): string {
  if (!/[\p{L}\p{N}]/u.test(name)) return '';
  for (let n = 1; ; n++) {
    const id = n === 1 ? 'campaign' : `campaign-${n}`;
    if (!fs.existsSync(path.join(dir, id))) return id;
  }
}

// Downloads the pinned template release into a new campaign folder and opens it.
// The campaign is built in a .creating-* folder and renamed into place at the end,
// so a failure never leaves a half-made campaign behind.
export async function createCampaign(name: string, download: () => Promise<Buffer> = downloadTemplateArchive): Promise<{ id: string }> {
  const dir = requireCampaignsDir();
  // Line breaks would split the index heading
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new CampaignError('Give the campaign a name.', 400);
  if (trimmed.length > 80) throw new CampaignError('Keep the name under 80 characters.', 400);
  const id = campaignIdFromName(trimmed) || genericCampaignId(dir, trimmed);
  if (!id) throw new CampaignError('Use some letters or numbers in the name.', 400);
  const target = path.join(dir, id);
  const taken = () => new CampaignError(`There is already a campaign folder named "${id}".`, 409);
  if (fs.existsSync(target)) throw taken();

  const archive = await download();
  const tmp = fs.mkdtempSync(path.join(dir, `.creating-${id}-`));
  try {
    try {
      await extractTemplate(archive, tmp);
    } catch {
      throw new CampaignError('The downloaded template is not a valid archive.', 502);
    }
    const format = readVaultFormat(tmp);
    if (!format.ok || !fs.existsSync(path.join(tmp, 'dm-second-brain.json'))) {
      throw new CampaignError(`The template release ${TEMPLATE_RELEASE} uses an unsupported vault format.`, 500);
    }

    const indexPath = path.join(tmp, 'wiki', 'index.md');
    if (fs.existsSync(indexPath)) {
      const index = fs.readFileSync(indexPath, 'utf-8');
      fs.writeFileSync(indexPath, index.replace(/^# .*$/m, () => `# ${trimmed} — Index`));
    }

    // Checked again: another request may have created it during the download.
    // On Linux a rename onto an empty folder would silently replace it.
    if (fs.existsSync(target)) throw taken();
    try {
      fs.renameSync(tmp, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw code === 'EEXIST' || code === 'ENOTEMPTY' ? taken() : error;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  writeActiveCampaign(dir, id);
  return { id };
}
