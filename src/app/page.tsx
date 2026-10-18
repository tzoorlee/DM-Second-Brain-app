'use client';

import React, { useState, useEffect, useRef } from 'react';

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

const TYPE_LABELS: Record<string, string> = {
  npc: 'NPCs',
  pc: 'Player Characters',
  city: 'Cities',
  region: 'Regions',
  dungeon: 'Dungeons',
  faction: 'Factions',
  quest: 'Quests',
  item: 'Items',
  event: 'Events',
  secret: 'Secrets',
};

// Distinct, lowercased values of a frontmatter field across the wiki.
const distinctValues = (entities: EntitySummary[], field: 'type' | 'status' | 'canon_status') =>
  [...new Set(entities.map(e => e.frontmatter[field]?.toLowerCase()).filter((v): v is string => !!v))].sort();

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
  const [dmMode, setDmMode] = useState(true);
  
  // Note-taking state
  const [sessionTitle, setSessionTitle] = useState('');
  const [nextSessionNum, setNextSessionNum] = useState<number>(1);
  const [sessionNotes, setSessionNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  
  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<EntitySummary[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [suggestionTriggerIndex, setSuggestionTriggerIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Guards against out-of-order responses while the user is typing
  const searchRequestId = useRef(0);

  const fetchNextSessionNum = async () => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      if (data.nextSessionNum) {
        setNextSessionNum(data.nextSessionNum);
        const padded = String(data.nextSessionNum).padStart(2, '0');
        setSessionTitle(`Session ${padded} — Untitled`);
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
        // Leaving DM view must not keep a now-hidden page on screen
        setSelectedEntity(prev =>
          prev && !data.entities.some((e: EntitySummary) => e.relativePath === prev.relativePath) ? null : prev
        );
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

  // Load next session number and the page list on mount
  useEffect(() => {
    const init = async () => {
      await fetchNextSessionNum();
      await fetchAllEntities();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching secrets mode changes which pages exist for links and autocomplete
  const handleToggleDmMode = () => {
    const nextDmMode = !dmMode;
    setDmMode(nextDmMode);
    fetchAllEntities(nextDmMode ? 'dm' : 'player');
  };

  // Re-run the search shortly after the query or a filter changes
  useEffect(() => {
    const timer = setTimeout(fetchResults, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, selectedType, selectedCanon, selectedStatus, dmMode]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSelectEntity = async (relativePath: string) => {
    try {
      const res = await fetch(`/api/entity?path=${encodeURIComponent(relativePath)}`);
      const data = await res.json();
      if (!data.error) {
        setSelectedEntity(data);
      }
    } catch (e: unknown) {
      console.error('Failed to load entity details', e);
    }
  };

  // Convert raw title or filename target to actual entity filename
  const handleResolveWikiLink = async (target: string) => {
    // Clean target (e.g. "Silverbrook" or "silverbrook")
    const cleanTarget = target.toLowerCase().replace(/\s+/g, '-');
    
    // Find matching entity
    const match = allEntities.find(e => {
      const nameWithoutExt = e.relativePath.split('/').pop()?.replace('.md', '');
      return nameWithoutExt === cleanTarget || e.title.toLowerCase() === target.toLowerCase();
    });

    if (match) {
      handleSelectEntity(match.relativePath);
    } else {
      alert(`Could not find wiki page for: "${target}"`);
    }
  };

  const handleSaveSession = async () => {
    if (!sessionNotes.trim()) {
      setSaveStatus({ type: 'error', message: 'Session notes cannot be empty!' });
      return;
    }

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

    if (lastTrigger !== -1 && lastTrigger > lastClosing) {
      const searchStr = textBeforeCursor.slice(lastTrigger + 2).toLowerCase();
      setSuggestionTriggerIndex(lastTrigger);

      // Filter entities for autocomplete
      const filtered = allEntities.filter(ent => 
        ent.title.toLowerCase().includes(searchStr) || 
        ent.relativePath.toLowerCase().includes(searchStr)
      );

      if (filtered.length > 0) {
        setSuggestions(filtered.slice(0, 5));
        setShowSuggestions(true);
        setActiveSuggestionIndex(0);
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
    const baseName = entity.relativePath.split('/').pop()?.replace('.md', '') || entity.title;
    
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

  const getEntityBadgeColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'npc': return 'var(--accent-purple)';
      case 'pc': return 'var(--accent-teal)';
      case 'city': return 'var(--accent-gold)';
      case 'region': return '#84cc16';
      case 'dungeon': return '#ef4444';
      case 'faction': return '#3b82f6';
      case 'quest': return '#e11d48';
      case 'item': return '#f59e0b';
      case 'event': return '#06b6d4';
      case 'secret': return '#ec4899';
      default: return 'var(--text-muted)';
    }
  };

  // Helper function to render wiki link formatted spans
  const renderTextContent = (text: string) => {
    if (!text) return null;
    
    // Filter out DM-only secrets if not in DM mode
    let displayBody = text;
    if (!dmMode) {
      // Remove inline DM Secrets sections
      displayBody = displayBody.replace(/## Secrets \(DM only\)[\s\S]*$/i, '');
    }

    const lines = displayBody.split('\n');
    return lines.map((line, idx) => {
      // Title headers
      if (line.startsWith('# ')) {
        return <h1 key={idx} style={{ fontSize: '24px', margin: '16px 0 12px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>{renderInlineWikiLinks(line.substring(2))}</h1>;
      }
      if (line.startsWith('## ')) {
        const isSecretsHeader = line.toLowerCase().includes('secrets (dm only)');
        if (isSecretsHeader && !dmMode) return null;

        return (
          <h2 
            key={idx} 
            style={{ 
              fontSize: '18px', 
              margin: '24px 0 10px 0', 
              color: isSecretsHeader ? '#ec4899' : 'var(--text-primary)',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '4px' 
            }}
          >
            {renderInlineWikiLinks(line.substring(3))}
          </h2>
        );
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} style={{ fontSize: '15px', margin: '12px 0 6px 0' }}>{renderInlineWikiLinks(line.substring(4))}</h3>;
      }
      // Bullet list items
      if (line.startsWith('- ')) {
        return <li key={idx} style={{ marginLeft: '20px', marginBottom: '4px', listStyleType: 'square', color: 'var(--text-secondary)' }}>{renderInlineWikiLinks(line.substring(2))}</li>;
      }
      // Blockquotes
      if (line.startsWith('> ')) {
        return <blockquote key={idx} style={{ borderLeft: '3px solid var(--accent-purple)', paddingLeft: '12px', color: 'var(--text-muted)', margin: '8px 0', fontStyle: 'italic' }}>{renderInlineWikiLinks(line.substring(2))}</blockquote>;
      }
      // Simple paragraph with spacing
      return <p key={idx} style={{ margin: '6px 0', minHeight: '1.2em', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{renderInlineWikiLinks(line)}</p>;
    });
  };

  const renderInlineWikiLinks = (lineText: string) => {
    const parts = [];
    let lastIndex = 0;
    const regex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = regex.exec(lineText)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(lineText.substring(lastIndex, matchIndex));
      }

      const fullLink = match[1];
      const pipeIndex = fullLink.indexOf('|');
      const target = pipeIndex !== -1 ? fullLink.substring(0, pipeIndex) : fullLink;
      const label = pipeIndex !== -1 ? fullLink.substring(pipeIndex + 1) : fullLink;

      parts.push(
        <button
          key={matchIndex}
          onClick={() => handleResolveWikiLink(target)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--accent-purple)',
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            fontWeight: '600',
            display: 'inline'
          }}
          title={`Click to view ${target}`}
        >
          {label}
        </button>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < lineText.length) {
      parts.push(lineText.substring(lastIndex));
    }

    return parts.length > 0 ? parts : lineText;
  };

  return (
    <div className="dashboard-grid">
      {/* COLUMN 1: WIKI BROWSER */}
      <div className="panel glass">
        <div className="panel-header">
          <h2 style={{ fontSize: '18px', color: '#eab308' }}>📖 Campaign Wiki</h2>
        </div>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <input
              type="text"
              placeholder="Search lore, characters, cities..."
              value={searchQuery}
              onChange={handleSearchChange}
              style={{ marginBottom: '8px' }}
            />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={{ fontSize: '12px', padding: '6px' }}
            >
              <option value="all">All Types</option>
              {typeOptions.map(type => (
                <option key={type} value={type}>{TYPE_LABELS[type] ?? type}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <select
                value={selectedCanon}
                onChange={(e) => setSelectedCanon(e.target.value)}
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
                style={{ fontSize: '12px', padding: '6px' }}
              >
                <option value="all">Any Status</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {results.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
                No entities found.
              </div>
            ) : (
              results.map((entity) => (
                <div
                  key={entity.relativePath}
                  onClick={() => handleSelectEntity(entity.relativePath)}
                  className="glass-interactive"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: selectedEntity?.relativePath === entity.relativePath ? 'rgba(147, 51, 234, 0.15)' : 'rgba(255,255,255,0.02)',
                    borderLeft: `4px solid ${getEntityBadgeColor(entity.frontmatter.type)}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>{entity.title}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        background: getEntityBadgeColor(entity.frontmatter.type),
                        color: '#fff',
                        fontWeight: '700'
                      }}
                    >
                      {entity.frontmatter.type || 'unknown'}
                    </span>
                  </div>
                  {entity.frontmatter.status && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Status: <span style={{ color: entity.frontmatter.status === 'alive' || entity.frontmatter.status === 'active' ? 'var(--success)' : 'var(--danger)' }}>{entity.frontmatter.status}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* COLUMN 2: ENTITY VIEWER */}
      <div className="panel glass" style={{ minWidth: '400px' }}>
        <div className="panel-header">
          <h2 style={{ fontSize: '18px', color: '#a855f7' }}>🛡️ Entity Sheet</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Secrets Mode:</span>
            <button
              onClick={handleToggleDmMode}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                background: dmMode ? 'var(--accent-purple)' : 'rgba(255,255,255,0.05)',
                color: dmMode ? '#fff' : 'var(--text-secondary)',
                border: dmMode ? 'none' : '1px solid var(--border-color)',
                borderRadius: '6px'
              }}
            >
              {dmMode ? '👁️ DM View (On)' : '🕶️ Player Safe'}
            </button>
          </div>
        </div>
        <div className="panel-content animate-fade-in" style={{ padding: '24px' }}>
          {selectedEntity ? (
            <div>
              {/* Header Info */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {selectedEntity.frontmatter.type && (
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', background: getEntityBadgeColor(selectedEntity.frontmatter.type), padding: '2px 8px', borderRadius: '4px', color: '#fff' }}>
                    {selectedEntity.frontmatter.type}
                  </span>
                )}
                {selectedEntity.frontmatter.status && (
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', color: selectedEntity.frontmatter.status === 'alive' ? 'var(--success)' : 'var(--danger)' }}>
                    {selectedEntity.frontmatter.status}
                  </span>
                )}
                {selectedEntity.frontmatter.canon_status && (
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px', color: selectedEntity.frontmatter.canon_status === 'established' ? '#3b82f6' : '#eab308' }}>
                    {selectedEntity.frontmatter.canon_status}
                  </span>
                )}
                {selectedEntity.frontmatter.first_seen && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    First seen: {selectedEntity.frontmatter.first_seen}
                  </span>
                )}
              </div>

              {/* Entity Title */}
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-primary)' }}>
                {selectedEntity.title}
              </h1>

              {/* Entity Body content */}
              <div style={{ wordBreak: 'break-word' }}>
                {renderTextContent(selectedEntity.body)}
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', gap: '8px' }}>
              <span style={{ fontSize: '48px' }}>⚔️</span>
              <h3>No Entity Selected</h3>
              <p style={{ fontSize: '13px' }}>Click an entity in the browser sidebar<br />or search key terms to begin.</p>
            </div>
          )}
        </div>
      </div>

      {/* COLUMN 3: LIVE NOTE TAKER */}
      <div className="panel glass">
        <div className="panel-header">
          <h2 style={{ fontSize: '18px', color: '#ef4444' }}>✍️ Session Note Taker</h2>
          <span style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
            Next: Session {String(nextSessionNum).padStart(2, '0')}
          </span>
        </div>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Session Title
            </label>
            <input
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder={`Session ${String(nextSessionNum).padStart(2, '0')} — e.g. Battle of the Crypt`}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase' }}>
              Raw Recap Notes (Markdown)
            </label>
            
            <textarea
              ref={textareaRef}
              value={sessionNotes}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Use [[NPC Name]] or [[Location]] to link entities as you write. Autocomplete will pop up as you type '[['."
              style={{
                flex: 1,
                resize: 'none',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                padding: '12px'
              }}
            />

            {/* Float Autocomplete suggestions list */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '12px',
                  width: 'calc(100% - 24px)',
                  maxHeight: '180px',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--accent-purple)',
                  borderRadius: '6px',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 1000,
                  overflowY: 'auto'
                }}
              >
                {suggestions.map((entity, idx) => (
                  <div
                    key={entity.relativePath}
                    onClick={() => insertSuggestion(entity)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      background: idx === activeSuggestionIndex ? 'rgba(147, 51, 234, 0.2)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontWeight: '500' }}>{entity.title}</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', alignSelf: 'center', textTransform: 'uppercase' }}>
                      {entity.frontmatter.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleSaveSession}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                color: '#fff',
                fontWeight: 'bold',
                padding: '12px'
              }}
            >
              💾 Save Session Recap
            </button>

            {saveStatus.type && (
              <div
                className="animate-fade-in"
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
      </div>
    </div>
  );
}
