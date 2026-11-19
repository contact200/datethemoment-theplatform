import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, CheckCircle2, Copy, RefreshCw,
  Search, Sparkles
} from 'lucide-react'

type Status = 'draft' | 'approved'
type Filter = 'all' | Status | 'missing'

type StudioEvent = {
  id: string
  team: string
  opponent: string
  event_date: string
  venue: string
  start_time: string | null
  status: 'review' | 'confirmed'
}

type StudioCaption = {
  id: string
  event_id: string
  content: string
  status: Status
}

type Props = {
  events: StudioEvent[]
  captions: StudioCaption[]
  onRefresh: () => Promise<void>
  onGenerate: (eventId: string) => Promise<void>
  onSave: (
    captionId: string,
    content: string,
    status: Status
  ) => Promise<boolean>
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export default function CaptionStudio({
  events, captions, onRefresh, onGenerate, onSave
}: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [working, setWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const rows = useMemo(() => {
    const byEvent = new Map(captions.map(c => [c.event_id, c]))
    return [...events]
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .map(event => ({ event, caption: byEvent.get(event.id) }))
  }, [events, captions])

  const counts = {
    all: rows.length,
    draft: rows.filter(row => row.caption?.status === 'draft').length,
    approved: rows.filter(row => row.caption?.status === 'approved').length,
    missing: rows.filter(row => !row.caption).length
  }

  const visible = rows.filter(({ event, caption }) => {
    const status = caption?.status ?? 'missing'
    if (filter !== 'all' && status !== filter) return false

    const query = search.trim().toLowerCase()
    if (!query) return true

    return [
      event.team, event.opponent, event.event_date,
      caption?.content ?? ''
    ].some(value => value.toLowerCase().includes(query))
  })

  const selected = visible.find(row => row.event.id === selectedId)
    ?? visible[0]
  const caption = selected?.caption

  useEffect(() => {
    setText(caption?.content ?? '')
    setCopied(false)
    setCopyError('')
  }, [selected?.event.id, caption?.id, caption?.content])

  const dirty = Boolean(caption && text !== caption.content)

  function selectEvent(id: string) {
    if (dirty && !window.confirm('Discard unsaved caption changes?')) {
      return
    }
    setSelectedId(id)
  }

  async function save(status: Status) {
    if (!caption || !text.trim() || working) return

    setWorking(true)
    try {
      await onSave(caption.id, text, status)
    } finally {
      setWorking(false)
    }
  }

  async function createStarter() {
    if (!selected || working) return

    setWorking(true)
    try {
      await onGenerate(selected.event.id)
    } finally {
      setWorking(false)
    }
  }

  async function copyCaption() {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyError('')
    } catch {
      setCopyError('Copy failed. Select and copy the caption manually.')
    }
  }

  const tabs: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Drafts' },
    { value: 'approved', label: 'Approved' },
    { value: 'missing', label: 'Missing' }
  ]

  return (
    <>
      <div className="pl-title">
        <div>
          <span className="pl-kicker">CONTENT STUDIO</span>
          <h1>Moments into<br/><em>messages.</em></h1>
          <p>Review, edit, and approve your club's captions.</p>
        </div>
      </div>

      <section className="pl-panel pl-cs-panel">
        <div className="pl-cs-toolbar">
          <div className="pl-cs-search">
            <Search size={17}/>
            <input
              aria-label="Search captions"
              value={search}
              placeholder="Search teams, opponents, captions..."
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <button className="pl-outline pl-cs-refresh"
            onClick={() => void onRefresh()}>
            <RefreshCw size={16}/> Refresh
          </button>
        </div>

        <div className="pl-cs-tabs">
          {tabs.map(tab => (
            <button
              type="button"
              key={tab.value}
              className={filter === tab.value ? 'active' : ''}
              onClick={() => setFilter(tab.value)}
            >
              {tab.label}
              <span>{counts[tab.value]}</span>
            </button>
          ))}
        </div>

        <div className="pl-cs-layout">
          <div className="pl-cs-list">
            {visible.map(({ event, caption: item }) => (
              <button
                key={event.id}
                type="button"
                className={`pl-cs-event ${selected?.event.id === event.id ? 'active' : ''}`}
                onClick={() => selectEvent(event.id)}
              >
                <div className="pl-cs-event-main">
                  <strong>{event.team}</strong>
                  <span>{formatDate(event.event_date)}</span>
                </div>
                <small>
                  {event.opponent ? `vs ${event.opponent}` : 'Club event'}
                </small>
                <span className={`pl-cs-status pl-cs-status--${item?.status ?? 'missing'}`}>
                  {item?.status === 'approved'
                    ? <CheckCircle2 size={13}/>
                    : null}
                  {item?.status ?? 'missing'}
                </span>
              </button>
            ))}

            {!visible.length && (
              <div className="pl-cs-empty">
                No games match your search or filter.
              </div>
            )}
          </div>

          <div className="pl-cs-editor">
            {selected ? (
              <>
                <div className="pl-cs-editor-heading">
                  <div>
                    <span className="pl-kicker">SELECTED GAME</span>
                    <h2>{selected.event.team}</h2>
                    <p>
                      {selected.event.opponent
                        ? `vs ${selected.event.opponent} · `
                        : ''}
                      {formatDate(selected.event.event_date)}
                    </p>
                  </div>
                  <span className={`pl-cs-status pl-cs-status--${caption?.status ?? 'missing'}`}>
                    {caption?.status ?? 'missing'}
                  </span>
                </div>

                {caption ? (
                  <>
                    <textarea
                      className="pl-cs-textarea"
                      aria-label="Edit caption"
                      rows={11}
                      value={text}
                      onChange={event => {
                        setText(event.target.value)
                        setCopied(false)
                      }}
                    />
                    <div className="pl-cs-details">
                      <span>{text.length} characters</span>
                      {dirty && <span>Unsaved changes</span>}
                    </div>
                    <div className="pl-cs-buttons">
                      <button className="pl-primary"
                        disabled={working || !text.trim()}
                        onClick={() => void save('draft')}>
                        Save draft
                      </button>
                      <button className="pl-outline"
                        disabled={working || !text.trim()}
                        onClick={() => void save('approved')}>
                        <CheckCircle2 size={16}/>
                        {caption.status === 'approved' && !dirty
                          ? 'Approved'
                          : 'Approve'}
                      </button>
                      <button className="pl-outline"
                        onClick={() => void copyCaption()}>
                        <Copy size={16}/>
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {copyError && <p className="pl-cs-copy-error">{copyError}</p>}
                  </>
                ) : (
                  <div className="pl-cs-missing">
                    <Sparkles size={29}/>
                    <h3>No caption yet</h3>
                    <p>
                      AI captions are created by your automation.
                      You can also start with a basic draft.
                    </p>
                    <button className="pl-outline"
                      disabled={working}
                      onClick={() => void createStarter()}>
                      Create basic draft <ArrowRight size={15}/>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="pl-cs-missing">
                <p>Select a game to review its caption.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
