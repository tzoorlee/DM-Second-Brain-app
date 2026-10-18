'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import type { CampaignsInfo } from '../utils/campaigns';

interface CampaignMenuProps {
  info: CampaignsInfo | null;
  // 'list' for "Manage campaigns…", 'new' for "+ New campaign"
  onManage: (view: 'list' | 'new') => void;
}

// The open campaign's name in the wiki panel header. With CAMPAIGNS_DIR it opens a
// menu to switch campaign; with VAULT_PATH the campaign is fixed and nothing opens.
export default function CampaignMenu({ info, onManage }: CampaignMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const title = info?.activeTitle || 'Campaign Wiki';
  const switchable = info?.mode === 'campaigns-dir';

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

  const label = (
    <span className="campaign-switcher-text">
      <span className="campaign-switcher-label">📖 Campaign</span>
      <span className="campaign-heading">{title}</span>
    </span>
  );

  if (!switchable) {
    return (
      <div className="campaign-fixed">
        <h2 className="campaign-switcher campaign-switcher-fixed">{label}</h2>
        <Link href="/studio" className="campaign-studio-link">World Studio</Link>
      </div>
    );
  }

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

  const manage = (view: 'list' | 'new') => {
    setOpen(false);
    onManage(view);
  };

  return (
    <div className="campaign-menu" ref={menuRef}>
      <button
        type="button"
        className="campaign-switcher"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
        <span className="campaign-switcher-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="campaign-menu-list glass" role="menu">
          {info.campaigns.filter(c => c.supported).map(campaign => {
            const current = campaign.id === info.activeId;
            return (
              <button
                key={campaign.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                className={current ? 'current' : undefined}
                disabled={pending !== null}
                onClick={() => (current ? setOpen(false) : openCampaign(campaign.id))}
              >
                <span className="campaign-menu-check" aria-hidden="true">{current ? '✓' : ''}</span>
                <span className="campaign-menu-item-text">
                  <span className="campaign-title">{pending === campaign.id ? 'Opening…' : campaign.title}</span>
                  <span className="campaign-id">{campaign.id}</span>
                </span>
              </button>
            );
          })}
          <div className="campaign-menu-separator" role="separator" />
          <button type="button" role="menuitem" className="campaign-menu-action" onClick={() => manage('new')}>
            <span className="campaign-menu-check" aria-hidden="true">+</span>
            New campaign
          </button>
          <Link href="/studio" role="menuitem" className="campaign-menu-action campaign-menu-link">
            <span className="campaign-menu-check" aria-hidden="true">✦</span>
            World Studio
          </Link>
          <button type="button" role="menuitem" className="campaign-menu-action" onClick={() => manage('list')}>
            <span className="campaign-menu-check" aria-hidden="true" />
            Manage campaigns…
          </button>
          {error && <div className="campaign-menu-error" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}
