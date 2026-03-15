import { useState, useEffect } from 'react'

interface Connection {
  provider_config_key: string
}

interface JiraIssue {
  key: string
  fields: {
    summary: string
    status: { name: string }
    priority?: { name: string }
    assignee?: { displayName: string }
    updated: string
  }
}

function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'bg-green-100 text-green-700'
  if (s.includes('progress') || s.includes('review')) return 'bg-blue-100 text-blue-700'
  if (s.includes('block')) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function JiraTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [issues, setIssues] = useState<JiraIssue[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        const isConnected = connections.some(c => c.provider_config_key === 'jira')
        setConnected(isConnected)
        if (isConnected) loadIssues()
      })
      .catch(() => setConnected(false))
  }, [])

  const loadIssues = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        jql: 'assignee = currentUser() ORDER BY updated DESC',
        maxResults: '5',
        fields: 'summary,status,priority,assignee,updated',
      })
      const res = await fetch(`/api/integration/jira/rest/api/3/search/jql?${params}`)
      if (!res.ok) {
        let msg = `Failed to load issues (${res.status}).`
        try {
          const errData = await res.json()
          if (errData?.errorMessages?.length) msg += ` ${errData.errorMessages[0]}`
        } catch { /* ignore */ }
        setError(msg)
        return
      }
      const data = await res.json()
      setIssues(data.issues ?? [])
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Jira not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Jira</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">My Issues</h3>
          <p className="text-sm text-gray-500">5 most recently updated issues assigned to you</p>
        </div>
        <button
          onClick={loadIssues}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected === null || (loading && issues === null) ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
      ) : issues !== null && issues.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No issues assigned to you.</div>
      ) : issues !== null ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {issues.map(issue => (
            <div key={issue.key} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-medium text-gray-500 shrink-0">{issue.key}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusColor(issue.fields.status.name)}`}>
                      {issue.fields.status.name}
                    </span>
                    {issue.fields.priority && (
                      <span className="text-xs text-gray-400">{issue.fields.priority.name}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{issue.fields.summary}</p>
                </div>
                <p className="text-xs text-gray-400 shrink-0">{formatUpdated(issue.fields.updated)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default JiraTab
