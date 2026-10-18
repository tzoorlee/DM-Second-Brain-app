import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { GET, POST as createPost } from '../src/app/api/campaigns/route';
import { POST as activePost } from '../src/app/api/campaigns/active/route';
import { isolateEnv, makeCampaign, makeTempDir, writeActive } from './helpers';

const post = (body: string) => new Request('http://localhost/api/campaigns', { method: 'POST', body });

describe('campaigns API', () => {
  isolateEnv();

  function setup() {
    const dir = makeTempDir();
    makeCampaign(dir, 'alpha');
    makeCampaign(dir, 'beta');
    writeActive(dir, '{"id":"alpha"}');
    process.env.CAMPAIGNS_DIR = dir;
    return dir;
  }

  it('GET lists campaigns', async () => {
    setup();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('campaigns-dir');
    expect(body.activeId).toBe('alpha');
    expect(body.campaigns).toHaveLength(2);
  });

  it('GET answers 200 with an empty list when CAMPAIGNS_DIR is unreadable', async () => {
    const dir = setup();
    fs.chmodSync(dir, 0o000);
    try {
      const res = await GET();
      expect(res.status).toBe(200);
      expect((await res.json()).campaigns).toEqual([]);
    } finally {
      fs.chmodSync(dir, 0o700);
    }
  });

  it('POST active switches campaign', async () => {
    setup();
    const res = await activePost(post('{"id":"beta"}'));
    expect(res.status).toBe(200);
    expect((await (await GET()).json()).activeId).toBe('beta');
  });

  it('POST active with a path → 400', async () => {
    setup();
    const res = await activePost(post('{"id":"../beta"}'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('POST active with an unknown id → 404', async () => {
    setup();
    expect((await activePost(post('{"id":"gamma"}'))).status).toBe(404);
  });

  it('POST active with bad JSON → 400', async () => {
    setup();
    expect((await activePost(post('not json'))).status).toBe(400);
  });

  it('POST active in vault-path mode → 409', async () => {
    const dir = setup();
    process.env.VAULT_PATH = `${dir}/alpha`;
    expect((await activePost(post('{"id":"beta"}'))).status).toBe(409);
  });

  it('POST create from an unknown world → 400', async () => {
    setup();
    const res = await createPost(post('{"name":"New","from":"nowhere","copyHouseRules":true}'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('nowhere');
  });

  it('POST create with a missing name → 400', async () => {
    setup();
    expect((await createPost(post('{}'))).status).toBe(400);
    expect((await createPost(post('{"name":42}'))).status).toBe(400);
  });
});
