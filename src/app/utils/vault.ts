import fs from 'fs';
import os from 'os';
import path from 'path';

// Vault formats this app can read safely. The format is declared by
// dm-second-brain.json at the vault root (see the DM-Second-Brain template's
// README, "Vault format"). An unknown format is refused rather than guessed:
// it could mark DM secrets in a way this app doesn't hide.
export const SUPPORTED_VAULT_FORMATS = [1];
export const VAULT_MARKER_FILE = 'dm-second-brain.json';

// The template release new campaigns are created from. Raise it together with
// SUPPORTED_VAULT_FORMATS: its dm-second-brain.json must declare a supported format.
export const TEMPLATE_REPO = 'tzoorlee/DM-Second-Brain';
export const TEMPLATE_RELEASE = 'v0.4.0'; // vault format 1

// In CAMPAIGNS_DIR, remembers which campaign is open for the whole app
export const ACTIVE_CAMPAIGN_FILE = '.active-campaign.json';

export type VaultMode = 'vault-path' | 'campaigns-dir' | 'unconfigured';

export type VaultProblem =
  | 'not-configured'
  | 'not-found'
  | 'not-a-vault'
  | 'bad-marker'
  | 'unsupported-format'
  | 'no-active-campaign'
  | 'campaigns-dir-not-found'
  | 'campaigns-dir-unreadable';

export type VaultStatus =
  | { ok: true; root: string; vaultFormat: number; warning?: string }
  | { ok: false; problem: VaultProblem; message: string };

export type VaultFormatCheck =
  | { ok: true; vaultFormat: number; warning?: string }
  | { ok: false; problem: 'bad-marker' | 'unsupported-format'; message: string };

const envValue = (name: string) => process.env[name]?.trim() || undefined;

// Absolute, relative to the folder the app runs from, or starting with ~/. The
// vault is chosen at runtime, so keep it out of the build's file tracing.
function resolveSetting(value: string): string {
  const expanded = value === '~' || value.startsWith('~/') ? path.join(os.homedir(), value.slice(1)) : value;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), expanded);
}

export function getVaultMode(): VaultMode {
  if (envValue('VAULT_PATH')) return 'vault-path';
  if (envValue('CAMPAIGNS_DIR')) return 'campaigns-dir';
  return 'unconfigured';
}

export function getCampaignsDir(): string | null {
  const value = envValue('CAMPAIGNS_DIR');
  return value ? resolveSetting(value) : null;
}

// A campaign id is the name of a folder directly inside CAMPAIGNS_DIR. Only ids
// cross the API, never paths, so this pattern is what keeps requests inside it.
export function isValidCampaignId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 64 && /^[a-z0-9][a-z0-9-]*$/.test(id);
}

export function readActiveCampaignId(): string | null {
  const dir = getCampaignsDir();
  if (!dir) return null;
  try {
    const id: unknown = JSON.parse(fs.readFileSync(path.join(dir, ACTIVE_CAMPAIGN_FILE), 'utf-8')).id;
    return isValidCampaignId(id) ? id : null;
  } catch {
    return null;
  }
}

const isDirectory = (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();

export function readVaultFormat(root: string): VaultFormatCheck {
  const markerPath = path.join(root, VAULT_MARKER_FILE);
  // Campaigns created before the marker existed are format 1
  if (!fs.existsSync(markerPath)) {
    return {
      ok: true,
      vaultFormat: 1,
      warning: `No ${VAULT_MARKER_FILE} in this campaign, so vault format 1 is assumed. Copy the file from the template to make it explicit.`,
    };
  }

  let vaultFormat: unknown;
  try {
    vaultFormat = JSON.parse(fs.readFileSync(markerPath, 'utf-8')).vaultFormat;
  } catch {
    return { ok: false, problem: 'bad-marker', message: `${VAULT_MARKER_FILE} is not valid JSON.` };
  }
  if (typeof vaultFormat !== 'number' || !SUPPORTED_VAULT_FORMATS.includes(vaultFormat)) {
    return {
      ok: false,
      problem: 'unsupported-format',
      message: `This campaign uses vault format ${JSON.stringify(vaultFormat)}, but this app supports format ${SUPPORTED_VAULT_FORMATS.join(', ')}. Update the app.`,
    };
  }
  return { ok: true, vaultFormat };
}

// label names the folder in messages: the VAULT_PATH value or the campaign id
function checkVaultFolder(root: string, label: string): VaultStatus {
  if (!isDirectory(root)) {
    return { ok: false, problem: 'not-found', message: `VAULT_PATH is "${label}", but there is no folder there.` };
  }
  if (!fs.existsSync(path.join(root, 'wiki'))) {
    return { ok: false, problem: 'not-a-vault', message: `"${label}" has no wiki/ folder, so it is not a DM-Second-Brain campaign.` };
  }
  const format = readVaultFormat(root);
  return format.ok ? { ...format, root } : format;
}

// VAULT_PATH opens one campaign and wins; otherwise CAMPAIGNS_DIR holds the
// campaigns and .active-campaign.json says which one is open.
export function getVaultStatus(): VaultStatus {
  const vaultPath = envValue('VAULT_PATH');
  if (vaultPath) return checkVaultFolder(resolveSetting(vaultPath), vaultPath);

  const campaignsDir = getCampaignsDir();
  if (!campaignsDir) {
    return { ok: false, problem: 'not-configured', message: 'Neither CAMPAIGNS_DIR nor VAULT_PATH is set. Set one in .env.local.' };
  }
  if (!isDirectory(campaignsDir)) {
    return {
      ok: false,
      problem: 'campaigns-dir-not-found',
      message: `CAMPAIGNS_DIR is "${envValue('CAMPAIGNS_DIR')}", but there is no folder there.`,
    };
  }

  try {
    fs.accessSync(campaignsDir, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    return {
      ok: false,
      problem: 'campaigns-dir-unreadable',
      message: `The app can't read CAMPAIGNS_DIR ("${envValue('CAMPAIGNS_DIR')}"). Check the folder's permissions.`,
    };
  }

  const id = readActiveCampaignId();
  const root = id && path.join(campaignsDir, id);
  if (!root || !fs.existsSync(path.join(root, 'wiki'))) {
    return { ok: false, problem: 'no-active-campaign', message: 'No campaign is open. Pick one or create a new one.' };
  }
  return checkVaultFolder(root, id);
}

// Thrown when an API route needs the vault and it isn't usable; routes answer 503.
export class VaultUnavailableError extends Error {}

export function getCampaignRoot(): string {
  const status = getVaultStatus();
  if (!status.ok) throw new VaultUnavailableError(status.message);
  return status.root;
}

export const errorStatus = (error: unknown) => (error instanceof VaultUnavailableError ? 503 : 500);
