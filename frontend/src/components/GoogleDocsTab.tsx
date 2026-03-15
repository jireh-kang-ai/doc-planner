import { useState, useEffect } from 'react'
import { extractGoogleId } from '../lib/googleId'

interface Connection {
  provider_config_key: string
}

interface DocParagraph {
  elements?: { textRun?: { content?: string } }[]
}

interface DocContent {
  content?: { paragraph?: DocParagraph }[]
}

interface GoogleDoc {
  title?: string
  body?: DocContent
}

function extractParagraphs(doc: GoogleDoc): string[] {
  const paragraphs: string[] = []
  for (const element of doc.body?.content ?? []) {
    if (!element.paragraph) continue
    const text = (element.paragraph.elements ?? [])
      .map(e => e.textRun?.content ?? '')
      .join('')
      .replace(/\n$/, '')
    if (text.trim()) paragraphs.push(text)
  }
  return paragraphs
}

function GoogleDocsTab() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [input, setInput] = useState('')
  const [doc, setDoc] = useState<GoogleDoc | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then(data => {
        const connections: Connection[] = data.connections ?? []
        setConnected(connections.some(c => c.provider_config_key === 'google-docs'))
      })
      .catch(() => setConnected(false))
  }, [])

  const handleLoad = async () => {
    const id = extractGoogleId(input)
    if (!id) return
    setLoading(true)
    setError(null)
    setDoc(null)
    try {
      const res = await fetch(`/api/integration/docs/v1/documents/${id}`)
      if (!res.ok) {
        setError(`Failed to load document (${res.status}). Check the URL and make sure you have access.`)
        return
      }
      setDoc(await res.json())
    } catch {
      setError('Network error — could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  if (connected === false) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium">Google Docs not connected</p>
        <p className="text-yellow-700 text-sm mt-1">Click the <strong>Google Docs</strong> pill in the integration bar above to connect your account.</p>
      </div>
    )
  }

  const paragraphs = doc ? extractParagraphs(doc) : []

  return (
    <div className="space-y-4">
      {/* URL input */}
      <div className="bg-white rounded-lg shadow p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Google Docs URL or Document ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
            placeholder="https://docs.google.com/document/d/... or paste the document ID"
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

      {/* Document viewer */}
      {doc && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-bold text-gray-900">{doc.title ?? 'Untitled'}</h2>
          </div>
          <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {paragraphs.length === 0 ? (
              <p className="text-gray-500 text-sm">This document appears to be empty.</p>
            ) : (
              paragraphs.map((p, i) => (
                <p key={i} className="text-gray-700 text-sm leading-relaxed">{p}</p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleDocsTab
