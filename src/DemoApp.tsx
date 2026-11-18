import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, CSSProperties, ChangeEvent } from 'react'
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, CalendarDays, Camera,
  Check, CheckCircle2, ChevronRight, CircleHelp, Clock3, Copy, FileText,
  FolderPlus, Image, LayoutDashboard, Menu, Palette, Plus, Rocket, Settings,
  ShieldCheck, Sparkles, Trash2, UploadCloud, WandSparkles, X,
} from 'lucide-react'
import './App.css'
import { pdfToText, parseScheduleText } from './lib/pdf'

type View = 'overview' | 'schedule' | 'studio' | 'branding' | 'settings'
type Sport = 'Soccer' | 'Basketball' | 'Volleyball' | 'Other'
type Club = { id: string; name: string; sport: Sport; color: string; tagline: string }
type ClubEvent = { id: string; kind: 'Match' | 'Training'; team: string; opponent: string; venue: string; date: string; time: string }
type Caption = { eventId: string; text: string }

const STORE = 'dtm-platform-demo-v1'
const starter = { club: null as Club | null, events: [] as ClubEvent[], captions: [] as Caption[] }
type DemoState = typeof starter

function readSaved(): DemoState {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (data && Array.isArray(data.events) && Array.isArray(data.captions)) return data
  } catch { /* keep demo usable if saved state is invalid */ }
  return starter
}

const nav = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { key: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { key: 'studio', label: 'Content Studio', Icon: WandSparkles },
  { key: 'branding', label: 'Brand Kit', Icon: Palette },
  { key: 'settings', label: 'Settings', Icon: Settings },
] as const

const formatDate = (value: string) => {
  if (!value) return 'Date to be confirmed'
  const dt = new Date(`${value}T12:00:00`)
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function draftCaption(e: ClubEvent, club: Club) {
  if (e.kind === 'Training') {
    return `Built through repetition. ⚽\n\n${e.team} is putting in the work, session by session. Progress starts on the training ground.\n\n${club.name} — ${club.tagline}`
  }
  const opponent = e.opponent.trim() || 'our next opponent'
  return `MATCHDAY ⚽\n\n${e.team} vs. ${opponent}\n📅 ${formatDate(e.date)}${e.time ? ` · ${e.time}` : ''}${e.venue ? `\n📍 ${e.venue}` : ''}\n\nPreparation becomes opportunity. Ready for the next challenge.\n\n${club.name} — ${club.tagline}`
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, step: number) {
  const words = text.split(' ')
  let line = ''
  let cursor = y
  for (const word of words) {
    const next = `${line}${line ? ' ' : ''}${word}`
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursor)
      line = word
      cursor += step
    } else line = next
  }
  if (line) ctx.fillText(line, x, cursor)
  return cursor
}

