import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CampaignError, createCampaign } from '../src/app/utils/campaigns';
import { readActiveCampaignId } from '../src/app/utils/vault';
import { isolateEnv, makeCampaign, makeTempDir, makeTemplateArchive } from './helpers';

describe('createCampaign', () => {
  isolateEnv();

  function setup() {
    const dir = makeTempDir();
    process.env.CAMPAIGNS_DIR = dir;
    return dir;
  }
  const leftovers = (dir: string) => fs.readdirSync(dir).filter(name => name.startsWith('.creating-'));
  const fixture = () => makeTemplateArchive();

  async function caught(promise: Promise<unknown>): Promise<CampaignError> {
    try {
      await promise;
    } catch (e) {
      expect(e).toBeInstanceOf(CampaignError);
      return e as CampaignError;
    }
    throw new Error('expected a CampaignError');
  }

  it('creates, titles and opens the campaign', async () => {
    const dir = setup();
    expect(await createCampaign('La Valle', fixture)).toEqual({ id: 'la-valle' });
    const index = fs.readFileSync(path.join(dir, 'la-valle', 'wiki', 'index.md'), 'utf-8');
    expect(index.startsWith('# La Valle — Index\n')).toBe(true);
    expect(index).toContain('body');
    expect(fs.existsSync(path.join(dir, 'la-valle', 'README.md'))).toBe(false);
    expect(readActiveCampaignId()).toBe('la-valle');
    expect(leftovers(dir)).toEqual([]);
  });

  it.each(['', '   ', 'x'.repeat(81), '!!!'])('rejects name %j with 400', async (name) => {
    const dir = setup();
    expect((await caught(createCampaign(name, fixture))).status).toBe(400);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('rejects an existing id with 409', async () => {
    const dir = setup();
    makeCampaign(dir, 'la-valle');
    expect((await caught(createCampaign('La Valle', fixture))).status).toBe(409);
  });

  it('two concurrent creations with the same name: one succeeds, one 409', async () => {
    const dir = setup();
    const results = await Promise.allSettled([createCampaign('Twin', fixture), createCampaign('Twin', fixture)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.status).toBe(409);
    expect(fs.existsSync(path.join(dir, 'twin', 'wiki', 'index.md'))).toBe(true);
    expect(leftovers(dir)).toEqual([]);
  });

  it('download failure leaves nothing behind', async () => {
    const dir = setup();
    const error = await caught(createCampaign('Offline', async () => {
      throw new CampaignError('Could not download the template. Are you offline?', 502);
    }));
    expect(error.status).toBe(502);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('corrupt archive leaves nothing behind', async () => {
    const dir = setup();
    const error = await caught(createCampaign('Portal', async () => Buffer.from('<html>login</html>')));
    expect(error.status).toBe(502);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('unsupported template format → 500, nothing left', async () => {
    const dir = setup();
    const error = await caught(createCampaign('Future', () => makeTemplateArchive({ marker: { vaultFormat: 99 } })));
    expect(error.status).toBe(500);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('throws 409 when VAULT_PATH is set', async () => {
    const dir = setup();
    process.env.VAULT_PATH = makeCampaign(makeTempDir(), 'single');
    expect((await caught(createCampaign('New', fixture))).status).toBe(409);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
