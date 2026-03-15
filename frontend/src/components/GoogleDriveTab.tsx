import { useState, useEffect } from 'react'

interface Connection {
  provider_config_key: string
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  viewedByMeTime?: string
  modifiedTime?: string
  webViewLink?: string
}

function friendlyType(mimeType: string): string {
  const map: Record<string, string> = {
    'application/vnd.google-apps.document': 'Doc',
    'application/vnd.google-apps.spreadsheet': 'Sheet',
    'application/vnd.google-apps.presentation': 'Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/pdf': 'PDF',
  }
  return map[mimeType] ?? 'File'
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function GoogleDriveTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        const isConnected = connections.some(c => c.provider_config_key === 'google-drive')
        setConnected(isConnected)
        if (isConnected) loadFiles()
      })
      .catch(() => setConnected(false))
  }, [])

  const loadFiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        pageSize: '5',
        orderBy: 'viewedByMeTime desc',
        fields: 'files(id,name,mimeType,viewedByMeTime,modifiedTime,webViewLink)',
      })
      const res = await fetch(`/api/integration/drive/v3/files?${params}`)
      if (!res.ok) {
        setError(`Failed to load files (${res.status}).`)
        return
      }
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Google Drive not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Google Drive</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Recent Files</h3>
          <p className="text-sm text-gray-500">5 most recently viewed files in your Drive</p>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected === null || (loading && files === null) ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">Loading...</div>
      ) : files !== null && files.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No recent files found.</div>
      ) : files !== null ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {files.map(file => (
            <div key={file.id} className="p-4 hover:bg-gray-50 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">
                    {friendlyType(file.mimeType)}
                  </span>
                  <p className="font-medium text-gray-900 truncate">{file.name}</p>
                </div>
                {file.viewedByMeTime && (
                  <p className="text-xs text-gray-400 mt-0.5">Viewed {formatTime(file.viewedByMeTime)}</p>
                )}
              </div>
              {file.webViewLink && (
                <a
                  href={file.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline shrink-0"
                >
                  Open →
                </a>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default GoogleDriveTab
