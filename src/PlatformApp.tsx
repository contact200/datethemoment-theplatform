import ThemeToggle from './ThemeToggle'
import PhotoCarouselBuilder from './PhotoCarouselBuilder'
import CaptionStudio from './CaptionStudio'
import ScheduleManager from './ScheduleManager'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, CalendarDays, Camera, CheckCircle2, ChevronDown, Download, FileText, FolderPlus, ImagePlus, LayoutDashboard, LogOut, Palette, Plus, RefreshCw, ShieldCheck, Sparkles, UploadCloud, WandSparkles } from 'lucide-react'
import { supabase } from './lib/supabase'
import TeamManagement from './TeamManagement'
import type { ImportedEvent } from './lib/pdf'
import { downloadGraphic } from './lib/graphics'
import './PlatformApp.css'

type Organization = { id: string; name: string; sport: string; color: string; tagline: string }
type ClubEvent = { id: string; organization_id: string; kind: 'match' | 'training'; team: string; opponent: string; venue: string; event_date: string; start_time: string | null; status: 'review' | 'confirmed' }
type Caption = { id: string; organization_id: string; event_id: string; content: string; status: 'draft' | 'approved' }
type Photo = { id: string; filename: string; storage_path: string; signedUrl?: string }
type Provision = { status: string; make_folder_id?: number | null; scenario_ids?: Record<string, number> }
type View = 'overview' | 'calendar' | 'studio' | 'graphics' | 'photos' | 'branding' | 'teams'
type PdfFlow = {
  organizationId: string
  filename: string
  scheduleId: string | null
  phase: 'uploading' | 'processing' | 'complete' | 'delayed' | 'failed'
  startedAt: number
  gameCount?: number
}

const client = supabase!
const defaultEvent: ImportedEvent = { kind: 'match', team: '', opponent: '', venue: '', event_date: '', start_time: '' }
const dateLabel = (s: string) => s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'

function captionDraft(e: ClubEvent, org: Organization) {
  if (e.kind === 'training') return `Development happens through the work. ⚽\n\n${e.team} — training and building habits together.\n\n${org.name} | ${org.tagline}`
  return `MATCHDAY ⚽\n\n${e.team}${e.opponent ? ` vs ${e.opponent}` : ''}\n📅 ${dateLabel(e.event_date)}${e.start_time ? ` at ${e.start_time.slice(0, 5)}` : ''}${e.venue ? `\n📍 ${e.venue}` : ''}\n\nSupporting the journey, one match at a time.\n\n${org.name} | ${org.tagline}`
}

const pdfLessons: {
  title: string
  detail: string
  page: View
  action: string
}[] = [
  {
    title: 'Your schedule becomes a calendar',
    detail: 'Imported games appear on their scheduled dates. Review them directly in the calendar.',
    page: 'calendar',
    action: 'Open Calendar'
  },
  {
    title: 'Register your club\'s teams',
    detail: 'Team names and aliases help DateTheMoment recognize the right squads in uploaded schedules.',
    page: 'teams',
    action: 'Open Teams'
  },
  {
    title: 'Review your AI captions',
    detail: 'Open Caption Studio to review and edit generated drafts before using them.',
    page: 'studio',
    action: 'Open Caption Studio'
  },
  {
    title: 'Make it your club',
    detail: 'Customize your club information and appearance in the Brand Kit.',
    page: 'branding',
    action: 'Open Brand Kit'
  }
]

