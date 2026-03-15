import { useState, useEffect } from 'react'

interface Connection {
  provider_config_key: string
}

interface EmailHeader {
  name: string
  value: string
}

interface Email {
  id: string
  subject: string
  from: string
  date: string
}

function getHeader(headers: EmailHeader[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function GmailTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [emails, setEmails] = useState<Email[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        const isConnected = connections.some(c => c.provider_config_key === 'google-mail')
        setConnected(isConnected)
        if (isConnected) loadEmails()
      })
      .catch(() => setConnected(false))
  }, [])

  const loadEmails = async () => {
    setLoading(true)
    setError(null)
    try {
      const listRes = await fetch('/api/integration/google-mail/gmail/v1/users/me/messages?maxResults=5&labelIds=INBOX')
      if (!listRes.ok) {
        setError(`Failed to load emails (${listRes.status}).`)
        return
      }
      const listData = await listRes.json()
      const messages: { id: string }[] = listData.messages ?? []

      const fetched = await Promise.all(
        messages.map(async ({ id }) => {
          const res = await fetch(
            `/api/integration/google-mail/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
          )
          if (!res.ok) return null
          const msg = await res.json()
          const headers: EmailHeader[] = msg.payload?.headers ?? []
          return {
            id,
            subject: getHeader(headers, 'Subject') || '(No subject)',
            from: getHeader(headers, 'From'),
            date: formatDate(getHeader(headers, 'Date')),
          }
        })
      )

      setEmails(fetched.filter((e): e is Email => e !== null))
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Gmail not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Gmail</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Recent Emails</h3>
          <p className="text-sm text-gray-500">Your 5 most recent inbox messages</p>
        </div>
        <button
          onClick={loadEmails}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected === null || (loading && emails === null) ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
      ) : emails !== null && emails.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No emails found.</div>
      ) : emails !== null ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {emails.map(email => (
            <div key={email.id} className="p-4 hover:bg-gray-50">
              <p className="font-medium text-gray-900 truncate">{email.subject}</p>
              <p className="text-sm text-gray-600 mt-0.5 truncate">{email.from}</p>
              {email.date && <p className="text-xs text-gray-400 mt-0.5">{email.date}</p>}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default GmailTab
