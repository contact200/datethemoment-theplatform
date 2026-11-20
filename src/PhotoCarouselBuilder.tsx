import { useEffect, useMemo, useState } from 'react'
import { Images, Link2, Save, Trash2 } from 'lucide-react'
import { supabase } from './lib/supabase'

const client = supabase!

type Game = {
  id: string
  team: string
  opponent: string
  event_date: string
}

type PhotoDraft = {
  urls: string[]
  team: string
  eventId: string
  photosPerCarousel: number
}

type SavedCarousel = {
  id: string
  import_batch_id: string
  carousel_order: number
  team_name: string
  event_id: string | null
  photo_urls: string[]
  status: string
  created_at: string
}

type Props = {
  organizationId: string
  events: Game[]
}

const emptyDraft = (): PhotoDraft => ({
  urls: [],
  team: '',
  eventId: '',
  photosPerCarousel: 10
})

function readDraft(organizationId: string): PhotoDraft {
  try {
    const saved = localStorage.getItem(`dtm-photo-preview:${organizationId}`)
    if (!saved) return emptyDraft()
    const data = JSON.parse(saved)
    return {
      urls: Array.isArray(data.urls)
        ? data.urls.filter((url: unknown) => typeof url === 'string')
        : [],
      team: typeof data.team === 'string' ? data.team : '',
      eventId: typeof data.eventId === 'string' ? data.eventId : '',
      photosPerCarousel: Number.isInteger(data.photosPerCarousel)
        ? Math.max(1, Math.min(20, data.photosPerCarousel))
        : 10
    }
  } catch {
    return emptyDraft()
  }
}

