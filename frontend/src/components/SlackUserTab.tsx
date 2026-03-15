import { useState, useEffect } from 'react'

interface Connection {
  provider_config_key: string
}

interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  num_members?: number
  topic?: { value: string }
}

function SlackUserTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [channels, setChannels] = useState<SlackChannel[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        const isConnected = connections.some(c => c.provider_config_key === 'slack')
        setConnected(isConnected)
        if (isConnected) loadChannels()
      })
      .catch(() => setConnected(false))
  }, [])

  const loadChannels = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
        limit: '5',
      })
      const res = await fetch(`/api/integration/slack/conversations.list?${params}`)
      if (!res.ok) {
        setError(`Failed to load channels (${res.status}).`)
        return
      }
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Slack returned an error.')
        return
      }
      setChannels(data.channels ?? [])
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Slack User not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Slack User</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Your Channels</h3>
          <p className="text-sm text-gray-500">5 channels you're a member of</p>
        </div>
        <button
          onClick={loadChannels}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected === null || (loading && channels === null) ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
      ) : channels !== null && channels.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No channels found.</div>
      ) : channels !== null ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {channels.map(channel => (
            <div key={channel.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">{channel.is_private ? '🔒' : '#'}</span>
                <p className="font-medium text-gray-900">{channel.name}</p>
                {channel.num_members !== undefined && (
                  <span className="text-xs text-gray-400 ml-auto">{channel.num_members} members</span>
                )}
              </div>
              {channel.topic?.value && (
                <p className="text-xs text-gray-500 mt-0.5 truncate ml-5">{channel.topic.value}</p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default SlackUserTab