function exportGraphic(club: Club, event: ClubEvent) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  ctx.fillStyle = '#101b20'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = club.color
  ctx.fillRect(0, 0, 16, h)
  ctx.fillRect(76, 82, 92, 8)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 36px Arial'
  ctx.fillText(club.name.toUpperCase(), 76, 178)
  ctx.fillStyle = '#9caeb2'
  ctx.font = '28px Arial'
  ctx.fillText(club.tagline || 'THE NEXT MOMENT STARTS HERE', 76, 231)
  ctx.fillStyle = club.color
  ctx.font = 'bold 52px Arial'
  ctx.fillText(event.kind === 'Match' ? 'MATCHDAY' : 'TRAINING DAY', 76, 390)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 76px Arial'
  let y = drawWrapped(ctx, event.team.toUpperCase(), 76, 524, w - 150, 95)
  if (event.kind === 'Match') {
    ctx.fillStyle = '#9caeb2'
    ctx.font = 'bold 40px Arial'
    ctx.fillText('VS', 76, y + 99)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 76px Arial'
    y = drawWrapped(ctx, (event.opponent || 'TBD').toUpperCase(), 76, y + 211, w - 150, 95)
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 42px Arial'
  ctx.fillText(formatDate(event.date), 76, Math.max(975, y + 155))
  ctx.fillStyle = '#9caeb2'
  ctx.font = '32px Arial'
  ctx.fillText(`${event.time || 'Time TBD'}${event.venue ? `  •  ${event.venue}` : ''}`.slice(0, 54), 76, 1046)
  ctx.fillStyle = club.color
  ctx.fillRect(76, h - 141, w - 152, 2)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 27px Arial'
  ctx.fillText('CREATED WITH DATETHEMOMENT', 76, h - 86)
  const link = document.createElement('a')
  link.download = `${club.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${event.kind.toLowerCase()}-${event.date || 'graphic'}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function App() {
  const [data, setData] = useState<DemoState>(readSaved)
  const [view, setView] = useState<View>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pendingImports, setPendingImports] = useState<ClubEvent[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfMessage, setPdfMessage] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [orgName, setOrgName] = useState('')
  const [sport, setSport] = useState<Sport>('Soccer')
  const [newEvent, setNewEvent] = useState<Omit<ClubEvent, 'id'>>({ kind: 'Match', team: '', opponent: '', venue: '', date: '', time: '' })
  const club = data.club
  const events = useMemo(() => [...data.events].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)), [data.events])
  const upcoming = events.find(e => !e.date || e.date >= new Date().toLocaleDateString('en-CA')) || events[0]
  const ready = data.captions.length

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(data)) }, [data])
  const goto = (next: View) => { setView(next); setSidebarOpen(false) }

  function createOrg(ev: FormEvent) {
    ev.preventDefault()
    const name = orgName.trim()
    if (!name) return
    setData({ club: { id: `org_demo_${Date.now()}`, name, sport, color: '#c9f072', tagline: 'Every moment matters.' }, events: [], captions: [] })
    setView('overview')
  }
  function addEvent(ev: FormEvent) {
    ev.preventDefault()
    if (!newEvent.team.trim() || !newEvent.date) return
    const event: ClubEvent = { ...newEvent, id: `evt_${Date.now()}` }
    setData(prev => ({ ...prev, events: [...prev.events, event] }))
    setNewEvent({ kind: 'Match', team: '', opponent: '', venue: '', date: '', time: '' })
    setShowEventForm(false)
    goto('schedule')
  }
  async function importPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPdfBusy(true)
    setPdfError('')
    setPdfMessage('')
    try {
      const text = await pdfToText(file)
      if (!text.trim()) throw new Error('This PDF has no selectable text. Scanned/image PDFs need OCR, which is not connected in Demo Mode.')
      const rows = parseScheduleText(text)
      if (!rows.length) {
        throw new Error('No supported dates were found. Try a text-based PDF with dates like 2026-12-05 or 12/05/2026, one event per line. You can also add events manually.')
      }
      const candidate = rows.map((row, i): ClubEvent => ({
        id: `import_${Date.now()}_${i}`,
        kind: row.kind === 'training' ? 'Training' : 'Match',
        team: row.team || club?.name || '',
        opponent: row.opponent,
        venue: row.venue,
        date: row.event_date,
        time: row.start_time,
      }))
      setPendingImports(candidate)
      setPdfMessage(`Found ${candidate.length} candidate event${candidate.length === 1 ? '' : 's'} in ${file.name}. Review everything before saving.`)
    } catch (err) {
      setPendingImports([])
      setPdfError(err instanceof Error ? err.message : 'Unable to read this PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  function updateImported(id: string, patch: Partial<ClubEvent>) {
    setPendingImports(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  function confirmImports() {
    if (!pendingImports.length) return
    const invalid = pendingImports.some(row => !row.date || !row.team.trim())
    if (invalid) {
      setPdfError('Every event needs a team name and date before saving.')
      return
    }
    let added = 0
    const keys = new Set(data.events.map(row => `${row.kind}|${row.date}|${row.time}|${row.team.toLowerCase()}|${row.opponent.toLowerCase()}`))
    const unique = pendingImports.filter(row => {
      const key = `${row.kind}|${row.date}|${row.time}|${row.team.toLowerCase()}|${row.opponent.toLowerCase()}`
      if (keys.has(key)) return false
      keys.add(key)
      added++
      return true
    })
    setData(prev => ({ ...prev, events: [...prev.events, ...unique] }))
    setPendingImports([])
    setPdfError('')
    setPdfMessage(`Saved ${added} event${added === 1 ? '' : 's'} to your demo calendar${pendingImports.length - added ? ` (${pendingImports.length - added} duplicate${pendingImports.length - added === 1 ? '' : 's'} skipped)` : ''}. Choose “Create post” for captions and graphics.`)
  }

  function generate(event: ClubEvent) {
    if (!club) return
    setData(prev => ({ ...prev, captions: [...prev.captions.filter(c => c.eventId !== event.id), { eventId: event.id, text: draftCaption(event, club) }] }))
    setEditing(event.id)
    goto('studio')
  }
  function changeCaption(id: string, text: string) {
    setData(prev => ({ ...prev, captions: prev.captions.map(c => c.eventId === id ? { ...c, text } : c) }))
  }
  function removeEvent(id: string) {
    setData(prev => ({ ...prev, events: prev.events.filter(e => e.id !== id), captions: prev.captions.filter(c => c.eventId !== id) }))
  }
  function copyCaption(text: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  if (!club) return (
    <div className="welcome-shell">
      <header className="welcome-header"><div className="brand-logo">D<span>.</span></div><strong>DateTheMoment</strong><span className="welcome-header-label">THE PLATFORM / DEMO</span></header>
      <main className="welcome-grid">
        <div className="welcome-copy">
          <span className="eyebrow"><span className="status-dot"/> YOUR CLUB'S CONTENT WORKSPACE</span>
          <h1>One home for<br/><em>every moment.</em></h1>
          <p>Turn schedules into calendars, events into captions, and your club's story into content that keeps moving.</p>
          <div className="welcome-features">
            <div><CalendarDays size={21}/><span>Everything on one calendar</span></div>
            <div><Sparkles size={21}/><span>Captions created around your events</span></div>
            <div><Image size={21}/><span>Branded graphics in seconds</span></div>
          </div>
          <div className="welcome-footnote"><ShieldCheck size={15}/> Local demo — no account or external connection required yet</div>
        </div>
        <div className="welcome-card">
          <div className="step-info"><span>01 / GET STARTED</span><span>NEW WORKSPACE</span></div>
          <div className="welcome-card-icon"><FolderPlus size={28}/></div>
          <h2>Build your club's workspace.</h2>
          <p>Start with the basics. You'll see your own dashboard instantly.</p>
          <form onSubmit={createOrg}>
            <label htmlFor="org-name">Organization name</label>
            <input id="org-name" required placeholder="e.g. Legion FC" maxLength={80} value={orgName} onChange={e => setOrgName(e.target.value)} />
            <label htmlFor="sport">Primary sport</label>
            <select id="sport" value={sport} onChange={e => setSport(e.target.value as Sport)}><option>Soccer</option><option>Basketball</option><option>Volleyball</option><option>Other</option></select>
            <button className="primary-action wide" type="submit">Create demo workspace <ArrowRight size={18}/></button>
          </form>
          <p className="subtle center">You'll be able to personalize everything afterward.</p>
        </div>
      </main>
      <div className="welcome-bottom">DATETHEMOMENT <span>YOU LIVE THE MOMENT. WE KEEP IT MOVING.</span></div>
    </div>
  )

  return (
    <div className="app-shell" style={{ '--club-accent': club.color } as CSSProperties}>
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-logo small">D<span>.</span></div><div><strong>DateTheMoment</strong><small>THE PLATFORM</small></div><button className="sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19}/></button></div>
        <div className="sidebar-org"><div className="org-mark">{club.name.slice(0, 2).toUpperCase()}</div><div className="org-summary"><strong>{club.name}</strong><span>{club.sport} organization</span></div><ChevronRight size={15}/></div>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav aria-label="Workspace navigation">{nav.map(({ key, label, Icon }) => <button key={key} className={`nav-link ${view === key ? 'active' : ''}`} onClick={() => goto(key)}><Icon size={19}/>{label}{view === key && <span className="nav-active-marker"/>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-help"><Rocket size={20}/><strong>You're exploring the demo.</strong><p>Every feature starts with your club's real content.</p><button onClick={() => goto('schedule')}>Add your first event <ArrowRight size={15}/></button></div><div className="sidebar-footer"><span className="status-dot"/> LOCAL DEMO MODE</div></div>
      </aside>
      {sidebarOpen && <button className="overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}/>}
      <div className="main-area">
        <header className="topbar"><button className="mobile-menu icon-btn" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={23}/></button><span className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{nav.find(n => n.key === view)?.label}</strong></span><div className="topbar-right"><span className="demo-pill"><span className="status-dot"/> Demo workspace</span><div className="avatar">{club.name.charAt(0).toUpperCase()}</div></div></header>
        <main className="main-content">
          {view === 'overview' && <>
            <div className="heading-row"><div><span className="eyebrow dark">YOUR COMMAND CENTER</span><h1>Make every moment <em>matter.</em></h1><p>Here's what's happening with {club.name}'s content.</p></div><button className="primary-action" onClick={() => { goto('schedule'); setShowEventForm(true) }}><Plus size={18}/> Add an event</button></div>
            <div className="stats-grid"><div className="stat-card"><div className="stat-icon"><CalendarDays size={20}/></div><strong>{events.length}</strong><span>Calendar events</span><small>Start with your club's schedule</small></div><div className="stat-card"><div className="stat-icon"><FileText size={20}/></div><strong>{ready}</strong><span>Caption drafts</span><small>Ready to review & personalize</small></div><div className="stat-card"><div className="stat-icon"><Camera size={20}/></div><strong>0</strong><span>Photos uploaded</span><small>Library connection coming next</small></div></div>
            <div className="two-column"><section className="panel"><div className="panel-heading"><div><h2>Get set up</h2><p>A simple path to your first piece of content.</p></div><span className="progress-chip">{events.length ? ready ? '2 OF 3' : '1 OF 3' : '0 OF 3'}</span></div><div className="setup-steps"><div className="setup-step done"><div className="step-num"><Check size={17}/></div><div><strong>Club workspace created</strong><span>Your organization is ready to customize.</span></div><BadgeCheck size={18} className="step-check"/></div><button className="setup-step" onClick={() => { goto('schedule'); setShowEventForm(true) }}><div className={`step-num ${events.length ? 'complete' : ''}`}>{events.length ? <Check size={17}/> : '2'}</div><div><strong>Add your first calendar event</strong><span>Enter a match or training session to start.</span></div><ChevronRight size={18}/></button><button className="setup-step" onClick={() => goto('studio')}><div className={`step-num ${ready ? 'complete' : ''}`}>{ready ? <Check size={17}/> : '3'}</div><div><strong>Create your first post</strong><span>Generate a caption and download a branded graphic.</span></div><ChevronRight size={18}/></button></div></section>
            <section className="panel next-panel"><div className="panel-heading"><div><h2>Next up</h2><p>Your schedule, at a glance.</p></div><Clock3 size={19}/></div>{upcoming ? <div className="next-event"><div className="event-type">{upcoming.kind.toUpperCase()}</div><h3>{upcoming.team}{upcoming.kind === 'Match' ? ` vs ${upcoming.opponent || 'TBD'}` : ''}</h3><p>{formatDate(upcoming.date)} {upcoming.time ? `· ${upcoming.time}` : ''}</p><button className="secondary-action" onClick={() => generate(upcoming)}><Sparkles size={17}/> Generate content <ArrowRight size={16}/></button></div> : <div className="empty-mini"><CalendarDays size={32}/><strong>Nothing on the calendar yet.</strong><span>Let's change that in a few clicks.</span><button className="text-link" onClick={() => { goto('schedule'); setShowEventForm(true) }}>Add an event <ArrowRight size={15}/></button></div>}</section></div>
            <div className="info-strip"><div><ShieldCheck size={19}/><span><strong>Building the real platform.</strong> This first screen stores demo data in this browser only. Account login, PDF automation, and Make.com provisioning come next.</span></div><CircleHelp size={19}/></div>
          </>}

          {view === 'schedule' && <>
            <div className="heading-row"><div><span className="eyebrow dark">CONTENT STARTS WITH A DATE</span><h1>Your schedule.</h1><p>Give every match and training session a place to live.</p></div><button className="primary-action" onClick={() => setShowEventForm(s => !s)}>{showEventForm ? <X size={18}/> : <Plus size={18}/>} {showEventForm ? 'Close form' : 'Add an event'}</button></div>
            <div className="pdf-import-card">
              <label className="pdf-pick">
                <UploadCloud size={25}/>
                <span><strong>{pdfBusy ? 'Reading your schedule…' : 'Upload a schedule PDF'}</strong><small>Extract dates into a reviewable calendar. Text-based PDFs up to 10 MB.</small></span>
                <span className="pdf-select">{pdfBusy ? 'Processing…' : 'Select PDF'}</span>
                <input aria-label="Upload a schedule PDF" type="file" accept=".pdf,application/pdf" disabled={pdfBusy} onChange={importPdf}/>
              </label>
              {pdfError && <p className="pdf-notice error" role="alert">{pdfError}</p>}
              {pdfMessage && <p className="pdf-notice" role="status">{pdfMessage}</p>}
              {pendingImports.length > 0 && <div className="pdf-review">
                <div className="pdf-review-header"><div><strong>Review imported events</strong><small>Check dates, times, teams and opponents. Nothing is published automatically.</small></div><span>{pendingImports.length} found</span></div>
                {pendingImports.map(row => <div className="pdf-review-row" key={row.id}>
                  <label>Type<select value={row.kind} onChange={e => updateImported(row.id, { kind: e.target.value as ClubEvent['kind'] })}><option>Match</option><option>Training</option></select></label>
                  <label>Team<input required aria-label="Team" value={row.team} onChange={e => updateImported(row.id, { team: e.target.value })}/></label>
                  <label>Opponent<input aria-label="Opponent" value={row.opponent} onChange={e => updateImported(row.id, { opponent: e.target.value })}/></label>
                  <label>Date<input required type="date" aria-label="Date" value={row.date} onChange={e => updateImported(row.id, { date: e.target.value })}/></label>
                  <label>Time<input type="time" aria-label="Time" value={row.time} onChange={e => updateImported(row.id, { time: e.target.value })}/></label>
                  <label>Location<input aria-label="Location" value={row.venue} onChange={e => updateImported(row.id, { venue: e.target.value })}/></label>
                  <button className="icon-btn" aria-label="Remove imported event" title="Remove event" onClick={() => setPendingImports(prev => prev.filter(r => r.id !== row.id))}><Trash2 size={17}/></button>
                </div>)}
                <div className="pdf-review-actions"><button className="secondary-action" onClick={() => { setPendingImports([]); setPdfMessage('') }}>Cancel import</button><button className="primary-action" onClick={confirmImports}><Check size={18}/> Confirm events</button></div>
              </div>}
            </div>
            {showEventForm && <form className="panel event-form" onSubmit={addEvent}><div className="panel-heading"><div><h2>New calendar event</h2><p>Add one real event to try the content workflow.</p></div></div><div className="form-grid"><div className="field"><label>Event type</label><select value={newEvent.kind} onChange={e => setNewEvent({ ...newEvent, kind: e.target.value as 'Match' | 'Training' })}><option>Match</option><option>Training</option></select></div><div className="field"><label>Team / age group</label><input required placeholder="e.g. U14 Boys" value={newEvent.team} onChange={e => setNewEvent({ ...newEvent, team: e.target.value })}/></div>{newEvent.kind === 'Match' && <div className="field"><label>Opponent</label><input placeholder="e.g. Galaxy SC" value={newEvent.opponent} onChange={e => setNewEvent({ ...newEvent, opponent: e.target.value })}/></div>}<div className="field"><label>Date</label><input required type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}/></div><div className="field"><label>Time</label><input type="time" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}/></div><div className="field"><label>Location</label><input placeholder="e.g. North Field" value={newEvent.venue} onChange={e => setNewEvent({ ...newEvent, venue: e.target.value })}/></div></div><button className="primary-action" type="submit"><Check size={18}/> Save event</button></form>}
            <section className="panel"><div className="panel-heading"><div><h2>Calendar events</h2><p>{events.length} total event{events.length === 1 ? '' : 's'}</p></div></div>{events.length ? <div className="event-list">{events.map(event => <div className="event-row" key={event.id}><div className="date-badge"><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', { day: '2-digit' })}</strong><span>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span></div><div className="event-desc"><small>{event.kind.toUpperCase()} · {event.time || 'TIME TBD'}</small><strong>{event.team}{event.kind === 'Match' ? ` vs ${event.opponent || 'TBD'}` : ''}</strong><span>{event.venue || 'Location to be confirmed'}</span></div><div className="event-controls"><button className="secondary-action compact" onClick={() => generate(event)}><Sparkles size={16}/> Create post</button><button className="icon-btn" title="Delete event" aria-label="Delete event" onClick={() => removeEvent(event.id)}><Trash2 size={18}/></button></div></div>)}</div> : <div className="empty-panel"><CalendarDays size={38}/><h3>Your calendar is ready for its first event.</h3><p>Start with an upcoming game or practice.</p><button className="secondary-action" onClick={() => setShowEventForm(true)}><Plus size={16}/> Add an event</button></div>}</section>
          </>}

          {view === 'studio' && <>
            <div className="heading-row"><div><span className="eyebrow dark">TURN EVENTS INTO STORIES</span><h1>Content studio.</h1><p>Caption drafts and branded graphics built around your calendar.</p></div></div>
            {events.length === 0 ? <section className="panel empty-panel"><Sparkles size={37}/><h3>Start with your schedule.</h3><p>Add an event and we'll turn it into a ready-to-edit caption and graphic.</p><button className="primary-action" onClick={() => { goto('schedule'); setShowEventForm(true) }}><Plus size={18}/> Add an event</button></section> : <div className="studio-layout"><div className="panel studio-list"><div className="panel-heading"><div><h2>Choose an event</h2><p>Generate a content draft for any date.</p></div></div>{events.map(event => <button key={event.id} className={`studio-item ${editing === event.id ? 'selected' : ''}`} onClick={() => { setEditing(event.id); if (!data.captions.some(c => c.eventId === event.id)) generate(event) }}><span className="studio-item-icon"><CalendarDays size={19}/></span><span><strong>{event.team}</strong><small>{formatDate(event.date)} · {event.kind}</small></span><ChevronRight size={17}/></button>)}</div><div className="studio-main">{editing && events.some(e => e.id === editing) ? (() => { const event = events.find(e => e.id === editing)!; const draft = data.captions.find(c => c.eventId === editing)?.text ?? draftCaption(event, club); return <><div className="panel caption-panel"><div className="panel-heading"><div><h2>Caption draft</h2><p>Edit it to match your club's voice.</p></div><span className="progress-chip"><Sparkles size={14}/> DRAFT</span></div><textarea aria-label="Caption draft" value={draft} onChange={e => { if (!data.captions.some(c => c.eventId === editing)) generate(event); changeCaption(editing, e.target.value) }} rows={12}/><div className="panel-actions"><button className="secondary-action" onClick={() => generate(event)}><Sparkles size={16}/> Regenerate</button><button className="primary-action" onClick={() => copyCaption(draft)}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied' : 'Copy caption'}</button></div></div><div className="panel graphic-panel"><div className="panel-heading"><div><h2>Branded graphic</h2><p>Ready to export in 1080 × 1350 PNG.</p></div></div><div className="graphic-preview" style={{ '--accent': club.color } as CSSProperties}><div className="graphic-brand">{club.name.toUpperCase()}</div><div className="graphic-inner"><div className="graphic-kicker">{event.kind === 'Match' ? 'MATCHDAY' : 'TRAINING DAY'}</div><h3>{event.team}{event.kind === 'Match' ? <><span>VS</span>{event.opponent || 'TBD'}</> : null}</h3><div className="graphic-meta">{formatDate(event.date)}<br/>{event.time || 'TIME TBD'} · {event.venue || 'LOCATION TBD'}</div></div><div className="graphic-credit">CREATED WITH DATETHEMOMENT</div></div><button className="primary-action wide" onClick={() => exportGraphic(club, event)}><ArrowDownToLine size={18}/> Download graphic PNG</button></div></> })() : <div className="panel empty-panel"><WandSparkles size={37}/><h3>Choose an event to create content.</h3><p>Pick one from the list to generate a caption and graphic.</p></div>}</div></div>}
          </>}

          {view === 'branding' && <><div className="heading-row"><div><span className="eyebrow dark">MAKE IT FEEL LIKE YOUR CLUB</span><h1>Brand kit.</h1><p>Keep every graphic recognizable and consistent.</p></div></div><section className="panel branding-panel"><div className="panel-heading"><div><h2>Club identity</h2><p>These preferences will be used in generated graphics.</p></div><Palette size={20}/></div><div className="field"><label>Organization name</label><input value={club.name} maxLength={80} onChange={e => setData(prev => ({ ...prev, club: prev.club ? { ...prev.club, name: e.target.value } : null }))}/></div><div className="field"><label>Club tagline</label><input value={club.tagline} maxLength={100} onChange={e => setData(prev => ({ ...prev, club: prev.club ? { ...prev.club, tagline: e.target.value } : null }))}/></div><div className="field"><label>Accent color</label><div className="swatches">{['#c9f072', '#80bcf6', '#efbe79', '#d7a9f5', '#f58b8b', '#4ccdb9'].map(color => <button key={color} className={`swatch ${club.color === color ? 'selected' : ''}`} style={{ background: color }} aria-label={`Choose ${color}`} onClick={() => setData(prev => ({ ...prev, club: prev.club ? { ...prev.club, color } : null }))}>{club.color === color && <Check size={16}/>}</button>)}<input type="color" aria-label="Custom brand color" value={club.color} onChange={e => setData(prev => ({ ...prev, club: prev.club ? { ...prev.club, color: e.target.value } : null }))}/></div></div><div className="info-strip"><div><CheckCircle2 size={19}/><span>Changes are saved in this browser and applied to your next graphic export.</span></div></div></section></>}
          {view === 'settings' && <><div className="heading-row"><div><span className="eyebrow dark">WORKSPACE SETTINGS</span><h1>Your organization.</h1><p>Manage the demonstration workspace.</p></div></div><div className="panel settings-panel"><div className="setting-line"><div><strong>Workspace ID</strong><span>{club.id}</span></div><span className="progress-chip">DEMO</span></div><div className="setting-line"><div><strong>Account & Google Sheets</strong><span>We'll connect secure user authentication and optional integrations next.</span></div><span className="soon-pill">COMING NEXT</span></div><div className="setting-line"><div><strong>Make.com provisioning</strong><span>Backend automation will create an organization folder and workflow instances once.</span></div><span className="soon-pill">COMING NEXT</span></div><button className="danger-button" onClick={() => { if (window.confirm('Delete this local demo workspace and start over?')) { setData(starter); setView('overview'); setEditing(null) } }}><Trash2 size={17}/> Reset local demo</button></div></>}
        </main>
        <footer className="app-footer"><span>© DateTheMoment · The Platform</span><span>Demo experience · No real accounts or publishing</span></footer>
      </div>
    </div>
  )
}

export default App
