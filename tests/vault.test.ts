import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCampaignsDir, getVaultMode, getVaultStatus, isValidCampaignId } from '../src/app/utils/vault';
import { isolateEnv, makeCampaign, makeTempDir, writeActive } from './helpers';

describe('campaign resolution', () => {
  isolateEnv();
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('VAULT_PATH wins over CAMPAIGNS_DIR', () => {
    const dir = makeTempDir();
    const single = makeCampaign(dir, 'single');
    const campaigns = makeTempDir();
    makeCampaign(campaigns, 'alpha');
    writeActive(campaigns, '{"id":"alpha"}');
    process.env.VAULT_PATH = single;
    process.env.CAMPAIGNS_DIR = campaigns;

    expect(getVaultMode()).toBe('vault-path');
    const status = getVaultStatus();
    expect(status.ok && status.root).toBe(single);
  });

  it('unconfigured without both variables', () => {
    expect(getVaultMode()).toBe('unconfigured');
    const status = getVaultStatus();
    expect(!status.ok && status.problem).toBe('not-configured');
  });

  it('CAMPAIGNS_DIR missing on disk', () => {
    process.env.CAMPAIGNS_DIR = path.join(makeTempDir(), 'nope');
    expect(getVaultMode()).toBe('campaigns-dir');
    const status = getVaultStatus();
    expect(!status.ok && status.problem).toBe('campaigns-dir-not-found');
  });

  it('no active file → no-active-campaign', () => {
    const campaigns = makeTempDir();
    makeCampaign(campaigns, 'alpha');
    process.env.CAMPAIGNS_DIR = campaigns;
    const status = getVaultStatus();
    expect(!status.ok && status.problem).toBe('no-active-campaign');
  });

  it('opens the active campaign', () => {
    const campaigns = makeTempDir();
    makeCampaign(campaigns, 'alpha');
    writeActive(campaigns, '{"id":"alpha"}');
    process.env.CAMPAIGNS_DIR = campaigns;
    const status = getVaultStatus();
    expect(status).toMatchObject({ ok: true, root: path.join(campaigns, 'alpha'), vaultFormat: 1 });
  });

  it('active folder deleted → no-active-campaign', () => {
    const campaigns = makeTempDir();
    const alpha = makeCampaign(campaigns, 'alpha');
    writeActive(campaigns, '{"id":"alpha"}');
    process.env.CAMPAIGNS_DIR = campaigns;
    fs.rmSync(alpha, { recursive: true });
    const status = getVaultStatus();
    expect(!status.ok && status.problem).toBe('no-active-campaign');
  });

  it.each(['not json', '{}', '{"id":"../alpha"}', '{"id":"Alpha"}'])('bad active file %s → no-active-campaign', (content) => {
    const campaigns = makeTempDir();
    makeCampaign(campaigns, 'alpha');
    // A sibling folder that a path-like id could reach
    makeCampaign(path.dirname(campaigns), 'alpha');
    writeActive(campaigns, content);
    process.env.CAMPAIGNS_DIR = campaigns;
    const status = getVaultStatus();
    expect(!status.ok && status.problem).toBe('no-active-campaign');
  });

  it('isValidCampaignId', () => {
    for (const id of ['alpha', 'a-1', '0']) expect(isValidCampaignId(id)).toBe(true);
    for (const id of ['', '-a', 'A', 'a/b', '..', 'a'.repeat(65), 42, null]) expect(isValidCampaignId(id)).toBe(false);
  });

  it('expands ~/ in CAMPAIGNS_DIR', () => {
    const home = makeTempDir();
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    process.env.CAMPAIGNS_DIR = '~/c';
    expect(getCampaignsDir()).toBe(path.join(home, 'c'));
  });

  it('expands ~/ in VAULT_PATH', () => {
    const home = makeTempDir();
    makeCampaign(home, 'single');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    process.env.VAULT_PATH = '~/single';
    const status = getVaultStatus();
    expect(status.ok && status.root).toBe(path.join(home, 'single'));
  });

  it('unsupported format of the active campaign', () => {
    const campaigns = makeTempDir();
    makeCampaign(campaigns, 'alpha', { marker: { vaultFormat: 99 } });
    writeActive(campaigns, '{"id":"alpha"}');
    process.env.CAMPAIGNS_DIR = campaigns;
    const status = getVaultStatus();
    expect(!status.ok && status.problem).toBe('unsupported-format');
  });
});
