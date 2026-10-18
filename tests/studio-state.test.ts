import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { listSteps, loadStep, saveStep } from '../src/app/utils/studio-state';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

let root: string;
const stateDir = () => path.join(root, '.dm-second-brain', 'studio');

describe('Studio state', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
  });

  it('starts every step as todo with nothing in it', () => {
    expect(loadStep(3)).toEqual({
      n: 3, status: 'todo', draft: null, messages: [], proposals: [], inconsistencies: [],
      usage: { input: 0, output: 0, cacheRead: 0 },
    });
  });

  it('saves and loads a step', () => {
    const state = { ...loadStep(2), status: 'in-progress' as const, draft: '## Tone and Atmosphere\n- Grim.\n' };
    state.messages.push({ role: 'user', content: 'Make it grim' });
    saveStep(state);
    expect(fs.existsSync(path.join(stateDir(), 'step-2.json'))).toBe(true);
    expect(loadStep(2)).toEqual(state);
    expect(fs.readdirSync(stateDir())).toEqual(['step-2.json']);
  });

  it('treats a corrupt state file as a fresh step', () => {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(path.join(stateDir(), 'step-4.json'), '{not json');
    expect(loadStep(4).status).toBe('todo');
  });

  it('lists all nine steps', () => {
    saveStep({ ...loadStep(1), status: 'approved' });
    const steps = listSteps();
    expect(steps.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(steps[0].status).toBe('approved');
  });

  it('refuses a step number that does not exist', () => {
    expect(() => loadStep(12)).toThrow();
    expect(() => saveStep({ ...loadStep(1), n: 0 })).toThrow();
  });
});
