import { useState, useEffect } from 'react'

interface Connection {
  provider_config_key: string
}

interface CalendarEvent {
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  location?: string
  htmlLink?: string
}

function formatEventTime(start?: { dateTime?: string; date?: string }): string {
  if (!start) return 'No time'
  if (start.dateTime) {
    return new Date(start.dateTime).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }
  if (start.date) {
    return new Date(start.date + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    }) + ' (all day)'
  }
  return 'No time'
}

function GoogleCalendarTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        const isConnected = connections.some(c => c.provider_config_key === 'google-calendar')
        setConnected(isConnected)
        if (isConnected) loadEvents()
      })
      .catch(() => setConnected(false))
  }, [])

  const loadEvents = async () => {
    setLoading(true)
    setError(null)
    try {
      const timeMin = new Date().toISOString()
      const res = await fetch(
        `/api/integration/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=5&orderBy=startTime&singleEvents=true`
      )
      if (!res.ok) {
        let msg = `Failed to load events (${res.status}).`
        try {
          const errData = await res.json()
          if (errData?.error?.message) msg += ` ${errData.error.message}`
          else if (typeof errData?.error === 'string') msg += ` ${errData.error}`
        } catch { /* ignore parse error */ }
        setError(msg)
        return
      }
      const data = await res.json()
      setEvents(data.items ?? [])
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Google Calendar not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Google Calendar</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Upcoming Events</h3>
          <p className="text-sm text-gray-500">Next 5 events from your primary calendar</p>
        </div>
        <button
          onClick={loadEvents}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected === null || (loading && events === null) ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
      ) : events !== null && events.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No upcoming events found.</div>
      ) : events !== null ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {events.map((event, i) => (
            <div key={i} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{event.summary ?? '(No title)'}</p>
                  <p className="text-sm text-blue-600 mt-0.5">{formatEventTime(event.start)}</p>
                  {event.location && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {event.location}</p>
                  )}
                </div>
                {event.htmlLink && (
                  <a
                    href={event.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    Open →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default GoogleCalendarTab
