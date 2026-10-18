import fs from 'fs';
import path from 'path';

// Vault formats this app can read safely. The format is declared by
// dm-second-brain.json at the vault root (see the DM-Second-Brain template's
// README, "Vault format"). An unknown format is refused rather than guessed:
// it could mark DM secrets in a way this app doesn't hide.
export const SUPPORTED_VAULT_FORMATS = [1];
export const VAULT_MARKER_FILE = 'dm-second-brain.json';

export type VaultProblem = 'not-configured' | 'not-found' | 'not-a-vault' | 'bad-marker' | 'unsupported-format';

export type VaultStatus =
  | { ok: true; root: string; vaultFormat: number; warning?: string }
  | { ok: false; problem: VaultProblem; message: string };

export function getVaultStatus(): VaultStatus {
  const vaultPath = process.env.VAULT_PATH?.trim();
  if (!vaultPath) {
    return { ok: false, problem: 'not-configured', message: 'VAULT_PATH is not set. Point it at your campaign folder in .env.local.' };
  }

  // Absolute, or relative to the folder the app runs from. The vault is chosen
  // at runtime, so keep it out of the build's file tracing.
  const root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), vaultPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, problem: 'not-found', message: `VAULT_PATH is "${vaultPath}", but there is no folder there.` };
  }
  if (!fs.existsSync(path.join(root, 'wiki'))) {
    return { ok: false, problem: 'not-a-vault', message: `"${vaultPath}" has no wiki/ folder, so it is not a DM-Second-Brain campaign.` };
  }

  const markerPath = path.join(root, VAULT_MARKER_FILE);
  // Campaigns created before the marker existed are format 1
  if (!fs.existsSync(markerPath)) {
    return {
      ok: true,
      root,
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
  return { ok: true, root, vaultFormat };
}

// Thrown when an API route needs the vault and it isn't usable; routes answer 503.
export class VaultUnavailableError extends Error {}

export function getCampaignRoot(): string {
  const status = getVaultStatus();
  if (!status.ok) throw new VaultUnavailableError(status.message);
  return status.root;
}

export const errorStatus = (error: unknown) => (error instanceof VaultUnavailableError ? 503 : 500);
