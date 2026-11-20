import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'

type Team = {
  id: string
  team_name: string
  aliases: string[]
}

const client = supabase!

function parseAliases(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))]
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function TeamManagement({ organizationId }: { organizationId: string }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAliases, setEditAliases] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const { data, error } = await client
      .from('organization_teams')
      .select('id,team_name,aliases')
      .eq('organization_id', organizationId)
      .order('team_name')

    if (error) throw error
    setTeams((data || []) as Team[])
  }, [organizationId])

  useEffect(() => {
    void refresh().catch(e => setError(message(e)))
  }, [refresh])

  async function addTeam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const { error } = await client.from('organization_teams').insert({
        organization_id: organizationId,
        team_name: name.trim(),
        aliases: parseAliases(aliases)
      })
      if (error) throw error
      setName('')
      setAliases('')
      await refresh()
      setNotice('Team registered successfully.')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveTeam(id: string) {
    setBusy(true)
    setError('')
    try {
      const { error } = await client.from('organization_teams')
        .update({
          team_name: editName.trim(),
          aliases: parseAliases(editAliases)
        })
        .eq('id', id)
        .eq('organization_id', organizationId)

      if (error) throw error
      setEditing(null)
      await refresh()
      setNotice('Team updated.')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteTeam(team: Team) {
    if (!window.confirm('Delete ' + team.team_name + '?')) return
    setBusy(true)
    setError('')
    try {
      const { error } = await client.from('organization_teams')
        .delete()
        .eq('id', team.id)
        .eq('organization_id', organizationId)

      if (error) throw error
      await refresh()
      setNotice('Team deleted.')
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pl-title">
        <div>
          <span className="pl-kicker">CLUB MANAGEMENT</span>
          <h1>Your teams.<br/><em>One club.</em></h1>
          <p>Register your teams so uploaded schedules can identify their matches.</p>
        </div>
      </div>

      <section className="pl-panel">
        <h2>Add a team</h2>
        <form className="pl-event-form" onSubmit={addTeam}>
          <label>
            Official team name
            <input required value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. UnitedMati FC U8 Boys" />
          </label>
          <label>
            Alternative names (one per line)
            <textarea rows={3} value={aliases}
              onChange={e => setAliases(e.target.value)}
              placeholder={'UnitedMati U8\nUMFC U8 Boys'} />
          </label>
          <button className="pl-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add team'}
          </button>
        </form>
        {error && <p className="pl-error">{error}</p>}
        {notice && <p className="pl-success">{notice}</p>}
      </section>

      <section className="pl-panel">
        <h2>Registered teams ({teams.length})</h2>
        {!teams.length && <p className="pl-muted">No teams registered yet.</p>}
        {teams.map(team => (
          <div className="pl-event" key={team.id} style={{display:'block', marginBottom:12}}>
            {editing === team.id ? (
              <div className="pl-event-form">
                <label>Team name
                  <input value={editName} onChange={e => setEditName(e.target.value)} />
                </label>
                <label>Alternative names
                  <textarea rows={3} value={editAliases}
                    onChange={e => setEditAliases(e.target.value)} />
                </label>
                <div className="pl-actions">
                  <button className="pl-primary" disabled={busy || !editName.trim()}
                    onClick={() => void saveTeam(team.id)}>Save changes</button>
                  <button className="pl-outline" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <strong>{team.team_name}</strong>
                <p className="pl-muted">
                  {team.aliases.length
                    ? 'Aliases: ' + team.aliases.join(', ')
                    : 'No alternative names'}
                </p>
                <div className="pl-actions">
                  <button className="pl-outline" onClick={() => {
                    setEditing(team.id)
                    setEditName(team.team_name)
                    setEditAliases(team.aliases.join('\n'))
                  }}>Edit</button>
                  <button className="pl-outline" disabled={busy}
                    onClick={() => void deleteTeam(team)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </section>
    </>
  )
}
