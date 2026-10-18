import fs from 'fs';
import path from 'path';
import { CampaignError } from './campaign-error';
import { campaignIdFromName } from './campaigns';
import { campaignHasSessions, isIngested, ITEMS_FILE, readItems, resolveInCampaign, StudioItem, writeFileAtomic } from './studio-steps';
import { getCampaignRoot } from './vault';

export type ItemStatus = 'draft' | 'written' | 'ingested';

const SESSION = /^session-(\d+)\.md$/;

// "session-14" for the highest-numbered recap in raw/sessions/, null before play
export function latestSession(): string | null {
  const dir = path.join(getCampaignRoot(), 'raw', 'sessions');
  if (!fs.existsSync(dir)) return null;
  const numbers = fs.readdirSync(dir).map(f => f.match(SESSION)).filter(m => m).map(m => m![1]);
  if (!numbers.length) return null;
  return `session-${numbers.sort((a, b) => Number(b) - Number(a))[0]}`;
}

export const listItems = (): StudioItem[] => readItems();

export function itemStatus(item: StudioItem): ItemStatus {
  if (isIngested(item.file)) return 'ingested';
  return fs.existsSync(path.join(getCampaignRoot(), item.file)) ? 'written' : 'draft';
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// A new preparation (raw/worldbuilding/<date>-<slug>.md) or interlude
// (raw/interludes/<date>-<slug>.md). Both exist only once play has started.
export function createItem(
  kind: StudioItem['kind'],
  title: string,
  extras: { dateInWorld?: string; afterSession?: string },
  today = new Date(),
): StudioItem {
  if (!campaignHasSessions()) throw new CampaignError('Preparations and interludes start after your first session.', 409);
  const name = title.replace(/\s+/g, ' ').trim();
  const slug = campaignIdFromName(name);
  if (!slug) throw new CampaignError('Give it a title with some letters or numbers.', 400);
  if (kind === 'interlude') {
    if (!extras.dateInWorld?.trim()) throw new CampaignError('Give the in-world date the interlude happened.', 400);
    if (!/^session-\d+$/.test(extras.afterSession ?? '')) throw new CampaignError('after_session must look like session-14.', 400);
  }

  const items = readItems();
  const folder = kind === 'prepare' ? 'raw/worldbuilding' : 'raw/interludes';
  const taken = (file: string) => items.some(i => i.file === file) || fs.existsSync(path.join(getCampaignRoot(), file));
  let file = `${folder}/${ymd(today)}-${slug}.md`;
  for (let k = 2; taken(file); k++) file = `${folder}/${ymd(today)}-${slug}-${k}.md`;

  const item: StudioItem = {
    n: Math.max(100, ...items.map(i => i.n)) + 1,
    kind,
    title: name,
    file,
    ...(kind === 'interlude' ? { dateInWorld: extras.dateInWorld!.trim().replace(/"/g, ''), afterSession: extras.afterSession } : {}),
  };
  writeFileAtomic(resolveInCampaign(ITEMS_FILE), JSON.stringify([...items, item], null, 2) + '\n');
  return item;
}
