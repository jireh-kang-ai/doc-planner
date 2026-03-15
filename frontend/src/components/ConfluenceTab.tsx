import { useState, useEffect } from 'react'

interface Connection {
  provider_config_key: string
}

interface ConfluencePage {
  id: string
  title: string
  spaceId?: string
  version?: { createdAt: string }
  _links?: { editui?: string; webui?: string; base?: string }
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ConfluenceTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [pages, setPages] = useState<ConfluencePage[] | null>(null)
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        const isConnected = connections.some(c => c.provider_config_key === 'confluence')
        setConnected(isConnected)
        if (isConnected) loadPages()
      })
      .catch(() => setConnected(false))
  }, [])

  const loadPages = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '5', sort: '-modified-date' })
      const res = await fetch(`/api/integration/confluence/wiki/api/v2/pages?${params}`)
      if (!res.ok) {
        let msg = `Failed to load pages (${res.status}).`
        try {
          const errData = await res.json()
          if (errData?.message) msg += ` ${errData.message}`
        } catch { /* ignore */ }
        setError(msg)
        return
      }
      const data = await res.json()
      setBaseUrl(data._links?.base ?? '')
      setPages(data.results ?? [])
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Confluence not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Confluence</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Recent Pages</h3>
          <p className="text-sm text-gray-500">5 most recently modified Confluence pages</p>
        </div>
        <button
          onClick={loadPages}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected === null || (loading && pages === null) ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
      ) : pages !== null && pages.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No pages found.</div>
      ) : pages !== null ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {pages.map(page => {
            const path = page._links?.editui ?? page._links?.webui
            const url = path ? baseUrl + path : undefined
            return (
              <div key={page.id} className="p-4 hover:bg-gray-50 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{page.title}</p>
                  {page.version?.createdAt && (
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(page.version.createdAt)}</p>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    Open →
                  </a>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default ConfluenceTab
