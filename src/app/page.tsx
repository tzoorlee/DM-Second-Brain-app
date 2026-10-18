'use client';

import React, { useState, useEffect, useRef } from 'react';
import WikiMarkdown, { WikiInline } from './components/WikiMarkdown';
import { getCaretCoordinates } from './utils/caret';

interface EntityFrontmatter {
  type?: string;
  tags?: string[];
  status?: string;
  canon_status?: string;
  first_seen?: string;
  last_updated?: string;
  pg_known?: boolean;
  faction?: string;
  location?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface EntitySummary {
  title: string;
  relativePath: string;
  frontmatter: EntityFrontmatter;
}

interface Entity extends EntitySummary {
  absolutePath: string;
  body: string;
}

type PanelId = 'wiki' | 'sheet' | 'notes';

const TYPE_LABELS: Record<string, string> = {
  npc: 'NPCs',
  pc: 'Player Characters',
  city: 'Cities',
  'city-history': 'City Histories',
  region: 'Regions',
  'region-history': 'Region Histories',
  location: 'Locations',
  dungeon: 'Dungeons',
  faction: 'Factions',
  'faction-history': 'Faction Histories',
  quest: 'Quests',
  item: 'Items',
  event: 'Events',
  secret: 'Secrets',
  world: 'World',
};

const TYPE_COLORS: Record<string, string> = {
  npc: 'var(--accent-purple)',
  pc: 'var(--accent-teal)',
  city: '#ca8a04',
  region: '#65a30d',
  location: '#ea580c',
  dungeon: '#dc2626',
  faction: '#2563eb',
  quest: '#e11d48',
  item: '#d97706',
  event: '#0891b2',
  secret: '#db2777',
  world: '#475569',
};

// "city-history" pages share their entity's color
const getTypeColor = (type?: string) =>
  TYPE_COLORS[type?.toLowerCase().replace(/-history$/, '') ?? ''] ?? 'var(--text-muted)';

const getStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'alive':
    case 'active':
      return 'var(--success)';
    case 'dead':
    case 'destroyed':
      return 'var(--danger)';
    case 'completed':
      return '#60a5fa';
    default:
      return 'var(--warning)';
  }
};

const getCanonColor = (canon?: string) => (canon === 'established' ? '#60a5fa' : 'var(--accent-gold)');

// Distinct, lowercased values of a frontmatter field across the wiki.
const distinctValues = (entities: EntitySummary[], field: 'type' | 'status' | 'canon_status') =>
  [...new Set(entities.map(e => e.frontmatter[field]?.toLowerCase()).filter((v): v is string => !!v))].sort();

const fileBaseName = (relativePath: string) => relativePath.split('/').pop()?.replace(/\.md$/, '') ?? '';

// Unsaved session notes survive a reload in this browser
const DRAFT_KEY = 'dm-second-brain:session-draft';

