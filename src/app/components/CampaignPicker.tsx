'use client';

import React, { useState } from 'react';
import type { CampaignsInfo } from '../utils/campaigns';

// The campaigns in CAMPAIGNS_DIR and the form to create one. Opening or creating a
// campaign changes it for the whole app, so the page reloads afterwards.
export default function CampaignPicker({ info, focusNewCampaign = false }: { info: CampaignsInfo; focusNewCampaign?: boolean }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ where: 'list' | 'form'; message: string } | null>(null);
  // Set after a campaign is created: offer the World Studio before the dashboard
  const [created, setCreated] = useState(false);
  // '' = the template's empty world, or the id of a campaign whose world to reuse
  const [from, setFrom] = useState('');
  const [copyHouseRules, setCopyHouseRules] = useState(true);
  const worlds = info.campaigns.filter(c => c.supported);

  const send = async (url: string, body: object, where: 'list' | 'form', key: string) => {
    setPending(key);
    setError(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        if (key === 'create') {
          setCreated(true);
          setPending(null);
        } else {
          window.location.reload();
        }
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError({ where, message: data.error || 'Something went wrong.' });
    } catch {
      setError({ where, message: 'The app server is not responding.' });
    }
    setPending(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;
    send('/api/campaigns', from ? { name, from, copyHouseRules } : { name }, 'form', 'create');
  };

  if (created) {
    return (
      <div className="campaign-picker campaign-created" role="status">
        <p><strong>{name.trim()}</strong> is ready. Prepare the world now?</p>
        <p className="campaign-form-hint">The World Studio guides you through tone, geography, rules and the first adventure, with an AI partner if you have credentials.</p>
        <div className="campaign-form-row">
          <button type="button" onClick={() => { window.location.href = '/studio'; }}>Open the World Studio</button>
          <button type="button" className="secondary" onClick={() => window.location.reload()}>Later</button>
        </div>
      </div>
    );
  }

  return (
    <div className="campaign-picker">
      {info.campaigns.length === 0 ? (
        <p>No campaigns yet. Create your first one.</p>
      ) : (
        <ul className="campaign-list" aria-label="Campaigns">
          {info.campaigns.map(campaign => (
            <li key={campaign.id}>
              <button
                type="button"
                className={`result-item${campaign.id === info.activeId ? ' selected' : ''}`}
                disabled={!campaign.supported || pending !== null}
                aria-current={campaign.id === info.activeId ? 'true' : undefined}
                onClick={() => send('/api/campaigns/active', { id: campaign.id }, 'list', campaign.id)}
              >
                <span className="campaign-title">{pending === campaign.id ? 'Opening…' : campaign.title}</span>
                <span className="campaign-id">
                  {campaign.id}
                  {campaign.problem === 'bad-marker' && ' · Its dm-second-brain.json is broken'}
                  {campaign.problem === 'unsupported-format' && ' · Update the app to open it'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error?.where === 'list' && <div className="setup-problem" role="alert">{error.message}</div>}

      <form className="campaign-form" onSubmit={handleCreate}>
        <label htmlFor="campaign-name">New campaign</label>
        <div className="campaign-form-row">
          <input
            id="campaign-name"
            type="text"
            placeholder="Campaign name"
            maxLength={80}
            autoFocus={focusNewCampaign}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending !== null}
          />
          <button type="submit" disabled={!name.trim() || pending !== null}>
            {pending === 'create' ? 'Creating…' : 'Create'}
          </button>
        </div>
        {worlds.length > 0 && (
          <div className="campaign-form-from">
            <label>
              Start from
              <select value={from} onChange={e => setFrom(e.target.value)} disabled={pending !== null}>
                <option value="">An empty world (template)</option>
                {worlds.map(c => (
                  <option key={c.id} value={c.id}>The world of {c.title}</option>
                ))}
              </select>
            </label>
            {from && (
              <label className="campaign-form-check">
                <input type="checkbox" checked={copyHouseRules} onChange={e => setCopyHouseRules(e.target.checked)} disabled={pending !== null} />
                Also copy the house rules
              </label>
            )}
          </div>
        )}
        <p className="campaign-form-hint">
          {from
            ? 'Downloads the template, then copies the world (world bible, setting, SRD, worldbuilding) and keeps the old campaign’s wiki as history the new players don’t know. Sessions stay behind; the old campaign is not changed.'
            : 'Downloads the DM-Second-Brain template from GitHub into your campaigns folder.'}
        </p>
        {error?.where === 'form' && <div className="setup-problem" role="alert">{error.message}</div>}
      </form>
    </div>
  );
}