export default function PhotoCarouselBuilder({
  organizationId,
  events
}: Props) {
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<PhotoDraft>(
    () => readDraft(organizationId)
  )
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState<SavedCarousel[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(
        `dtm-photo-preview:${organizationId}`,
        JSON.stringify(draft)
      )
    } catch {
      setMessage('Browser storage is unavailable. This preview may not persist.')
    }
  }, [draft, organizationId])

  useEffect(() => {
    let active = true

    async function loadSaved() {
      setLoadingSaved(true)

      const { data, error } = await client
        .from('photo_carousels')
        .select(
          'id,import_batch_id,carousel_order,team_name,event_id,photo_urls,status,created_at'
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (!active) return

      if (error) {
        setMessage(`Could not load saved carousels: ${error.message}`)
      } else {
        setSaved((data || []) as SavedCarousel[])
      }

      setLoadingSaved(false)
    }

    void loadSaved()

    return () => {
      active = false
    }
  }, [organizationId])

  const groups = useMemo(() => {
    const result: string[][] = []
    for (let i = 0; i < draft.urls.length; i += draft.photosPerCarousel) {
      result.push(draft.urls.slice(i, i + draft.photosPerCarousel))
    }
    return result
  }, [draft.urls, draft.photosPerCarousel])

  const teamOptions = useMemo(() => (
    [...new Set(events.map(event => event.team).filter(Boolean))].sort()
  ), [events])

  const matchingEvents = events.filter(event => {
    if (!draft.team.trim()) return true
    const team = draft.team.toLowerCase().trim()
    const candidate = event.team.toLowerCase()
    return candidate.includes(team) || team.includes(candidate)
  })

  function importUrls() {
    const matches = input.match(/https?:\/\/[^\s<>"'()\[\]]+/g) ?? []

    const valid = matches
      .map(url => url.replace(/[.,;]+$/, ''))
      .filter(value => {
        try {
          const parsed = new URL(value)
          return parsed.protocol === 'https:' &&
            /\.(jpg|jpeg|png|webp)$/i.test(parsed.pathname)
        } catch {
          return false
        }
      })

    if (!valid.length) {
      setMessage('No direct JPG, PNG, or WEBP image links were found.')
      return
    }

    const combined = [...new Set([...draft.urls, ...valid])]
    const added = combined.length - draft.urls.length

    setDraft(current => ({ ...current, urls: combined }))
    setInput('')
    setMessage(
      `${added} new photo${added === 1 ? '' : 's'} imported. ` +
      `${combined.length} total.`
    )
  }

  async function saveCarousels() {
    if (!draft.urls.length || saving) return

    setSaving(true)
    setMessage('')

    const batchId = crypto.randomUUID()

    const rows = groups.map((urls, index) => ({
      organization_id: organizationId,
      import_batch_id: batchId,
      carousel_order: index + 1,
      team_name: draft.team.trim(),
      event_id: draft.eventId || null,
      photo_urls: urls,
      status: 'draft'
    }))

    try {
      const { data, error } = await client
        .from('photo_carousels')
        .insert(rows)
        .select(
          'id,import_batch_id,carousel_order,team_name,event_id,photo_urls,status,created_at'
        )

      if (error) throw new Error(error.message)

      if (!data || data.length !== rows.length) {
        throw new Error('Could not verify all saved carousels.')
      }

      const inserted = (data as SavedCarousel[])
        .sort((a, b) => a.carousel_order - b.carousel_order)

      setSaved(current => [...inserted, ...current])
      setDraft(emptyDraft())

      setMessage(
        `${inserted.length} carousel${inserted.length === 1 ? '' : 's'} ` +
        'saved to Supabase successfully.'
      )
    } catch (error) {
      setMessage(
        'Save failed: ' +
        (error instanceof Error ? error.message : String(error)) +
        '. Your unsaved photos are still available.'
      )
    } finally {
      setSaving(false)
    }
  }

  function clearPreview() {
    if (!window.confirm('Clear this local photo preview?')) return
    setDraft(emptyDraft())
    setInput('')
    setMessage('Preview cleared.')
  }

  return (
    <section className="pl-panel pl-photo-builder">
      <div className="pl-panel-heading">
        <h2><Images size={21}/> Carousel Builder</h2>
        <span className="pl-tag">CUSTOM CAROUSELS</span>
      </div>

      <p className="pl-muted">
        Paste public image URLs from Google Sheets.
        Your images will stay in their original order.
      </p>

      <textarea
        className="pl-photo-url-input"
        rows={5}
        value={input}
        placeholder={"Paste image URLs here — one per line"}
        onChange={event => setInput(event.target.value)}
        aria-label="Paste public photo URLs"
      />

      <div className="pl-photo-builder-actions">
        <button
          className="pl-primary"
          type="button"
          onClick={importUrls}
        >
          <Link2 size={16}/> Import Photo Links
        </button>

        {draft.urls.length > 0 && (
          <button
            className="pl-outline"
            type="button"
            onClick={clearPreview}
          >
            <Trash2 size={16}/> Clear Preview
          </button>
        )}
      </div>

      {message && <p className="pl-photo-message">{message}</p>}

      <div className="pl-photo-assignment">
        <label>
          Assign to team
          <input
            value={draft.team}
            list={`dtm-photo-teams-${organizationId}`}
            placeholder="Choose or enter team name"
            onChange={event => {
              const team = event.target.value
              setDraft(current => ({
                ...current,
                team,
                eventId: ''
              }))
            }}
          />
          <datalist id={`dtm-photo-teams-${organizationId}`}>
            {teamOptions.map(team => (
              <option key={team} value={team}/>
            ))}
          </datalist>
        </label>

        <label>
          Link to calendar game (optional)
          <select
            value={draft.eventId}
            onChange={event => setDraft(current => ({
              ...current,
              eventId: event.target.value
            }))}
          >
            <option value="">No game selected</option>
            {matchingEvents.map(event => (
              <option key={event.id} value={event.id}>
                {event.event_date} · {event.team}
                {event.opponent ? ` vs ${event.opponent}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Photos per carousel
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={draft.photosPerCarousel}
            onChange={event => {
              const value = Number(event.target.value)
              if (!Number.isFinite(value)) return
              setDraft(current => ({
                ...current,
                photosPerCarousel: Math.max(1, Math.min(20, Math.floor(value)))
              }))
            }}
          />
        </label>
      </div>

      {draft.urls.length > 0 && (
        <div className="pl-photo-save-bar">
          <button
            type="button"
            className="pl-primary"
            disabled={saving}
            onClick={() => void saveCarousels()}
          >
            <Save size={17}/>
            {saving
              ? 'Saving...'
              : `Save ${groups.length} Carousel${groups.length === 1 ? '' : 's'}`}
          </button>
          <span>Save to your organization's photo library.</span>
        </div>
      )}

      {draft.urls.length > 0 && (
        <>
          <div className="pl-photo-summary">
            <div><strong>{draft.urls.length}</strong><span>Photos</span></div>
            <div><strong>{groups.length}</strong><span>Carousels</span></div>
            <div><strong>{draft.photosPerCarousel}</strong><span>Photos per group</span></div>
          </div>

          {groups.map((urls, groupIndex) => (
            <div className="pl-photo-carousel" key={groupIndex}>
              <div className="pl-photo-carousel-heading">
                <div>
                  <h3>Carousel {groupIndex + 1}</h3>
                  <small>
                    {draft.team || 'Unassigned team'}
                    {draft.eventId ? ' · Linked to game' : ''}
                  </small>
                </div>
                <span>{urls.length} / {draft.photosPerCarousel} photos</span>
              </div>

              <div className="pl-photo-carousel-grid">
                {urls.map((url, photoIndex) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open original photo"
                    className="pl-photo-tile"
                  >
                    <img
                      src={url}
                      loading="lazy"
                      alt={`Carousel ${groupIndex + 1}, photo ${photoIndex + 1}`}
                    />
                    <span>{photoIndex + 1}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}

          <p className="pl-muted pl-photo-disclaimer">
            Preview only until saved. No posts are published automatically.
          </p>
        </>
      )}

      {loadingSaved && (
        <p className="pl-muted">Loading saved carousels...</p>
      )}

      {saved.length > 0 && (
        <div className="pl-photo-saved">
          <div className="pl-photo-saved-heading">
            <h3>Saved Carousels</h3>
            <span>{saved.length} saved</span>
          </div>

          <div className="pl-photo-saved-grid">
            {saved.map(item => (
              <div className="pl-photo-saved-card" key={item.id}>
                <div className="pl-photo-saved-images">
                  {item.photo_urls.slice(0, 4).map((url, index) => (
                    <img
                      key={index}
                      src={url}
                      loading="lazy"
                      alt={`Saved photo ${index + 1}`}
                    />
                  ))}
                </div>

                <div className="pl-photo-saved-info">
                  <strong>Carousel {item.carousel_order}</strong>
                  <span>{item.photo_urls.length} photos</span>
                </div>

                <small>
                  {item.team_name || 'Unassigned team'}
                  {item.event_id ? ' · Linked game' : ''}
                </small>

                <small>
                  Saved {new Date(item.created_at).toLocaleDateString()}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}

      {!draft.urls.length && !saved.length && !loadingSaved && (
        <div className="pl-photo-empty">
          <Images size={29}/>
          <p>Paste your photo links above to create a carousel.</p>
        </div>
      )}
    </section>
  )
}
