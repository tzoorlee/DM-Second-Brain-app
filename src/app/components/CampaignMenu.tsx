'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CampaignsInfo } from '../utils/campaigns';

interface CampaignMenuProps {
  info: CampaignsInfo | null;
  onManage: () => void;
}

// The open campaign's name in the wiki panel header. With CAMPAIGNS_DIR it opens a
// menu to switch campaign; with VAULT_PATH the campaign is fixed and it's a plain heading.
export default function CampaignMenu({ info, onManage }: CampaignMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const title = `📖 ${info?.activeTitle || 'Campaign Wiki'}`;

  // Escape and a click outside close the menu
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (info?.mode !== 'campaigns-dir') {
    return <h2 className="campaign-heading">{title}</h2>;
  }

  const others = info.campaigns.filter(c => c.id !== info.activeId && c.supported);

  // Switching changes the campaign for the whole app; the session draft survives
  // the reload because it lives in localStorage
  const openCampaign = async (id: string) => {
    setPending(id);
    setError('');
    try {
      const res = await fetch('/api/campaigns/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setError((await res.json().catch(() => ({}))).error || 'Could not open that campaign.');
    } catch {
      setError('The app server is not responding.');
    }
    setPending(null);
  };

  return (
    <div className="campaign-menu" ref={menuRef}>
      <button
        type="button"
        className="campaign-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="campaign-heading">{title}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="campaign-menu-list glass" role="menu">
          {others.map(campaign => (
            <button
              key={campaign.id}
              type="button"
              role="menuitem"
              disabled={pending !== null}
              onClick={() => openCampaign(campaign.id)}
            >
              {pending === campaign.id ? 'Opening…' : campaign.title}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="campaign-menu-manage"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            Manage campaigns…
          </button>
          {error && <div className="campaign-menu-error" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}
