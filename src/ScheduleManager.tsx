import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FileText, RefreshCw, Trash2 } from 'lucide-react'

type Schedule = {
  id: string
  filename: string
  storage_path: string | null
  created_at: string
  gameCount: number | null
}

type Props = {
  client: SupabaseClient
  organizationId: string
  onDeleted: () => Promise<unknown> | void
}

export default function ScheduleManager({
  client, organizationId, onDeleted
}: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)

    try {
      const { data, error: loadError } = await client
        .from('schedules')
        .select('id, filename, storage_path, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (loadError) throw loadError

      const rows = await Promise.all((data || []).map(async s => {
        const { count, error: countError } = await client
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('schedule_id', s.id)

        return {
          ...s,
          gameCount: countError ? null : count
        }
      }))

      setSchedules(rows)
      setSelected(current =>
        current.filter(id => rows.some(row => row.id === id))
      )
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loading failed')
    } finally {
      setLoading(false)
    }
  }, [client, organizationId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function removeSchedule(schedule: Schedule) {
    if (!window.confirm(
      `Delete "${schedule.filename}"?\n\n` +
      `This removes its imported games and captions.\n` +
      `This action cannot be undone.`
    )) return

    setDeleting(schedule.id)
    setMessage('')
    setError('')

    try {
      const { data, error: rpcError } = await client.rpc(
        'dtm_delete_schedule',
        { p_schedule_id: schedule.id }
      )

      if (rpcError) throw rpcError

      const result = data as {
        storage_path?: string
        deleted_games?: number
      } | null

      const path = result?.storage_path || schedule.storage_path
      let warning = ''

      if (path) {
        const { error: storageError } = await client.storage
          .from('dtm-schedules')
          .remove([path])

        if (storageError) {
          warning = ' Original PDF storage cleanup failed: ' +
            storageError.message
        }
      }

      await refresh()
      await onDeleted()

      setMessage(
        `Deleted "${schedule.filename}" and ` +
        `${result?.deleted_games ?? 0} calendar games.` +
        warning
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deletion failed')
    } finally {
      setDeleting(null)
    }
  }


  const allSelected =
    schedules.length > 0 &&
    schedules.every(s => selected.includes(s.id))

  async function deleteSelected() {
    const targets = schedules.filter(s => selected.includes(s.id))
    if (!targets.length) return

    const gameCount = targets.reduce(
      (total, s) => total + (s.gameCount || 0), 0
    )

    const confirmed = window.confirm(
      `Permanently delete ${targets.length} selected schedule(s)?\n\n` +
      `This will also delete approximately ${gameCount} calendar games ` +
      `and their associated captions.\n\n` +
      `This cannot be undone.`
    )

    if (!confirmed) return

    setDeleting('bulk')
    setError('')
    setMessage('')

    let removed = 0
    let removedGames = 0
    const storageWarnings: string[] = []

    try {
      for (const schedule of targets) {
        const { data, error: rpcError } = await client.rpc(
          'dtm_delete_schedule',
          { p_schedule_id: schedule.id }
        )

        if (rpcError) {
          throw new Error(
            `Stopped at "${schedule.filename}": ${rpcError.message}`
          )
        }

        removed++

        const result = data as {
          storage_path?: string
          deleted_games?: number
        } | null

        removedGames += result?.deleted_games || 0

        const path = result?.storage_path || schedule.storage_path

        if (path) {
          const { error: storageError } = await client.storage
            .from('dtm-schedules')
            .remove([path])

          if (storageError) {
            storageWarnings.push(schedule.filename)
          }
        }
      }
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : 'Bulk deletion failed.') +
        ` ${removed} of ${targets.length} schedules were deleted.`
      )
    } finally {
      if (removed > 0) {
        await refresh()
        setSelected([])
        setMessage(
          `Deleted ${removed} schedule(s) and ${removedGames} calendar games.` +
          (storageWarnings.length
            ? ` PDF storage cleanup failed for ${storageWarnings.length} file(s).`
            : '')
        )
        try {
          await onDeleted()
        } catch {
          setError('Schedules deleted, but calendar refresh failed.')
        }
      }
      setDeleting(null)
    }
  }

  return (
    <details className="pl-panel">
      <summary style={{ cursor: 'pointer', fontWeight: 650 }}>
        Uploaded Schedules ({schedules.length})
      </summary>
      <div className="pl-panel-heading">
        <h2><FileText size={21} /> Manage Files</h2>
        <button className="pl-outline"
          disabled={loading || !!deleting}
          onClick={() => void refresh()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {error && <p className="pl-error">{error}</p>}
      {message && <p className="pl-muted">{message}</p>}
      {loading && <p className="pl-muted">Loading schedules…</p>}

      {!loading && schedules.length === 0 && (
        <p className="pl-muted">No uploaded schedules.</p>
      )}

      {!loading && schedules.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16
        }}>
          <button
            className="pl-outline"
            disabled={!!deleting}
            onClick={() => setSelected(
              allSelected ? [] : schedules.map(s => s.id)
            )}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>

          <span className="pl-muted" style={{ fontSize: 13 }}>
            {selected.length} of {schedules.length} selected
          </span>

          <button
            className="pl-outline"
            style={{ color: '#d9534f' }}
            disabled={!selected.length || !!deleting}
            onClick={() => void deleteSelected()}
          >
            <Trash2 size={15} />
            {deleting === 'bulk'
              ? 'Deleting…'
              : `Delete Selected (${selected.length})`}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {schedules.map(s => (
          <div key={s.id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            border: '1px solid #7775',
            borderRadius: 12,
            flexWrap: 'wrap'
          }}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={!!deleting}
              aria-label={`Select ${s.filename}`}
              onChange={e => setSelected(current =>
                e.target.checked
                  ? [...current, s.id]
                  : current.filter(id => id !== s.id)
              )}
              style={{ width: 19, height: 19, cursor: 'pointer' }}
            />
            <div style={{ flex: 1, minWidth: 160 }}>
              <strong>{s.filename}</strong>
              <div className="pl-muted" style={{ fontSize: 12 }}>
                {new Date(s.created_at).toLocaleString()}
              </div>
              <div className="pl-muted" style={{ fontSize: 12 }}>
                {s.gameCount === null
                  ? 'Game count unavailable'
                  : `${s.gameCount} calendar games`}
              </div>
            </div>

            <button className="pl-outline"
              style={{ color: '#d9534f' }}
              disabled={!!deleting}
              onClick={() => void removeSchedule(s)}>
              <Trash2 size={15} />
              {deleting === s.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        ))}
      </div>
    </details>
  )
}
