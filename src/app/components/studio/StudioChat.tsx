'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Inconsistency, StepWithDraft, studioApi } from './api';

interface StudioChatProps {
  step: StepWithDraft;
  aiAvailable: boolean;
  published: boolean;
  onChanged: () => void;
  onOpenStep: (n: number) => void;
}

interface Bubble {
  who: 'dm' | 'ai';
  text: string;
}

// The saved conversation, as bubbles: the DM's messages and the AI's text
function bubblesOf(step: StepWithDraft): Bubble[] {
  const bubbles: Bubble[] = [];
  for (const m of step.messages) {
    if (m.role === 'user' && typeof m.content === 'string') bubbles.push({ who: 'dm', text: m.content });
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const text = m.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
      if (text) bubbles.push({ who: 'ai', text });
    }
  }
  return bubbles;
}

export default function StudioChat({ step, aiAvailable, published, onChanged, onOpenStep }: StudioChatProps) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [step, pending]);

  if (!aiAvailable) {
    return (
      <section className="studio-chat studio-chat-off" aria-label="Chat">
        <h2>AI partner</h2>
        <p>
          The AI isn&apos;t available. Set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> or run{' '}
          <code>ant auth login</code>, then reload. You can still write the draft by hand and approve it.
        </p>
      </section>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setPending([{ who: 'dm', text }, { who: 'ai', text: '' }]);
    try {
      await studioApi.chat(step.n, text, event => {
        if (event.type === 'text') setPending(p => [p[0], { who: 'ai', text: p[1].text + event.text }]);
        if (event.type === 'error') setError(event.message);
      });
    } finally {
      setPending([]);
      setBusy(false);
      onChanged();
    }
  };

  const resolve = async (issue: Inconsistency, action: 'here' | 'other' | 'keep' | 'deviation') => {
    try {
      if (action === 'other') {
        const { targetStep } = await studioApi.fix(step.n, issue.id);
        if (targetStep === null) setError('That contradiction is in the wiki: ask the agent to fix it, or adjust this draft.');
        else onOpenStep(targetStep);
        return;
      }
      if (action === 'deviation') await studioApi.deviation(`${issue.problem} (${issue.quote})`);
      await studioApi.update(step.n, { inconsistencyId: issue.id, inconsistencyStatus: action === 'here' ? 'fixed' : 'kept' });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const open = step.inconsistencies.filter(i => i.status === 'open');

  const clear = async () => {
    if (!window.confirm('Clear this step\'s conversation? The draft, proposals and issues stay.')) return;
    await studioApi.update(step.n, { clearMessages: true });
    onChanged();
  };

  return (
    <section className="studio-chat" aria-label="Chat">
      <div className="studio-messages" aria-live="polite">
        {[...bubblesOf(step), ...pending].map((b, i) => (
          <div key={i} className={`studio-bubble ${b.who}`}>
            {b.text || (busy && b.who === 'ai' ? '…' : '')}
          </div>
        ))}
        {open.map(issue => (
          <div key={issue.id} className={`studio-issue ${issue.severity}`} role="alert">
            <strong>{issue.severity === 'warning' ? 'Published lore' : 'Inconsistency'}</strong> · <code>{issue.file}</code>
            <p>{issue.problem}</p>
            {issue.quote && <blockquote>{issue.quote}</blockquote>}
            <p className="studio-issue-fix">Proposed fix: {issue.proposedFix}</p>
            <div className="studio-issue-actions">
              <button type="button" onClick={() => resolve(issue, 'here')}>Fix here</button>
              <button type="button" className="secondary" onClick={() => resolve(issue, 'other')}>Fix the other file</button>
              {issue.severity === 'warning' && published ? (
                <button type="button" className="secondary" onClick={() => resolve(issue, 'deviation')}>Keep as deviation</button>
              ) : (
                <button type="button" className="secondary" onClick={() => resolve(issue, 'keep')}>Keep</button>
              )}
            </div>
          </div>
        ))}
        {error && <div className="studio-error" role="alert">{error}</div>}
        <div ref={endRef} />
      </div>
      <form className="studio-send" onSubmit={send}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
          placeholder="Tell the AI what you have in mind…"
          aria-label="Message"
          rows={3}
          disabled={busy}
        />
        <div className="studio-send-actions">
          <button type="submit" disabled={busy || !message.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
          {step.messages.length > 0 && (
            <button type="button" className="secondary" onClick={clear} disabled={busy}>Clear conversation</button>
          )}
        </div>
      </form>
    </section>
  );
}
