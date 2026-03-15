import { useState, useEffect } from 'react'
import { useStatus } from '../App'
import { isBuildingResponse } from '../lib/api'
import SlackSetupModal from './SlackSetupModal'

interface EventLog {
  id: string
  type: string
  user: string
  channel: string
  text: string
  timestamp: string
}

function SlackBotTab() {
  const status = useStatus()
  const [showModal, setShowModal] = useState(false)
  const [events, setEvents] = useState<EventLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events')
      if (await isBuildingResponse(response)) return
      const data = await response.json()
      if (data.success) setEvents(data.events || [])
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString()

  return (
    <div className="space-y-6">
      {showModal && <SlackSetupModal onClose={() => setShowModal(false)} />}

      {/* Status card */}
      <div className={`rounded-lg p-4 border ${status.ready ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${status.ready ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <p className={`font-medium ${status.ready ? 'text-green-800' : 'text-red-800'}`}>
                {status.ready ? 'Slack Bot Connected' : 'Slack Bot Not Connected'}
              </p>
              <p className={`text-sm mt-0.5 ${status.ready ? 'text-green-600' : 'text-red-600'}`}>
                {status.message}
              </p>
            </div>
          </div>
          {!status.ready && (
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              How to connect
            </button>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b">
          <h3 className="font-medium text-gray-800">Recent Bot Events</h3>
          <p className="text-sm text-gray-500 mt-0.5">Live feed of Slack events received by your bot</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No events yet. Try mentioning the bot or sending it a DM!</div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {events.map(event => (
              <div key={event.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{event.type}</span>
                  <span className="text-xs text-gray-400">{formatTime(event.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-800">{event.text || '(no text)'}</p>
                {(event.user || event.channel) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {event.user && <span>User: {event.user}</span>}
                    {event.channel && <span className="ml-3">Channel: {event.channel}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SlackBotTab
