'use client';

import React, { useEffect, useRef, useState } from 'react';
import { IngestView, SessionInfo } from './api';

export interface Bubble {
  who: 'dm' | 'ai' | 'staged';
  text: string;
}

// What the page shows while the agent works: its streaming text and the pages it stages
export interface LiveExchange {
  busy: boolean;
  bubbles: Bubble[];
  error: string;
}

const STAGE_TOOLS: Record<string, (input: Record<string, string>) => string> = {
  write_page: i => i.path,
  move_page: i => `${i.from} → ${i.to}`,
  append_log: () => 'log.md',
};

// The saved conversation as bubbles: the DM's words, the agent's text, and "✎ path" for each staged write
function bubblesOf(view: IngestView): Bubble[] {
  const bubbles: Bubble[] = [];
  for (const m of view.messages) {
    if (typeof m.content === 'string') {
      bubbles.push({ who: m.role === 'user' ? 'dm' : 'ai', text: m.content });
      continue;
    }
    const text = m.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    if (text) bubbles.push({ who: m.role === 'user' ? 'dm' : 'ai', text });
    for (const b of m.content) {
      if (b.type === 'tool_use' && STAGE_TOOLS[b.name]) bubbles.push({ who: 'staged', text: STAGE_TOOLS[b.name](b.input as Record<string, string>) });
    }
  }
  return bubbles;
}

interface IngestChatProps {
  session: SessionInfo;
  view: IngestView | null;
  aiAvailable: boolean;
  terminalCommand: string;
  live: LiveExchange;
  onStart: () => void;
  onSend: (body: { message?: string; proceed?: true; continue?: true }) => void;
  onDiscard: () => void;
}

export default function IngestChat({ session, view, aiAvailable, terminalCommand, live, onStart, onSend, onDiscard }: IngestChatProps) {
  const [message, setMessage] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [view, live]);

  const phase = view?.phase;
  const open = phase === 'discuss' || phase === 'working' || phase === 'review';

  if (!aiAvailable && !open) {
    return (
      <section className="studio-chat studio-chat-off" aria-label="Chat">
        <h2>Ingest agent</h2>
        <p>
          The AI isn&apos;t available. Set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> or run <code>ant auth login</code>, then
          reload. Or ingest from a terminal with Claude Code:
        </p>
        <pre className="studio-command">{terminalCommand}</pre>
      </section>
    );
  }

  if (!view || !open) {
    return (
      <section className="studio-chat studio-chat-off" aria-label="Chat">
        <h2>Session {session.n}</h2>
        {session.status === 'ingested' ? (
          <p>This session is already in the wiki.</p>
        ) : (
          <>
            <p>
              The agent reads the recap, discusses it with you, then prepares the wiki changes. Nothing reaches the wiki until you review and
              apply them.
            </p>
            {phase === 'discarded' && <p className="studio-step-usage">The previous ingest of this session was discarded.</p>}
            <div>
              <button type="button" onClick={onStart} disabled={live.busy}>{live.busy ? 'Starting…' : 'Start ingest'}</button>
            </div>
            {live.error && <div className="studio-error" role="alert">{live.error}</div>}
          </>
        )}
      </section>
    );
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || live.busy) return;
    setMessage('');
    onSend({ message: text });
  };

  const discard = () => {
    if (window.confirm(`Discard the ingest of session ${session.n}? The staged changes are deleted; the wiki is untouched.`)) onDiscard();
  };

  return (
    <section className="studio-chat" aria-label="Chat">
      <div className="studio-messages" aria-live="polite">
        {view.sourceChanged && (
          <div className="studio-issue warning" role="alert">
            The recap changed after this ingest started. Discard and start again so the agent reads the new version.
          </div>
        )}
        {[...bubblesOf(view), ...live.bubbles].map((b, i) =>
          b.who === 'staged' ? (
            <div key={i} className="ingest-staged">✎ {b.text}</div>
          ) : (
            <div key={i} className={`studio-bubble ${b.who}`}>{b.text || (live.busy && b.who === 'ai' ? '…' : '')}</div>
          ),
        )}
        {live.error && <div className="studio-error" role="alert">{live.error}</div>}
        <div ref={endRef} />
      </div>
      {phase === 'review' ? (
        <div className="studio-send">
          <p className="studio-step-usage">
            {live.busy ? 'Working… the agent is redoing the pages you asked for.' : 'The agent is done: review its changes on the right.'}
          </p>
          <div className="studio-send-actions">
            <button type="button" className="secondary" onClick={discard} disabled={live.busy}>Discard</button>
          </div>
        </div>
      ) : (
        <form className="studio-send" onSubmit={send}>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) send(e);
            }}
            placeholder={phase === 'discuss' ? 'Answer the agent, or Proceed when it has it right…' : 'Tell the agent something…'}
            aria-label="Message"
            rows={3}
            disabled={live.busy || !aiAvailable}
          />
          <div className="studio-send-actions">
            <button type="submit" disabled={live.busy || !message.trim() || !aiAvailable}>{live.busy ? 'Working…' : 'Send'}</button>
            {phase === 'discuss' && (
              <button type="button" onClick={() => onSend({ proceed: true })} disabled={live.busy || !aiAvailable}>Proceed</button>
            )}
            {phase === 'working' && !live.busy && (
              <button type="button" onClick={() => onSend({ continue: true })} disabled={!aiAvailable}>Continue</button>
            )}
            <button type="button" className="secondary" onClick={discard} disabled={live.busy}>Discard</button>
          </div>
          <p className="studio-step-usage">
            Tokens: {view.usage.input.toLocaleString()} in · {view.usage.output.toLocaleString()} out · {view.usage.cacheRead.toLocaleString()} cache reads · {(view.usage.cacheWrite ?? 0).toLocaleString()} cache writes
          </p>
        </form>
      )}
    </section>
  );
}
