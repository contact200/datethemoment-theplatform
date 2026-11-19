import { useEffect, useMemo, useState } from 'react'
import { Images, Link2, Trash2 } from 'lucide-react'

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
}

type Props = {
  organizationId: string
  events: Game[]
}

const emptyDraft = (): PhotoDraft => ({
  urls: [],
  team: '',
  eventId: ''
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
      eventId: typeof data.eventId === 'string' ? data.eventId : ''
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

  const groups = useMemo(() => {
    const result: string[][] = []
    for (let i = 0; i < draft.urls.length; i += 10) {
      result.push(draft.urls.slice(i, i + 10))
    }
    return result
  }, [draft.urls])

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
        <span className="pl-tag">10 PHOTOS PER CAROUSEL</span>
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
      </div>

      {draft.urls.length > 0 && (
        <>
          <div className="pl-photo-summary">
            <div><strong>{draft.urls.length}</strong><span>Photos</span></div>
            <div><strong>{groups.length}</strong><span>Carousels</span></div>
            <div><strong>{Math.min(10, draft.urls.length)}</strong><span>Max per post</span></div>
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
                <span>{urls.length} / 10 photos</span>
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
            Prototype: this preview is saved in this browser only.
            Nothing has been published or sent to Supabase yet.
          </p>
        </>
      )}

      {!draft.urls.length && (
        <div className="pl-photo-empty">
          <Images size={29}/>
          <p>Your photo carousels will appear here.</p>
        </div>
      )}
    </section>
  )
}
