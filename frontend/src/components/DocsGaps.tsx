import { useEffect, useState } from 'react'
import { Doc, STATUS_COLORS, listDocs, updateDoc } from '../lib/docsApi'

interface Group {
  sidebar: string
  section: string
  docs: Doc[]
}

function groupDocs(docs: Doc[]): Group[] {
  const map = new Map<string, Group>()
  for (const d of docs) {
    const key = `${d.sidebar}||${d.section}`
    if (!map.has(key)) map.set(key, { sidebar: d.sidebar, section: d.section, docs: [] })
    map.get(key)!.docs.push(d)
  }
  // Sort groups: first by sprint (nearest first), then alphabetically
  return [...map.values()].sort((a, b) => {
    const aMin = a.docs.map(d => d.target_sprint ?? 'zzzz').sort()[0]
    const bMin = b.docs.map(d => d.target_sprint ?? 'zzzz').sort()[0]
    if (aMin !== bMin) return aMin.localeCompare(bMin)
    return `${a.sidebar}${a.section}`.localeCompare(`${b.sidebar}${b.section}`)
  })
}

export default function DocsGaps() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const d = await listDocs({ status: 'In Progress,Planned' })
      setDocs(d)
      setError('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const markPublished = async (doc: Doc) => {
    await updateDoc(doc.id, { status: 'Published' })
    await load()
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
  if (error) return <div className="p-6 text-red-600 bg-red-50 m-4 rounded-lg">{error}</div>

  const groups = groupDocs(docs)

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <div className="text-5xl mb-3">🎉</div>
        <div className="text-lg font-medium text-gray-600">No gaps — all docs are published!</div>
      </div>
    )
  }

  return (
    <div className="p-4 overflow-auto h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Gaps</h2>
        <span className="text-sm text-gray-500">{docs.length} unpublished doc{docs.length !== 1 ? 's' : ''} across {groups.length} section{groups.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-5">
        {groups.map(group => (
          <div key={`${group.sidebar}||${group.section}`} className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
            {/* Group header */}
            <div className="bg-gray-50 px-4 py-2.5 border-b flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500">{group.sidebar}</span>
              {group.section && (
                <>
                  <span className="text-gray-300">›</span>
                  <span className="text-sm font-medium text-gray-700">{group.section}</span>
                </>
              )}
              <span className="ml-auto bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium">
                {group.docs.length} gap{group.docs.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Docs in group */}
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {group.docs
                  .sort((a, b) => (a.target_sprint ?? 'zzzz').localeCompare(b.target_sprint ?? 'zzzz'))
                  .map(doc => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{doc.label}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status]}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-blue-700 font-mono text-xs">
                        {doc.target_sprint ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {doc.jira_ticket_url ? (
                          <a href={doc.jira_ticket_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Jira ↗</a>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => markPublished(doc)}
                          className="px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs rounded font-medium transition-colors"
                        >
                          Mark published
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
