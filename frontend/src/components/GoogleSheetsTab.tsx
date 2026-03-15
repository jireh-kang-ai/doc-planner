import { useState, useEffect } from 'react'
import { extractGoogleId } from '../lib/googleId'

interface Connection {
  provider_config_key: string
}

function GoogleSheetsTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [input, setInput] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        setConnected(connections.some(c => c.provider_config_key === 'google-sheet'))
      })
      .catch(() => setConnected(false))
  }, [])

  const handleLoad = async () => {
    const id = extractGoogleId(input)
    if (!id) return
    setLoading(true)
    setError(null)
    setRows(null)
    try {
      const res = await fetch(`/api/integration/sheets/v4/spreadsheets/${id}/values/A1:Z200`)
      if (!res.ok) {
        setError(`Failed to load spreadsheet (${res.status}). Check the URL and make sure you have access.`)
        return
      }
      const data = await res.json()
      setRows(data.values ?? [])
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Google Sheets not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Google Sheets</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  const headers = rows && rows.length > 0 ? rows[0] : []
  const dataRows = rows && rows.length > 1 ? rows.slice(1) : []

  return (
    <div className="space-y-4">
      {/* URL input */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Google Sheets URL or Spreadsheet ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            placeholder="https://docs.google.com/spreadsheets/d/... or paste the spreadsheet ID"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleLoad}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Table viewer */}
      {rows !== null && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No data found in this spreadsheet range.</div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide border-b whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-4 py-2 text-gray-700 border-b border-gray-100 whitespace-nowrap">
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GoogleSheetsTab