export default function Dashboard() {
  // Every page visible in the current mode (for wikilinks, autocomplete, filter options)
  const [allEntities, setAllEntities] = useState<EntitySummary[]>([]);
  // The ranked, filtered results shown in the browser
  const [results, setResults] = useState<EntitySummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedCanon, setSelectedCanon] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  // Pages left by following wikilinks, for the Back button
  const [history, setHistory] = useState<string[]>([]);
  const [dmMode, setDmMode] = useState(true);
  // Which panel is shown when the screen is too narrow for all three
  const [activePanel, setActivePanel] = useState<PanelId>('wiki');

  // Note-taking state
  const [sessionTitle, setSessionTitle] = useState('');
  const [nextSessionNum, setNextSessionNum] = useState<number>(1);
  const [sessionNotes, setSessionNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [isSaving, setIsSaving] = useState(false);
  const draftLoaded = useRef(false);

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<EntitySummary[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [suggestionTriggerIndex, setSuggestionTriggerIndex] = useState(-1);
  const [suggestionStyle, setSuggestionStyle] = useState<React.CSSProperties>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // Guards against out-of-order responses while the user is typing
  const searchRequestId = useRef(0);

  const fetchNextSessionNum = async (keepTitle?: string) => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      if (data.nextSessionNum) {
        setNextSessionNum(data.nextSessionNum);
        const padded = String(data.nextSessionNum).padStart(2, '0');
        setSessionTitle(keepTitle || `Session ${padded} — Untitled`);
      }
    } catch (e: unknown) {
      console.error('Failed to load next session number', e);
    }
  };

  const mode = dmMode ? 'dm' : 'player';

  const fetchAllEntities = async (forMode: 'dm' | 'player' = mode) => {
    try {
      const res = await fetch(`/api/search?mode=${forMode}`);
      const data = await res.json();
      if (data.entities) {
        setAllEntities(data.entities);
        const visible = new Set(data.entities.map((e: EntitySummary) => e.relativePath));
        // Leaving DM view must not keep a now-hidden page on screen, or one step "Back"
        setSelectedEntity(prev => (prev && !visible.has(prev.relativePath) ? null : prev));
        setHistory(prev => prev.filter(p => visible.has(p)));
      }
    } catch (e: unknown) {
      console.error('Failed to fetch entities', e);
    }
  };

  const fetchResults = async () => {
    const requestId = ++searchRequestId.current;
    const params = new URLSearchParams({ q: searchQuery, mode });
    if (selectedType !== 'all') params.set('type', selectedType);
    if (selectedCanon !== 'all') params.set('canon', selectedCanon);
    if (selectedStatus !== 'all') params.set('status', selectedStatus);
    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (data.entities && requestId === searchRequestId.current) {
        setResults(data.entities);
      }
    } catch (e: unknown) {
      console.error('Failed to search entities', e);
    }
  };

  // Keep the draft in this browser while notes are unsaved
  useEffect(() => {
    if (!draftLoaded.current) return;
    try {
      if (sessionNotes.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: sessionTitle, notes: sessionNotes }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Storage can be unavailable (private window, blocked site data)
    }
  }, [sessionTitle, sessionNotes]);

  // Restore any draft, then load next session number and the page list on mount
  useEffect(() => {
    const init = async () => {
      let draft: { title?: string; notes?: string } | null = null;
      try {
        draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      } catch {
        draft = null;
      }
      if (draft?.notes) setSessionNotes(draft.notes);
      draftLoaded.current = true;
      await fetchNextSessionNum(draft?.notes ? draft.title : undefined);
      await fetchAllEntities();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching secrets mode changes which pages exist for links and autocomplete
  const handleSetDmMode = (nextDmMode: boolean) => {
    if (nextDmMode === dmMode) return;
    setDmMode(nextDmMode);
    fetchAllEntities(nextDmMode ? 'dm' : 'player');
  };

  // Re-run the search shortly after the query or a filter changes
  useEffect(() => {
    const timer = setTimeout(fetchResults, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedType, selectedCanon, selectedStatus, dmMode]);

  const hasActiveFilters = searchQuery !== '' || selectedType !== 'all' || selectedCanon !== 'all' || selectedStatus !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedCanon('all');
    setSelectedStatus('all');
  };

  const loadEntity = async (relativePath: string) => {
    try {
      const res = await fetch(`/api/entity?path=${encodeURIComponent(relativePath)}`);
      const data = await res.json();
      if (!data.error) {
        setSelectedEntity(data);
        setActivePanel('sheet');
        return true;
      }
    } catch (e: unknown) {
      console.error('Failed to load entity details', e);
    }
    return false;
  };

  // Picking from the list starts a fresh trail
  const handleSelectEntity = async (relativePath: string) => {
    if (await loadEntity(relativePath)) setHistory([]);
  };

  const handleOpenLink = async (relativePath: string) => {
    const from = selectedEntity?.relativePath;
    if (from === relativePath) return;
    if ((await loadEntity(relativePath)) && from) setHistory(prev => [...prev, from]);
  };

  const handleBack = async () => {
    const previous = history[history.length - 1];
    if (previous && (await loadEntity(previous))) setHistory(prev => prev.slice(0, -1));
  };

  // Match a [[target]] to a visible page by file name ("elder-maren") or title ("Elder Maren")
  const resolveWikiLink = (target: string) => {
    const clean = target.split('#')[0].trim().toLowerCase();
    const slug = clean.replace(/\s+/g, '-');
    return allEntities.find(e => fileBaseName(e.relativePath) === slug || e.title.toLowerCase() === clean)?.relativePath;
  };

  const handleSaveSession = async () => {
    if (!sessionNotes.trim()) {
      setSaveStatus({ type: 'error', message: 'Session notes cannot be empty!' });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sessionTitle,
          content: sessionNotes
        })
      });
      const data = await res.json();

      if (data.success) {
        setSaveStatus({ type: 'success', message: `Saved successfully as ${data.fileName}!` });
        setSessionNotes('');
        fetchNextSessionNum();
        // Refresh entities search to make sure any new structural items are visible
        fetchAllEntities();
        fetchResults();
        setTimeout(() => setSaveStatus({ type: null, message: '' }), 5000);
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save session' });
      }
    } catch (e: unknown) {
      setSaveStatus({ type: 'error', message: (e as Error).message || 'Server error saving session' });
    } finally {
      setIsSaving(false);
    }
  };

  // Ctrl/Cmd+S anywhere in the note taker saves the recap
  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!isSaving) handleSaveSession();
    }
  };

  // Open the suggestion list just below the caret, or above it near the bottom edge
  const positionSuggestions = (textarea: HTMLTextAreaElement, caretIndex: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const caret = getCaretCoordinates(textarea, caretIndex);
    const caretTop = textarea.offsetTop + caret.top - textarea.scrollTop;
    const left = Math.max(8, Math.min(textarea.offsetLeft + caret.left, editor.clientWidth - 236));
    const listHeight = 200;
    if (caretTop + caret.lineHeight + listHeight > textarea.offsetTop + textarea.clientHeight) {
      setSuggestionStyle({ left, bottom: editor.clientHeight - caretTop + 4 });
    } else {
      setSuggestionStyle({ left, top: caretTop + caret.lineHeight + 4 });
    }
  };

  // Textarea key listener for autocomplete triggers
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setSessionNotes(val);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, selectionStart);

    // Look for last occurrences of "[[" to see if cursor is typing a link
    const lastTrigger = textBeforeCursor.lastIndexOf('[[');
    const lastClosing = textBeforeCursor.lastIndexOf(']]');

    if (lastTrigger !== -1 && lastTrigger > lastClosing && !textBeforeCursor.slice(lastTrigger).includes('\n')) {
      const searchStr = textBeforeCursor.slice(lastTrigger + 2).toLowerCase();
      setSuggestionTriggerIndex(lastTrigger);

      // Titles that start with what was typed come first
      const filtered = allEntities
        .filter(ent => ent.title.toLowerCase().includes(searchStr) || ent.relativePath.toLowerCase().includes(searchStr))
        .sort((a, b) => Number(b.title.toLowerCase().startsWith(searchStr)) - Number(a.title.toLowerCase().startsWith(searchStr)));

      if (filtered.length > 0) {
        setSuggestions(filtered.slice(0, 8));
        setShowSuggestions(true);
        setActiveSuggestionIndex(0);
        positionSuggestions(e.target, lastTrigger);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSuggestion(suggestions[activeSuggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  const insertSuggestion = (entity: EntitySummary) => {
    const val = sessionNotes;
    const cursorPosition = textareaRef.current?.selectionStart || 0;

    // Extract base filename (without path or extension) to link cleanly
    const baseName = fileBaseName(entity.relativePath) || entity.title;

    const before = val.slice(0, suggestionTriggerIndex);
    const after = val.slice(cursorPosition);
    const insertedLink = `[[${baseName}]]`;

    const newText = before + insertedLink + after;
    setSessionNotes(newText);
    setShowSuggestions(false);

    // Set cursor focus back and position it after the inserted link
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = suggestionTriggerIndex + insertedLink.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const typeOptions = distinctValues(allEntities, 'type');
  const canonOptions = distinctValues(allEntities, 'canon_status');
  const statusOptions = distinctValues(allEntities, 'status');
  const wordCount = sessionNotes.trim() ? sessionNotes.trim().split(/\s+/).length : 0;
  const panelClass = (id: PanelId) => `panel glass${activePanel === id ? ' panel-active' : ''}`;
  const linkProps = { resolveLink: resolveWikiLink, onOpenLink: handleOpenLink };

  return (
    <div className="dashboard-grid">
      {/* Shown only on narrow screens, where one panel fits at a time */}
      <nav className="mobile-tabs glass" aria-label="Panels">
        {([['wiki', '📖 Wiki'], ['sheet', '🛡️ Sheet'], ['notes', '✍️ Notes']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activePanel === id ? undefined : 'secondary'}
            aria-pressed={activePanel === id}
            onClick={() => setActivePanel(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* COLUMN 1: WIKI BROWSER */}
      <section className={panelClass('wiki')} aria-label="Campaign wiki">
        <div className="panel-header">
          <h2 style={{ fontSize: '18px', color: 'var(--accent-gold)' }}>📖 Campaign Wiki</h2>
        </div>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="search"
              placeholder="Search lore, characters, cities..."
              aria-label="Search the wiki"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              aria-label="Filter by type"
              style={{ fontSize: '12px', padding: '6px' }}
            >
              <option value="all">All Types</option>
              {typeOptions.map(type => (
                <option key={type} value={type}>{TYPE_LABELS[type] ?? type}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={selectedCanon}
                onChange={(e) => setSelectedCanon(e.target.value)}
                aria-label="Filter by canon status"
                style={{ fontSize: '12px', padding: '6px' }}
                title="prepared = designed, still malleable · established = confirmed in play"
              >
                <option value="all">Any Canon</option>
                {canonOptions.map(canon => (
                  <option key={canon} value={canon}>{canon}</option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                aria-label="Filter by status"
                style={{ fontSize: '12px', padding: '6px' }}
              >
                <option value="all">Any Status</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="result-meta">
              <span aria-live="polite">{results.length} {results.length === 1 ? 'page' : 'pages'}</span>
              {hasActiveFilters && (
                <button type="button" className="link-button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {results.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
                {hasActiveFilters ? 'No pages match these filters.' : 'The wiki is empty so far.'}
              </div>
            ) : (
              results.map((entity) => {
                const { type, status, canon_status: canon } = entity.frontmatter;
                return (
                  <button
                    key={entity.relativePath}
                    type="button"
                    onClick={() => handleSelectEntity(entity.relativePath)}
                    className={`result-item${selectedEntity?.relativePath === entity.relativePath ? ' selected' : ''}`}
                    style={{ borderLeft: `4px solid ${getTypeColor(type)}` }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{entity.title}</span>
                      <span className="badge" style={{ background: getTypeColor(type), color: '#fff' }}>
                        {type || 'unknown'}
                      </span>
                    </span>
                    {(status || canon) && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                        {status && <span style={{ color: getStatusColor(status) }}>{status}</span>}
                        {status && canon && <span aria-hidden="true">·</span>}
                        {canon && <span style={{ color: getCanonColor(canon) }}>{canon}</span>}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* COLUMN 2: ENTITY VIEWER */}
      <section className={panelClass('sheet')} aria-label="Entity sheet">
        <div className="panel-header" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '18px', color: '#c084fc' }}>🛡️ Entity Sheet</h2>
          <div role="group" aria-label="Secrets mode" style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              aria-pressed={dmMode}
              className={dmMode ? undefined : 'secondary'}
              onClick={() => handleSetDmMode(true)}
              style={{ fontSize: '12px', padding: '5px 10px' }}
              title="Show everything, DM secrets included"
            >
              👁️ DM View
            </button>
            <button
              type="button"
              aria-pressed={!dmMode}
              className={dmMode ? 'secondary' : undefined}
              onClick={() => handleSetDmMode(false)}
              style={{ fontSize: '12px', padding: '5px 10px', ...(dmMode ? {} : { background: 'var(--accent-teal)' }) }}
              title="Hide secrets: safe to share the screen with players"
            >
              🕶️ Player Safe
            </button>
          </div>
        </div>
        {!dmMode && <div className="mode-banner">Player Safe · DM secrets are hidden</div>}
        <div className="panel-content" style={{ padding: '24px' }}>
          {selectedEntity ? (
            <article key={selectedEntity.relativePath} className="animate-fade-in">
              {history.length > 0 && (
                <button type="button" className="secondary" onClick={handleBack} style={{ fontSize: '12px', padding: '4px 10px', marginBottom: '16px' }}>
                  ← Back
                </button>
              )}

              {/* Header Info */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                {selectedEntity.frontmatter.type && (
                  <span className="badge" style={{ background: getTypeColor(selectedEntity.frontmatter.type), color: '#fff' }}>
                    {selectedEntity.frontmatter.type}
                  </span>
                )}
                {selectedEntity.frontmatter.status && (
                  <span className="badge badge-outline" style={{ color: getStatusColor(selectedEntity.frontmatter.status) }}>
                    {selectedEntity.frontmatter.status}
                  </span>
                )}
                {selectedEntity.frontmatter.canon_status && (
                  <span
                    className="badge badge-outline"
                    style={{ color: getCanonColor(selectedEntity.frontmatter.canon_status) }}
                    title={selectedEntity.frontmatter.canon_status === 'established' ? 'Confirmed in play: fixed' : 'Designed but not played yet: still malleable'}
                  >
                    {selectedEntity.frontmatter.canon_status}
                  </span>
                )}
                {dmMode && selectedEntity.frontmatter.pg_known === false && (
                  <span className="badge badge-outline" style={{ color: '#f472b6' }} title="pg_known: false">
                    Unknown to PCs
                  </span>
                )}
              </div>

              {/* Entity Title */}
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, lineHeight: 1.15, marginBottom: '10px', color: 'var(--text-primary)' }}>
                {selectedEntity.title}
              </h1>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {selectedEntity.frontmatter.location && (
                  <span>Location: <WikiInline text={String(selectedEntity.frontmatter.location)} {...linkProps} /></span>
                )}
                {selectedEntity.frontmatter.faction && (
                  <span>Faction: <WikiInline text={String(selectedEntity.frontmatter.faction)} {...linkProps} /></span>
                )}
                {selectedEntity.frontmatter.first_seen && <span>First seen: {selectedEntity.frontmatter.first_seen}</span>}
                {selectedEntity.frontmatter.last_updated && <span>Updated: {selectedEntity.frontmatter.last_updated}</span>}
              </div>

              {Array.isArray(selectedEntity.frontmatter.tags) && selectedEntity.frontmatter.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {selectedEntity.frontmatter.tags.map(tag => (
                    <span key={tag} className="tag-chip">#{tag}</span>
                  ))}
                </div>
              )}

              {/* Entity Body content */}
              <WikiMarkdown body={selectedEntity.body} title={selectedEntity.title} dmMode={dmMode} {...linkProps} />
            </article>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', gap: '8px' }}>
              <span style={{ fontSize: '48px' }} aria-hidden="true">⚔️</span>
              <h3>No Entity Selected</h3>
              <p style={{ fontSize: '13px' }}>Pick a page from the wiki list<br />or search for a name to begin.</p>
            </div>
          )}
        </div>
      </section>

      {/* COLUMN 3: LIVE NOTE TAKER */}
      <section className={panelClass('notes')} aria-label="Session note taker" onKeyDown={handleNotesKeyDown}>
        <div className="panel-header">
          <h2 style={{ fontSize: '18px', color: '#f87171' }}>✍️ Session Note Taker</h2>
          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', fontSize: '11px' }}>
            Next: Session {String(nextSessionNum).padStart(2, '0')}
          </span>
        </div>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="session-title" className="field-label">Session Title</label>
            <input
              id="session-title"
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder={`Session ${String(nextSessionNum).padStart(2, '0')} — e.g. Battle of the Crypt`}
            />
          </div>

          <div ref={editorRef} style={{ flex: 1, minHeight: '220px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <label htmlFor="session-notes" className="field-label">Raw Recap Notes (Markdown)</label>

            <textarea
              id="session-notes"
              ref={textareaRef}
              value={sessionNotes}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              onBlur={() => setShowSuggestions(false)}
              onScroll={() => setShowSuggestions(false)}
              placeholder="Use [[NPC Name]] or [[Location]] to link entities as you write. Autocomplete will pop up as you type '[['."
              aria-autocomplete="list"
              aria-controls="wikilink-suggestions"
              style={{
                flex: 1,
                resize: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                lineHeight: '1.6',
                padding: '12px'
              }}
            />

            {/* Autocomplete suggestions, anchored at the caret */}
            {showSuggestions && suggestions.length > 0 && (
              <div id="wikilink-suggestions" role="listbox" className="suggestions" style={suggestionStyle}>
                {suggestions.map((entity, idx) => (
                  <div
                    key={entity.relativePath}
                    role="option"
                    aria-selected={idx === activeSuggestionIndex}
                    className={`suggestion${idx === activeSuggestionIndex ? ' active' : ''}`}
                    // mousedown, not click: the textarea must keep focus
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertSuggestion(entity);
                    }}
                    onMouseEnter={() => setActiveSuggestionIndex(idx)}
                  >
                    <span style={{ fontWeight: 500 }}>{entity.title}</span>
                    <span style={{ fontSize: '9px', color: getTypeColor(entity.frontmatter.type), alignSelf: 'center', textTransform: 'uppercase', fontWeight: 700 }}>
                      {entity.frontmatter.type}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}{wordCount > 0 && ' · draft kept in this browser'}</span>
              <span><kbd>[[</kbd> link · <kbd>Ctrl</kbd>+<kbd>S</kbd> save</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={handleSaveSession}
              disabled={isSaving || !sessionNotes.trim()}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                color: '#fff',
                fontWeight: 'bold',
                padding: '12px',
                ...(isSaving || !sessionNotes.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {})
              }}
            >
              {isSaving ? 'Saving…' : '💾 Save Session Recap'}
            </button>

            {saveStatus.type && (
              <div
                className="animate-fade-in"
                role="status"
                style={{
                  fontSize: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: saveStatus.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${saveStatus.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
                  color: saveStatus.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  textAlign: 'center'
                }}
              >
                {saveStatus.message}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
