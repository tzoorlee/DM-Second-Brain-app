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
  VaultMode,
} from './vault';

// Carries the HTTP status the API answers with
export class CampaignError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface CampaignSummary {
  id: string;
  title: string;
  vaultFormat: number | null;
  supported: boolean;
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

  const campaigns: CampaignSummary[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Dot folders (like .creating-*) and names that can't be ids are not campaigns
    if (!entry.isDirectory() || !isValidCampaignId(entry.name)) continue;
    const root = path.join(dir, entry.name);
    if (!fs.existsSync(path.join(root, 'wiki'))) continue;

    const format = readVaultFormat(root);
    let vaultFormat: number | null = null;
    if (format.ok) {
      vaultFormat = format.vaultFormat;
    } else if (format.problem === 'unsupported-format') {
      const declared: unknown = JSON.parse(fs.readFileSync(path.join(root, 'dm-second-brain.json'), 'utf-8')).vaultFormat;
      vaultFormat = typeof declared === 'number' ? declared : null;
    }
    campaigns.push({ id: entry.name, title: getCampaignTitle(root), vaultFormat, supported: format.ok });
  }
  return campaigns.sort((a, b) => a.title.localeCompare(b.title));
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
  const campaign = isValidCampaignId(id) ? listCampaigns().find(c => c.id === id) : undefined;
  if (!campaign) throw new CampaignError(`There is no campaign "${id}".`, 400);
  if (!campaign.supported) throw new CampaignError(`"${campaign.title}" needs a newer version of the app.`, 400);
  fs.writeFileSync(path.join(dir, ACTIVE_CAMPAIGN_FILE), JSON.stringify({ id }) + '\n');
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