export default function PlatformApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [org, setOrg] = useState<Organization | null>(null)
  const [newName, setNewName] = useState('')
  const [newSport, setNewSport] = useState('Soccer')
  const [provisionCode, setProvisionCode] = useState('')
  const [events, setEvents] = useState<ClubEvent[]>([])
  const [dtmMonthOffset, setDtmMonthOffset] = useState(0)
  const [captions, setCaptions] = useState<Caption[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [provision, setProvision] = useState<Provision | null>(null)
  const [view, setView] = useState<View>('overview')
  const [busy, setBusy] = useState(false)
  const [pdfFlow, setPdfFlow] = useState<PdfFlow | null>(() => {
    try {
      const saved = sessionStorage.getItem('dtm-pdf-progress')
      return saved ? JSON.parse(saved) as PdfFlow : null
    } catch {
      return null
    }
  })
  const [pdfCompact, setPdfCompact] = useState(true)
  const [pdfMinimized, setPdfMinimized] = useState(false)
  const [pdfTip, setPdfTip] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pendingEvents, setPendingEvents] = useState<ImportedEvent[]>([])
  const [extractedText, setExtractedText] = useState('')
  const [newEvent, setNewEvent] = useState<ImportedEvent>({ ...defaultEvent })
  const [showEvent, setShowEvent] = useState(false)
  const [graphicEventId, setGraphicEventId] = useState('')

  const notify = (message: string) => { setError(''); setNotice(message) }
  const fail = (message: string) => { setNotice(''); setError(message) }

  useEffect(() => {
    let alive = true
    client.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setAuthLoaded(true) } })
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => { if (alive) { setSession(next); setAuthLoaded(true) } })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const refreshOrgs = useCallback(async (preferred?: string) => {
    const { data, error: queryError } = await client.from('organizations').select('id,name,sport,color,tagline').order('created_at')
    if (queryError) { fail(queryError.message); return }
    const choices = (data || []) as Organization[]
    setOrgs(choices)
    setOrg(current => choices.find(o => o.id === preferred) || choices.find(o => o.id === current?.id) || choices[0] || null)
  }, [])

  useEffect(() => {
    if (session?.user) void refreshOrgs()
    else { setOrg(null); setOrgs([]); setEvents([]); setCaptions([]); setPhotos([]) }
  }, [session?.user?.id, refreshOrgs])

  const refreshWorkspace = useCallback(async (current: Organization) => {
    const [eventResult, captionResult, photoResult, jobResult] = await Promise.all([
      client.from('events').select('*').eq('organization_id', current.id).order('event_date', { ascending: true }),
      client.from('captions').select('*').eq('organization_id', current.id),
      client.from('assets').select('id,filename,storage_path').eq('organization_id', current.id).order('created_at', { ascending: false }).limit(30),
      client.from('provisioning_jobs').select('status,make_folder_id,scenario_ids').eq('organization_id', current.id).maybeSingle(),
    ])
    const failure = eventResult.error || captionResult.error || photoResult.error || jobResult.error
    if (failure) { fail(failure.message); return }
    setEvents((eventResult.data || []) as ClubEvent[])
    setCaptions((captionResult.data || []) as Caption[])
    setProvision(jobResult.data || null)
    const signed = await Promise.all(((photoResult.data || []) as Photo[]).map(async photo => {
      const { data } = await client.storage.from('dtm-photos').createSignedUrl(photo.storage_path, 3600)
      return { ...photo, signedUrl: data?.signedUrl }
    }))
    setPhotos(signed)
  }, [])

  useEffect(() => {
    if (org) { setEvents([]); setCaptions([]); setPhotos([]); setPendingEvents([]); setView('overview'); void refreshWorkspace(org) }
  }, [org?.id, refreshWorkspace])

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = mode === 'signup' ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (mode === 'signup' && !result.data.session) notify('Account created. Check your email and confirm your address, then sign in.')
      else notify('Signed in successfully.')
    } catch (e) { fail(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }

  async function provisionOrg(id: string, inviteCode = '') {
    const { data } = await client.auth.getSession()
    if (!data.session?.access_token) return
    try {
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ organizationId: id, inviteCode }) })
      if (!(res.headers.get('content-type') || '').includes('application/json')) {
        notify('Workspace saved. Make provisioning becomes available through Netlify Functions (not the plain Vite preview).')
        return
      }
      const response: { status?: string; message?: string; error?: string } = await res.json()
      if (!res.ok) fail(response.message || response.error || 'Could not provision organization')
      else notify(response.message || `Provisioning: ${response.status}`)
    } catch { notify('Workspace created. Automatic Make provisioning will run when the Netlify API is connected.') }
    if (org?.id === id) await refreshWorkspace(org)
  }

  async function createOrganization(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      const { data, error: createError } = await client.rpc('create_organization', { p_name: newName.trim(), p_sport: newSport })
      if (createError) throw createError
      const id = data as string
      setNewName('')
      await refreshOrgs(id)
      notify('Your club workspace has been created.')
      void provisionOrg(id, provisionCode.trim())
    } catch (e) { fail(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }

  async function addEvent(item: ImportedEvent, scheduleId?: string) {
    if (!org) return
    if (!item.team.trim() || !item.event_date) throw new Error('Team and date are required.')
    const { error: insertError } = await client.from('events').insert({
      organization_id: org.id, schedule_id: scheduleId || null, kind: item.kind, team: item.team.trim(),
      opponent: item.opponent.trim(), venue: item.venue.trim(), event_date: item.event_date, start_time: item.start_time || null,
      status: scheduleId ? 'review' : 'confirmed',
    })
    if (insertError) throw insertError
  }

  async function saveManualEvent(event: FormEvent) {
    event.preventDefault(); if (!org) return; setBusy(true)
    try { await addEvent(newEvent); setNewEvent({ ...defaultEvent }); setShowEvent(false); await refreshWorkspace(org); notify('Calendar event added.') }
    catch (e) { fail(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }


  useEffect(() => {
    if (!org || !pdfFlow?.scheduleId ||
        !['processing', 'delayed'].includes(pdfFlow.phase) ||
        pdfFlow.organizationId !== org.id) return

    const organization = org
    const scheduleId = pdfFlow.scheduleId
    const startedAt = pdfFlow.startedAt
    let active = true
    let checking = false

    async function checkProcessing() {
      if (checking) return
      checking = true
      try {
        const { data } = await client.from('schedules')
          .select('processing_status')
          .eq('id', scheduleId)
          .eq('organization_id', organization.id)
          .maybeSingle()

        if (!active) return

        if (data?.processing_status === 'processed') {
          const { count } = await client.from('events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization.id)
            .eq('schedule_id', scheduleId)

          if (!active) return

          await refreshWorkspace(organization)
          if (!active) return

          sessionStorage.removeItem('dtm-pdf-progress')
          setPdfFlow(current =>
            current?.scheduleId === scheduleId
              ? { ...current, phase: 'complete', gameCount: count ?? undefined }
              : current
          )
        } else if (data?.processing_status === 'failed') {
          sessionStorage.removeItem('dtm-pdf-progress')
          setPdfFlow(current =>
            current?.scheduleId === scheduleId
              ? { ...current, phase: 'failed' }
              : current
          )
        } else if (Date.now() - startedAt > 240000) {
          setPdfFlow(current =>
            current?.scheduleId === scheduleId && current.phase === 'processing'
              ? { ...current, phase: 'delayed' }
              : current
          )
        }
      } catch {
        if (active && Date.now() - startedAt > 240000) {
          setPdfFlow(current =>
            current?.scheduleId === scheduleId && current.phase === 'processing'
              ? { ...current, phase: 'delayed' }
              : current
          )
        }
      } finally {
        checking = false
      }
    }

    void checkProcessing()
    const timer = window.setInterval(() => void checkProcessing(), 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [org, pdfFlow?.scheduleId, pdfFlow?.phase, pdfFlow?.startedAt, refreshWorkspace])


  async function importPdf(file?: File) {
    if (!file || !org) return

    const initialPdfFlow: PdfFlow = {
      organizationId: org.id,
      filename: file.name,
      scheduleId: null,
      phase: 'uploading',
      startedAt: Date.now()
    }
    setPdfCompact(true)
    setPdfMinimized(false)
    setPdfTip(0)
    setPdfFlow(initialPdfFlow)
    setBusy(true)
    setPendingEvents([])
    setExtractedText('')
    setError('')
    setNotice('')

    try {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Please select a PDF file.')
      }

      if (file.size > 15 * 1024 * 1024) {
        throw new Error('PDF must be 15 MB or smaller.')
      }

      const path = `${org.id}/schedules/${crypto.randomUUID()}.pdf`

      const { error: storageError } = await client.storage
        .from('dtm-schedules')
        .upload(path, file, {
          contentType: 'application/pdf',
          upsert: false
        })

      if (storageError) throw storageError

      const { data: record, error: dbError } = await client
        .from('schedules')
        .insert({
          organization_id: org.id,
          filename: file.name,
          storage_path: path,
          extracted_text: ''
        })
        .select('id')
        .single()

      if (dbError) {
        await client.storage.from('dtm-schedules').remove([path])
        throw dbError
      }

      sessionStorage.setItem(`dtm-schedule-id:${org.id}`, record.id)

      const processingPdfFlow: PdfFlow = {
        ...initialPdfFlow,
        scheduleId: record.id,
        phase: 'processing'
      }
      sessionStorage.setItem('dtm-pdf-progress', JSON.stringify(processingPdfFlow))
      setPdfFlow(processingPdfFlow)


    } catch (e) {
      setPdfFlow(null)
      sessionStorage.removeItem('dtm-pdf-progress')
      fail(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!org || !pendingEvents.length) return
    setBusy(true)
    try {
      const scheduleId = sessionStorage.getItem(`dtm-schedule-id:${org.id}`) || undefined
      // Prevent duplicate submissions from an accidental refresh/click by clearing the pending UI first.
      const batch = pendingEvents
      setPendingEvents([])
      for (const event of batch) await addEvent(event, scheduleId)
      await refreshWorkspace(org)
      notify(`${batch.length} events added for review. Verify their dates and opponents.`)
    } catch (e) { fail(String(e instanceof Error ? e.message : e)); await refreshWorkspace(org) } finally { setBusy(false) }
  }

  async function generateCaption(event: ClubEvent) {
    if (!org) return
    const existing = captions.find(c => c.event_id === event.id)
    const content = existing?.content || captionDraft(event, org)
    const { error: upsertError } = await client.from('captions').upsert({
      organization_id: org.id, event_id: event.id, content, status: 'draft', updated_at: new Date().toISOString()
    }, { onConflict: 'event_id' })
    if (upsertError) fail(upsertError.message)
    else { await refreshWorkspace(org); setView('studio'); notify('Caption draft generated. Review before publishing.') }
  }

  async function saveCaption(
    caption: Caption,
    content: string,
    status: Caption['status']
  ): Promise<boolean> {
    if (!org) return false

    const cleaned = content.trim()
    if (!cleaned) {
      fail('Caption cannot be empty.')
      return false
    }

    const { data, error: updateError } = await client
      .from('captions')
      .update({
        content: cleaned,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', caption.id)
      .eq('organization_id', org.id)
      .select('id')
      .maybeSingle()

    if (updateError || !data) {
      fail(updateError?.message || 'Could not save this caption.')
      return false
    }

    setCaptions(current => current.map(item =>
      item.id === caption.id
        ? { ...item, content: cleaned, status }
        : item
    ))
    notify(status === 'approved' ? 'Caption approved.' : 'Draft saved.')
    return true
  }

  async function uploadPhoto(file?: File) {
    if (!file || !org) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { fail('Choose a JPG, PNG or WEBP image.'); return }
    if (file.size > 10 * 1024 * 1024) { fail('Image must be 10 MB or smaller.'); return }
    setBusy(true)
    try {
      const path = `${org.id}/photos/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`
      const { error: storageError } = await client.storage.from('dtm-photos').upload(path, file, { contentType: file.type, upsert: false })
      if (storageError) throw storageError
      const { error: saveError } = await client.from('assets').insert({ organization_id: org.id, filename: file.name, storage_path: path })
      if (saveError) throw saveError
      await refreshWorkspace(org); notify('Photo uploaded to your organization library.')
    } catch (e) { fail(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }

  async function saveBrand(name: string, tagline: string, color: string) {
    if (!org) return
    const { error: updateError } = await client.from('organizations').update({ name, tagline, color }).eq('id', org.id)
    if (updateError) fail(updateError.message)
    else { await refreshOrgs(org.id); notify('Brand kit saved.') }
  }

  if (!authLoaded) return <div className="pl-center">Loading DateTheMoment…</div>
  if (!session) return <div className="pl-auth-page">
    <div className="pl-auth-story"><div className="pl-logo">D<span>.</span></div><span className="pl-kicker">DATETHEMOMENT / THE PLATFORM</span><h1>Your club. Your moments.<br/><em>One workspace.</em></h1><p>Bring your schedule, photos and club identity together to create consistent content.</p><div className="pl-feature"><ShieldCheck size={20}/> Each organization has a private, separate workspace</div><div className="pl-feature"><CalendarDays size={20}/> Schedules become editable calendar events</div><div className="pl-feature"><Sparkles size={20}/> Turn those events into ready-to-review content</div></div>
    <div className="pl-auth-card"><span className="pl-kicker">{mode === 'signup' ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span><h2>{mode === 'signup' ? 'Get started with your club.' : 'Sign in to your workspace.'}</h2><form onSubmit={submitAuth}><label>Email address</label><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="director@yourclub.com"/><label>Password</label><input type="password" minLength={6} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/><button className="pl-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={17}/></button></form><p>{mode === 'signup' ? 'Already have an account?' : 'New to DateTheMoment?'} <button className="pl-link" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setNotice('') }}>{mode === 'signup' ? 'Sign in' : 'Create account'}</button></p><p className="pl-muted">Email verification may be required depending on your Supabase Auth settings.</p>{error && <div className="pl-error">{error}</div>}{notice && <div className="pl-success">{notice}</div>}</div>
  </div>

  if (!org) return <div className="pl-auth-page"><div className="pl-auth-story"><div className="pl-logo">D<span>.</span></div><span className="pl-kicker">YOUR FIRST WORKSPACE</span><h1>Let's build your<br/><em>club's home.</em></h1><p>One-time setup. Your organization's content, photos and calendars stay separated from other clubs.</p><button className="pl-plain" onClick={() => void client.auth.signOut()}><LogOut size={16}/> Sign out</button></div><div className="pl-auth-card"><FolderPlus size={36} color="#c9f072"/><h2>Create your organization</h2><form onSubmit={createOrganization}><label>Club name</label><input required minLength={2} maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Legion FC"/><label>Sport</label><select value={newSport} onChange={e => setNewSport(e.target.value)}><option>Soccer</option><option>Basketball</option><option>Volleyball</option><option>Other</option></select><label>Provisioning invite code (optional, given on your discovery call)</label><input type="password" value={provisionCode} onChange={e => setProvisionCode(e.target.value)} placeholder="Private onboarding code"/><button disabled={busy} className="pl-primary">{busy ? 'Creating…' : 'Create my workspace'} <ArrowRight size={17}/></button></form><p className="pl-muted">A fresh database workspace will be created immediately. Make provisioning starts when the server integration is configured.</p>{error && <div className="pl-error">{error}</div>}</div></div>


  const dtmNow = new Date()
  const dtmToday = [
    dtmNow.getFullYear(),
    String(dtmNow.getMonth() + 1).padStart(2, '0'),
    String(dtmNow.getDate()).padStart(2, '0')
  ].join('-')
  const dtmMonthDate = new Date(
    dtmNow.getFullYear(),
    dtmNow.getMonth() + dtmMonthOffset,
    1
  )
  const dtmMonthKey = [
    dtmMonthDate.getFullYear(),
    String(dtmMonthDate.getMonth() + 1).padStart(2, '0')
  ].join('-')
  const dtmMonthEvents = events.filter(
    e => e.event_date.startsWith(dtmMonthKey)
  )
  const dtmPastEvents = events.filter(e => e.event_date < dtmToday)
  const dtmCalendarStart = dtmMonthDate.getDay()
  const dtmCalendarDays = new Date(
    dtmMonthDate.getFullYear(),
    dtmMonthDate.getMonth() + 1,
    0
  ).getDate()

  const planned = events.length
  const drafted = captions.length
  const confirmed = events.filter(ev => ev.status === 'confirmed').length
  const graphicEvent = events.find(e => e.id === graphicEventId) || events[0]
  const navigation: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'calendar', label: 'Calendar', icon: CalendarDays }, { id: 'teams', label: 'Teams', icon: FolderPlus },
    { id: 'studio', label: 'Caption Studio', icon: WandSparkles }, { id: 'graphics', label: 'Graphics Studio', icon: Palette },
    { id: 'photos', label: 'Photography', icon: Camera }, { id: 'branding', label: 'Brand Kit', icon: Palette },
  ]
  return <div className="pl-app">

    {pdfFlow && pdfFlow.organizationId === org.id && (
      <div className={[
        'pl-pdf-cover',
        `pl-pdf-cover--${pdfFlow.phase}`,
        pdfCompact ? 'pl-pdf-cover--compact' : '',
        pdfMinimized ? 'pl-pdf-cover--minimized' : ''
      ].join(' ')} role="status" aria-live="polite">
        <div className="pl-pdf-modal">
          {pdfCompact && (
            <button type="button" className="pl-pdf-minimize"
              onClick={() => setPdfMinimized(v => !v)}>
              <ChevronDown size={16}/>
              {pdfMinimized
                ? pdfFlow.phase === 'complete' ? 'Schedule ready — open' : 'View PDF progress'
                : 'Minimize'}
            </button>
          )}
          <div className={`pl-pdf-big-icon ${pdfFlow.phase === 'complete' ? 'pl-pdf-big-icon--complete' : ''}`}>
            {pdfFlow.phase === 'complete'
              ? <CheckCircle2 size={48}/>
              : pdfFlow.phase === 'delayed' || pdfFlow.phase === 'failed'
                ? <RefreshCw size={42}/>
                : <UploadCloud size={46}/>}
          </div>

          
          <h2>
            {pdfFlow.phase === 'uploading' && 'Uploading your PDF'}
            {pdfFlow.phase === 'processing' && 'Building your calendar'}
            {pdfFlow.phase === 'complete' && 'Your PDF has been processed!'}
            {pdfFlow.phase === 'delayed' && 'Still waiting for processing'}
            {pdfFlow.phase === 'failed' && 'Processing needs attention'}
          </h2>

          <p className="pl-pdf-description">
            {pdfFlow.phase === 'uploading' && 'Securely uploading your schedule to DateTheMoment.'}
            {pdfFlow.phase === 'processing' && 'Your PDF is uploaded. We are extracting games and updating your calendar automatically.'}
            {pdfFlow.phase === 'complete' && 'Your schedule has finished processing, and your calendar has been refreshed automatically.'}
            {pdfFlow.phase === 'delayed' && 'We have not received the completion signal yet. Your PDF may still be processing.'}
            {pdfFlow.phase === 'failed' && 'The schedule processor reported an error. Please check the upload before trying again.'}
          </p>

          

          {pdfCompact && ['processing', 'delayed'].includes(pdfFlow.phase) && (
            <div className="pl-pdf-lesson" key={pdfTip}>
              <div className="pl-pdf-lesson-header" style={{ justifyContent: "flex-end" }}>
                
                <button type="button"
                  onClick={() => setPdfTip(v => (v + 1) % pdfLessons.length)}>
                  Next <ArrowRight size={13}/>
                </button>
              </div>
              <strong>{pdfLessons[pdfTip].title}</strong>
              <p>{pdfLessons[pdfTip].detail}</p>
              <button type="button" className="pl-pdf-lesson-action"
                onClick={() => setView(pdfLessons[pdfTip].page)}>
                {pdfLessons[pdfTip].action} <ArrowRight size={14}/>
              </button>
            </div>
          )}

          {(pdfFlow.phase === 'uploading' || pdfFlow.phase === 'processing') && (
            <>
              <div className="pl-pdf-progress"><span/></div>
              <div className="pl-pdf-progress-label">
                <span>{pdfFlow.phase === 'uploading' ? 'Uploading securely' : 'AI schedule processing'}</span>
                <span><RefreshCw size={13} className="pl-pdf-spin"/> Working</span>
              </div>
            </>
          )}

          {pdfFlow.phase === 'complete' && (
            <>
              {pdfFlow.gameCount !== undefined && (
                <div className="pl-pdf-result">
                  <CheckCircle2 size={18}/>
                  {pdfFlow.gameCount === 0
                    ? 'Processing finished. No calendar games were found.'
                    : `${pdfFlow.gameCount} game${pdfFlow.gameCount === 1 ? '' : 's'} added to your calendar`}
                </div>
              )}
              <div className="pl-pdf-actions">
                <button className="pl-primary" onClick={() => { setView('calendar'); setPdfFlow(null) }}>
                  View Updated Calendar <ArrowRight size={17}/>
                </button>
                <button className="pl-outline" onClick={() => void refreshWorkspace(org)}>
                  <RefreshCw size={16}/> Refresh Calendar
                </button>
              </div>
            </>
          )}

          {pdfFlow.phase === 'delayed' && (
            <div className="pl-pdf-actions">
              <button className="pl-primary" onClick={() => {
                const next: PdfFlow = { ...pdfFlow, phase: 'processing', startedAt: Date.now() }
                sessionStorage.setItem('dtm-pdf-progress', JSON.stringify(next))
                setPdfFlow(next)
              }}>Check Again <RefreshCw size={17}/></button>
              <button className="pl-outline" onClick={() => {
                sessionStorage.removeItem('dtm-pdf-progress')
                setPdfFlow(null)
                setView('calendar')
                void refreshWorkspace(org)
              }}>Return to Calendar</button>
            </div>
          )}

          {pdfFlow.phase === 'failed' && (
            <div className="pl-pdf-actions">
              <button className="pl-outline" onClick={() => {
                setPdfFlow(null)
                setView('calendar')
              }}>Return to Calendar</button>
            </div>
          )}

          
        </div>
      </div>
    )}
    <aside className="pl-sidebar"><div className="pl-brand"><div className="pl-logo">D<span>.</span></div><div><strong>DateTheMoment</strong><small>THE PLATFORM</small></div></div><div className="pl-org-pill"><span className="pl-org-avatar" style={{ background: org.color }}>{org.name.slice(0, 1).toUpperCase()}</span><div><small>YOUR ORGANIZATION</small><strong>{org.name}</strong></div><ChevronDown size={16}/></div>{orgs.length > 1 && <select className="pl-org-select" value={org.id} onChange={e => setOrg(orgs.find(o => o.id === e.target.value) || org)}>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}<nav>{navigation.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><item.icon size={19}/>{item.label}</button>)}</nav><div className="pl-sidebottom"><div className="pl-sidetip"><ShieldCheck size={17}/> Private club workspace</div><button onClick={() => void client.auth.signOut()}><LogOut size={17}/> Sign out</button></div></aside>
    <main className="pl-main"><header className="pl-topbar"><ThemeToggle /><span>WORKSPACE / {view.toUpperCase()}</span><div><strong>{org.name}</strong><span className="pl-status-dot"/></div></header><div className="pl-page">
      {error && <div className="pl-error"><strong>Attention:</strong> {error} <button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="pl-success">{notice} <button onClick={() => setNotice('')}>×</button></div>}
      {view === 'overview' && <><div className="pl-hero"><span className="pl-kicker">WELCOME TO YOUR WORKSPACE</span><h1>Make every moment<br/><em>go further.</em></h1><p>Your club's marketing, schedule and visual content—all together.</p><button className="pl-primary" onClick={() => setView('calendar')}>Start with your schedule <ArrowRight size={18}/></button></div><div className="pl-stat-grid"><div><span>Calendar events</span><strong>{planned}</strong></div><div><span>Confirmed events</span><strong>{confirmed}</strong></div><div><span>Caption drafts</span><strong>{drafted}</strong></div><div><span>Photos uploaded</span><strong>{photos.length}</strong></div></div><section className="pl-panel"><div className="pl-panel-heading"><h2>Getting started</h2><span className="pl-tag">YOUR ONBOARDING</span></div><div className="pl-steps"><div><CheckCircle2 color="#b7eb72"/> Account and organization created</div><div><CalendarDays/> {events.length ? 'Schedule available' : 'Upload a PDF schedule or add your first event'}</div><div><Sparkles/> {captions.length ? 'Content draft ready' : 'Create your first caption from an event'}</div><div><ImagePlus/> {photos.length ? 'Photo library ready' : 'Upload your club photography'}</div></div></section><section className="pl-panel"><div className="pl-panel-heading"><h2>Automation setup</h2><button className="pl-link" onClick={() => void refreshWorkspace(org)}><RefreshCw size={15}/> Refresh</button></div><p>Provisioning: <strong>{provision?.status || 'pending'}</strong></p><p className="pl-muted">{provision?.status === 'needs_setup' ? `Make folder ${provision.make_folder_id} created. Administrator must verify new scenario webhooks and connections.` : 'Automatic Make setup uses the private Netlify Function. It never runs on every login.'}</p>{provision?.status === 'pending' && <button className="pl-outline" onClick={() => { const code = window.prompt('Enter your private onboarding code') || ''; if (code) void provisionOrg(org.id, code) }}>Initialize automation</button>}</section></>}
      {view === 'teams' && <TeamManagement organizationId={org.id} />}
      {view === 'calendar' && <><div className="pl-title"><div><span className="pl-kicker">THE CALENDAR</span><h1>Every date.<br/><em>A new opportunity.</em></h1><p>Import schedules, review the dates, and turn events into content.</p></div><button className="pl-primary" onClick={() => setShowEvent(!showEvent)}><Plus size={17}/> Add event</button></div><section className="pl-panel"><div className="pl-panel-heading"><h2><FileText size={21}/> Upload a schedule PDF</h2><span className="pl-tag">AI SCHEDULE IMPORT</span></div><p className="pl-muted">Upload your club's PDF schedule. We'll process it automatically and refresh your calendar when it's ready.</p><label className="pl-drop"><UploadCloud size={27}/>{busy ? 'Processing…' : 'Choose PDF schedule'}<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e => { void importPdf(e.target.files?.[0]); e.currentTarget.value = '' }}/></label>{pendingEvents.length > 0 && <div className="pl-review"><h3>Review extracted events</h3>{pendingEvents.map((e, i) => <div className="pl-review-row" key={i}><input aria-label="Team" value={e.team} onChange={v => setPendingEvents(prev => prev.map((it,j) => j === i ? {...it, team:v.target.value} : it))}/><input type="date" aria-label="Date" value={e.event_date} onChange={v => setPendingEvents(prev => prev.map((it,j) => j === i ? {...it,event_date:v.target.value} : it))}/><input type="time" aria-label="Time" value={e.start_time} onChange={v => setPendingEvents(prev => prev.map((it,j) => j === i ? {...it,start_time:v.target.value} : it))}/><input aria-label="Opponent" placeholder="Opponent" value={e.opponent} onChange={v => setPendingEvents(prev => prev.map((it,j) => j === i ? {...it,opponent:v.target.value} : it))}/><button title="Remove proposal" onClick={() => setPendingEvents(prev => prev.filter((_, j) => j !== i))}>×</button></div>)}<button className="pl-primary" disabled={busy} onClick={() => void confirmImport()}>Add {pendingEvents.length} events for review <ArrowRight size={17}/></button></div>}{extractedText && <details className="pl-raw"><summary>View extracted PDF text</summary><pre>{extractedText}</pre></details>}</section>{showEvent && <section className="pl-panel"><h2>Add event manually</h2><form className="pl-event-form" onSubmit={saveManualEvent}><label>Type<select value={newEvent.kind} onChange={e => setNewEvent(v => ({...v,kind:e.target.value as ImportedEvent['kind']}))}><option value="match">Match</option><option value="training">Training</option></select></label><label>Team<input required value={newEvent.team} onChange={e => setNewEvent(v => ({...v,team:e.target.value}))}/></label><label>Opponent<input value={newEvent.opponent} onChange={e => setNewEvent(v => ({...v,opponent:e.target.value}))}/></label><label>Location<input value={newEvent.venue} onChange={e => setNewEvent(v => ({...v,venue:e.target.value}))}/></label><label>Date<input required type="date" value={newEvent.event_date} onChange={e => setNewEvent(v => ({...v,event_date:e.target.value}))}/></label><label>Time<input type="time" value={newEvent.start_time} onChange={e => setNewEvent(v => ({...v,start_time:e.target.value}))}/></label><button className="pl-primary" disabled={busy}>Save event</button></form></section>}
<section className="pl-panel">
  <div className="pl-panel-heading">
    <h2><CalendarDays size={21}/> Content Calendar</h2>
    <div className="pl-calendar-actions">
      <span className="pl-tag">JAN 2026 ONWARD</span>
      <button type="button" className="pl-outline pl-calendar-refresh"
        onClick={() => void refreshWorkspace(org)}>
        <RefreshCw size={16}/> Refresh Calendar
      </button>
    </div>
  </div>

  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20
  }}>
    <button
      className="pl-outline"
      disabled={dtmMonthOffset <= ((2026 - dtmNow.getFullYear()) * 12 - dtmNow.getMonth())}
      onClick={() => setDtmMonthOffset(v => Math.max((2026 - dtmNow.getFullYear()) * 12 - dtmNow.getMonth(), v - 1))}
    >
      Previous
    </button>
    <h2 style={{textAlign: 'center', margin: 0}}>
      {dtmMonthDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      })}
    </h2>
    <button
      className="pl-outline"
      disabled={dtmMonthOffset === 11}
      onClick={() => setDtmMonthOffset(v => Math.min(11, v + 1))}
    >
      Next
    </button>
  </div>

  <div style={{overflowX: 'auto'}}>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gap: 6,
      minWidth: 620
    }}>
      {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => (
        <div key={d} style={{
          textAlign: 'center',
          padding: 8,
          fontSize: 11,
          fontWeight: 700
        }}>{d}</div>
      ))}

      {Array.from({length: dtmCalendarStart}, (_, i) => (
        <div key={`blank-${i}`}/>
      ))}

      {Array.from({length: dtmCalendarDays}, (_, i) => i + 1)
        .map(day => {
          const dayISO =
            `${dtmMonthKey}-${String(day).padStart(2, '0')}`
          const dayEvents = dtmMonthEvents.filter(
            e => e.event_date === dayISO
          )

          return (
            <div key={day} style={{
              minHeight: 92,
              border: '1px solid #8885',
              borderRadius: 8,
              padding: 7,
              opacity: dayEvents.length ? 1 : 0.45
            }}>
              <small style={{fontWeight: 700}}>{day}</small>

              {dayEvents.map(e => {
                const caption = captions.find(
                  c => c.event_id === e.id
                )
                return (
                  <button
                    key={e.id}
                    onClick={() => setView('studio')}
                    title={`${e.team} vs ${e.opponent}`}
                    style={{
                      width: '100%',
                      marginTop: 5,
                      padding: 6,
                      borderRadius: 6,
                      border: '1px solid #8885',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: 'transparent',
                      color: 'inherit'
                    }}
                  >
                    <strong style={{
                      display: 'block',
                      fontSize: 11,
                      overflowWrap: 'anywhere'
                    }}>{e.team}</strong>
                    <small>
                      {e.status === 'review'
                        ? 'Needs review'
                        : caption
                          ? 'Caption ready'
                          : 'Caption pending'}
                    </small>
                  </button>
                )
              })}
            </div>
          )
        })}
    </div>
  </div>

  <p className="pl-muted" style={{marginTop: 14}}>
    {dtmMonthEvents.length} scheduled games this month.
    Select a game to open Content Studio.
  </p>
</section>

<details className="pl-panel">
  <summary style={{
    cursor: 'pointer',
    fontWeight: 700,
    padding: '8px 0'
  }}>
    Past Games ({dtmPastEvents.length}) — Expand
  </summary>

  <div style={{paddingTop: 16}}>
    {dtmPastEvents.length === 0 &&
      <p className="pl-muted">No past games.</p>}

    {[...dtmPastEvents].reverse().map(e => {
      const caption = captions.find(c => c.event_id === e.id)

      return (
        <div key={e.id} className="pl-event">
          <div className="pl-date">
            <strong>{e.event_date.slice(8)}</strong>
            <span>
              {new Date(
                `${e.event_date}T12:00:00`
              ).toLocaleDateString('en-US', {
                month: 'short'
              }).toUpperCase()}
            </span>
          </div>
          <div className="pl-eventbody">
            <strong>{e.team}</strong>
            <small>
              {e.status === 'review'
                ? 'Needs review'
                : caption
                  ? 'Caption ready'
                  : 'Caption pending'}
            </small>
          </div>
          <button
            className="pl-outline"
            onClick={() => setView('studio')}
          >
            View captions
          </button>
        </div>
      )
    })}
  </div>
</details>
<ScheduleManager client={client} organizationId={org.id} onDeleted={() => refreshWorkspace(org)} /></>}
      {view === 'studio' && (
        <CaptionStudio
          events={events}
          captions={captions}
          onRefresh={() => refreshWorkspace(org)}
          onGenerate={async eventId => {
            const event = events.find(item => item.id === eventId)
            if (event) await generateCaption(event)
          }}
          onSave={async (captionId, content, status) => {
            const caption = captions.find(item => item.id === captionId)
            return caption ? saveCaption(caption, content, status) : false
          }}
        />
      )}
      {view === 'graphics' && <><div className="pl-title"><div><span className="pl-kicker">BRANDED VISUALS</span><h1>Designed for<br/><em>your club.</em></h1><p>Export 1080 × 1350 matchday or training graphics in PNG or JPEG.</p></div></div><section className="pl-panel"><h2>Generate your graphic</h2>{!events.length ? <p>Add an event in Calendar first.</p> : <><label>Choose calendar event</label><select value={graphicEvent?.id || ''} onChange={e => setGraphicEventId(e.target.value)}>{events.map(e => <option key={e.id} value={e.id}>{e.team} · {dateLabel(e.event_date)} · {e.kind}</option>)}</select><div className="pl-graphic-preview" style={{ borderColor: org.color }}><span style={{ color: org.color }}>{org.name.toUpperCase()}</span><h2>{graphicEvent?.kind === 'training' ? 'TRAINING DAY' : 'MATCHDAY'}</h2><strong>{graphicEvent?.team}</strong>{graphicEvent?.kind === 'match' && <strong>VS {graphicEvent?.opponent || 'TBD'}</strong>}<p>{graphicEvent && dateLabel(graphicEvent.event_date)} · {graphicEvent?.start_time?.slice(0,5) || 'Time TBD'}</p></div><div className="pl-actions"><button className="pl-primary" onClick={() => { if (graphicEvent) downloadGraphic({club:org.name,color:org.color,team:graphicEvent.team,opponent:graphicEvent.opponent,date:graphicEvent.event_date,time:graphicEvent.start_time || '',venue:graphicEvent.venue,kind:graphicEvent.kind}) }}><Download size={17}/> Download PNG</button><button className="pl-outline" onClick={() => { if (graphicEvent) downloadGraphic({club:org.name,color:org.color,team:graphicEvent.team,opponent:graphicEvent.opponent,date:graphicEvent.event_date,time:graphicEvent.start_time || '',venue:graphicEvent.venue,kind:graphicEvent.kind},'image/jpeg') }}>Download JPEG</button></div></>}</section></>}
      {view === 'photos' && <><div className="pl-title"><div><span className="pl-kicker">PHOTO LIBRARY</span><h1>Your moments.<br/><em>Your archive.</em></h1><p>Upload photography into private organization storage.</p></div></div><PhotoCarouselBuilder
      key={org.id}
      organizationId={org.id}
      events={events}
    />
    <details className="pl-panel">
      <summary>Upload individual image files</summary>
      <label className="pl-drop"><ImagePlus size={27}/>{busy ? 'Uploading…' : 'Add JPG, PNG or WEBP'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void uploadPhoto(e.target.files?.[0]); e.currentTarget.value = '' }}/></label><div className="pl-photo-grid">{photos.map(photo => <div key={photo.id}><img src={photo.signedUrl} alt={photo.filename}/><small>{photo.filename}</small></div>)}</div>{!photos.length && <p className="pl-muted">No photos uploaded yet.</p>}</details></>}
      {view === 'branding' && <BrandForm org={org} save={saveBrand}/>}
    </div></main>
  </div>
}

function BrandForm({ org, save }: { org: Organization; save: (name: string, tagline: string, color: string) => Promise<void> }) {
  const [name, setName] = useState(org.name)
  const [tagline, setTagline] = useState(org.tagline)
  const [color, setColor] = useState(org.color)
  useEffect(() => { setName(org.name); setTagline(org.tagline); setColor(org.color) }, [org.id, org.name, org.tagline, org.color])
  return <><div className="pl-title"><div><span className="pl-kicker">ORGANIZATION IDENTITY</span><h1>Make it<br/><em>yours.</em></h1><p>These settings shape your exported graphics and caption templates.</p></div></div><section className="pl-panel"><form className="pl-brand-form" onSubmit={e => {e.preventDefault(); void save(name, tagline, color)}}><label>Club name<input required value={name} onChange={e => setName(e.target.value)} maxLength={100}/></label><label>Brand tagline<input value={tagline} onChange={e => setTagline(e.target.value)} maxLength={130}/></label><label>Brand color<input type="color" value={color} onChange={e => setColor(e.target.value)}/></label><button className="pl-primary">Save brand kit</button></form></section></>
}
