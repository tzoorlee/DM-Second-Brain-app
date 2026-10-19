'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import IngestChat, { Bubble, LiveExchange } from '../components/ingest/IngestChat';
import ReviewPanel from '../components/ingest/ReviewPanel';
import SourceList from '../components/ingest/SourceList';
import { IngestEvent, IngestOverview, IngestView, ingestApi } from '../components/ingest/api';

type Tab = 'sources' | 'chat' | 'review';

const IDLE: LiveExchange = { busy: false, bubbles: [], error: '' };

export default function IngestPage() {
  const [overview, setOverview] = useState<IngestOverview | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [view, setView] = useState<IngestView | null>(null);
  const [material, setMaterial] = useState('');
  const [live, setLive] = useState<LiveExchange>(IDLE);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<Tab>('chat');
  const [error, setError] = useState('');
  const currentRef = useRef<string | null>(null);

  const refresh = useCallback(async (id?: string) => {
    try {
      const next = await ingestApi.overview();
      setOverview(next);
      // The open ingest, else the first session not ingested yet, else the last one
      const target =
        id ?? currentRef.current ?? next.open ?? next.sources.find(s => s.status === 'not-ingested')?.id ?? next.sources.at(-1)?.id ?? null;
      currentRef.current = target;
      setCurrent(target);
      if (target) {
        const [state, source] = await Promise.all([ingestApi.state(target), ingestApi.source(target)]);
        if (currentRef.current !== target) return;
        setView(state);
        setMaterial(source.text);
      }
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      // ?session= is the 0.10 link
      await refresh(params.get('source') || params.get('session') || undefined);
    };
    load();
  }, [refresh]);

  const select = (id: string) => {
    if (live.busy) return;
    currentRef.current = id;
    setView(null);
    setNotice('');
    setLive(IDLE);
    setTab('chat');
    window.history.replaceState(null, '', `/ingest?source=${id}`);
    refresh(id);
  };

  // Runs one agent exchange, showing its text and staged pages as they arrive
  const run = async (first: Bubble | null, call: (onEvent: (e: IngestEvent) => void) => Promise<void>) => {
    setNotice('');
    setLive({ busy: true, bubbles: [...(first ? [first] : []), { who: 'ai', text: '' }], error: '' });
    const onEvent = (e: IngestEvent) => {
      setLive(l => {
        const bubbles = [...l.bubbles];
        if (e.type === 'text') {
          const last = bubbles[bubbles.length - 1];
          if (last?.who === 'ai') bubbles[bubbles.length - 1] = { who: 'ai', text: last.text + e.text };
          else bubbles.push({ who: 'ai', text: e.text });
        }
        if (e.type === 'staged') bubbles.push({ who: 'staged', text: e.change.kind === 'moved' ? `${e.change.from} → ${e.change.path}` : e.change.path });
        return { ...l, bubbles, error: e.type === 'error' ? e.message : l.error };
      });
    };
    let lastError = '';
    await call(e => {
      if (e.type === 'error') lastError = e.message;
      onEvent(e);
    });
    await refresh();
    // The saved state now holds the exchange; keep only an error on screen
    setLive({ ...IDLE, error: lastError });
  };

  if (error) {
    return (
      <main className="setup-screen">
        <div className="setup-card glass">
          <h1>Ingest</h1>
          <div className="setup-problem" role="alert">{error}</div>
          <Link href="/">Back to the dashboard</Link>
        </div>
      </main>
    );
  }
  if (!overview) return null;

  const session = overview.sources.find(s => s.id === current) ?? null;
  const inReview = view?.phase === 'review';

  return (
    <div className={`studio ingest tab-${tab === 'sources' ? 'steps' : tab === 'chat' ? 'chat' : 'draft'}`}>
      <header className="studio-header glass">
        <Link href="/" className="studio-back">← Dashboard</Link>
        <h1>Ingest</h1>
        <span className="studio-model">{overview.aiAvailable ? `AI: ${overview.model}` : 'AI not available'}</span>
      </header>
      <nav className="studio-tabs glass" aria-label="Panels">
        {(['sources', 'chat', 'review'] as const).map(t => (
          <button key={t} type="button" className={tab === t ? undefined : 'secondary'} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'sources' ? 'Sources' : t === 'chat' ? 'Chat' : inReview ? 'Review' : session?.kind === 'session' ? 'Recap' : 'Material'}
          </button>
        ))}
      </nav>
      <div className="studio-col studio-col-steps glass">
        <SourceList sources={overview.sources} current={current} onSelect={select} />
      </div>
      <div className="studio-col studio-col-chat glass">
        {notice && <div className="studio-result ok ingest-notice" role="status">{notice} <Link href="/">See the dashboard</Link></div>}
        {session ? (
          <IngestChat
            session={session}
            view={view}
            aiAvailable={overview.aiAvailable}
            terminalCommand={session.command ?? overview.terminalCommand}
            live={live}
            onStart={() => run(null, onEvent => ingestApi.start(session.id, onEvent))}
            onSend={body => run(body.message ? { who: 'dm', text: body.message } : null, onEvent => ingestApi.chat(session.id, body, onEvent))}
            onDiscard={async () => {
              try {
                await ingestApi.discard(session.id);
              } catch (err) {
                setLive({ ...IDLE, error: (err as Error).message });
              }
              refresh();
            }}
          />
        ) : (
          <p className="studio-nochat">Nothing to ingest yet: save a session recap in the dashboard, or write design in the World Studio.</p>
        )}
      </div>
      <div className="studio-col studio-col-draft glass">
        {inReview && view ? (
          <ReviewPanel
            key={view.id}
            view={view}
            busy={live.busy}
            onChanged={setView}
            onRequestChanges={() => {
              setTab('chat');
              run(null, onEvent => ingestApi.requestChanges(view.id, onEvent));
            }}
            onApplied={message => {
              setNotice(message);
              refresh();
            }}
          />
        ) : (
          <section className="studio-draft" aria-label="Material">
            <div className="studio-draft-header">
              <h2>{session?.kind === 'session' ? 'Recap' : 'Design material'}</h2>
              <span className="studio-draft-file">
                {session && session.files.length > 1 ? `raw/worldbuilding/ · ${session.files.length} files` : session?.files[0]}
              </span>
            </div>
            <pre className="ingest-recap">{material}</pre>
          </section>
        )}
      </div>
    </div>
  );
}
