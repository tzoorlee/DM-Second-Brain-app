import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  CampaignError,
  campaignIdFromName,
  getCampaignsInfo,
  getCampaignTitle,
  listCampaigns,
  setActiveCampaign,
} from '../src/app/utils/campaigns';
import { getVaultStatus } from '../src/app/utils/vault';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

describe('campaignIdFromName', () => {
  it.each([
    ['La Valle di Silverbrook', 'la-valle-di-silverbrook'],
    ['Ñoño', 'nono'],
    ['  Città  del   Sole!! ', 'citta-del-sole'],
    ['!!!', ''],
  ])('campaignIdFromName(%j) === %j', (name, id) => {
    expect(campaignIdFromName(name)).toBe(id);
  });

  it('ids are cut to 64 characters without a trailing dash', () => {
    const id = campaignIdFromName('a'.repeat(63) + ' b' + 'c'.repeat(10));
    expect(id).toBe('a'.repeat(63));
  });
});

describe('getCampaignTitle', () => {
  it('title from index heading', () => {
    const root = makeCampaign(makeTempDir(), 'alpha', { index: '# Silverbrook Campaign — Index\n\nbody' });
    expect(getCampaignTitle(root)).toBe('Silverbrook Campaign');
  });

  it('template heading falls back to folder name', () => {
    const root = makeCampaign(makeTempDir(), 'alpha', { index: '# Campaign Index\n' });
    expect(getCampaignTitle(root)).toBe('alpha');
  });

  it('missing index falls back to folder name', () => {
    const root = makeCampaign(makeTempDir(), 'alpha');
    expect(getCampaignTitle(root)).toBe('alpha');
  });
});

describe('listing and activating', () => {
  isolateEnv();

  function setup() {
    const dir = makeTempDir();
    process.env.CAMPAIGNS_DIR = dir;
    return dir;
  }

  it('lists campaigns sorted by title, skips dot folders, folders without wiki/ and files', () => {
    const dir = setup();
    makeCampaign(dir, 'zeta', { index: '# Alpha Tale — Index' });
    makeCampaign(dir, 'beta');
    makeCampaign(dir, '.creating-x-123');
    fs.mkdirSync(path.join(dir, 'notes'));
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'x');
    expect(listCampaigns()).toEqual([
      { id: 'zeta', title: 'Alpha Tale', vaultFormat: 1, supported: true },
      { id: 'beta', title: 'beta', vaultFormat: 1, supported: true },
    ]);
  });

  it('skips folders whose name is not a valid id', () => {
    const dir = setup();
    makeCampaign(dir, 'My Campaign');
    expect(listCampaigns()).toEqual([]);
  });

  it('lists unsupported campaigns with supported: false', () => {
    const dir = setup();
    makeCampaign(dir, 'future', { marker: { vaultFormat: 99 } });
    makeCampaign(dir, 'broken', { marker: 'not json' });
    expect(listCampaigns()).toEqual([
      { id: 'broken', title: 'broken', vaultFormat: null, supported: false },
      { id: 'future', title: 'future', vaultFormat: 99, supported: false },
    ]);
  });

  it('lists nothing when CAMPAIGNS_DIR does not exist', () => {
    process.env.CAMPAIGNS_DIR = path.join(makeTempDir(), 'nope');
    expect(listCampaigns()).toEqual([]);
  });

  it('setActiveCampaign writes the active file', () => {
    const dir = setup();
    makeCampaign(dir, 'alpha');
    setActiveCampaign('alpha');
    expect(getVaultStatus()).toMatchObject({ ok: true, root: path.join(dir, 'alpha') });
  });

  it.each(['../x', 'missing', 'unsupported'])('setActiveCampaign(%j) throws 400', (id) => {
    const dir = setup();
    makeCampaign(dir, 'unsupported', { marker: { vaultFormat: 99 } });
    makeCampaign(path.dirname(dir), 'x');
    expect(() => setActiveCampaign(id)).toThrow(expect.objectContaining({ status: 400 }));
    expect(fs.existsSync(path.join(dir, '.active-campaign.json'))).toBe(false);
  });

  it('setActiveCampaign throws 409 when VAULT_PATH is set', () => {
    const dir = setup();
    makeCampaign(dir, 'alpha');
    process.env.VAULT_PATH = path.join(dir, 'alpha');
    let error: unknown;
    try {
      setActiveCampaign('alpha');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CampaignError);
    expect((error as CampaignError).status).toBe(409);
  });

  it('getCampaignsInfo in campaigns-dir mode', () => {
    const dir = setup();
    makeCampaign(dir, 'alpha', { index: '# Alpha — Index' });
    makeCampaign(dir, 'beta');
    setActiveCampaign('alpha');
    expect(getCampaignsInfo()).toEqual({
      mode: 'campaigns-dir',
      activeId: 'alpha',
      activeTitle: 'Alpha',
      campaigns: [
        { id: 'alpha', title: 'Alpha', vaultFormat: 1, supported: true },
        { id: 'beta', title: 'beta', vaultFormat: 1, supported: true },
      ],
    });
  });

  it('getCampaignsInfo without an open campaign', () => {
    const dir = setup();
    makeCampaign(dir, 'alpha');
    expect(getCampaignsInfo()).toMatchObject({ mode: 'campaigns-dir', activeId: null, activeTitle: null });
  });

  it('getCampaignsInfo in vault-path mode', () => {
    const root = makeCampaign(makeTempDir(), 'single', { index: '# Single — Index' });
    process.env.VAULT_PATH = root;
    expect(getCampaignsInfo()).toEqual({ mode: 'vault-path', activeId: null, activeTitle: 'Single', campaigns: [] });
  });
});
