import { useEffect, useState } from 'react'
import { Doc, DocsMeta, STATUS_COLORS, STATUSES, listDocs, createDoc, updateDoc, deleteDoc, getDocsMeta } from '../lib/docsApi'

interface EditState {
  [id: number]: Partial<Doc>
}

export default function DocsPlanned() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [meta, setMeta] = useState<DocsMeta>({ sidebars: [], sections: [], sprints: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [edits, setEdits] = useState<EditState>({})
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState<Partial<Doc>>({ status: 'Planned', section: '' })
  const [addError, setAddError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const [d, m] = await Promise.all([
        listDocs({ status: 'Planned' }),
        getDocsMeta(),
      ])
      setDocs(d)
      setMeta(m)
      setError('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const getField = (doc: Doc, field: keyof Doc): string => {
    const edited = edits[doc.id]
    if (edited && field in edited) return (edited[field] as string) ?? ''
    return (doc[field] as string) ?? ''
  }

  const setField = (id: number, field: keyof Doc, value: string | null) => {
    setEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const saveRow = async (doc: Doc) => {
    const changes = edits[doc.id]
    if (!changes || Object.keys(changes).length === 0) return
    try {
      setSaving(prev => new Set(prev).add(doc.id))
      await updateDoc(doc.id, changes)
      setEdits(prev => { const next = { ...prev }; delete next[doc.id]; return next })
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(prev => { const next = new Set(prev); next.delete(doc.id); return next })
    }
  }

  const handleDelete = async (doc: Doc) => {
    if (!window.confirm(`Delete "${doc.label}"? This cannot be undone.`)) return
    await deleteDoc(doc.id)
    await load()
  }

  const handleAddRow = async () => {
    if (!newRow.doc_id?.trim() || !newRow.label?.trim() || !newRow.sidebar?.trim()) {
      setAddError('Doc path, title, and sidebar are required.')
      return
    }
    try {
      await createDoc({ ...newRow, status: 'Planned' })
      setAddingRow(false)
      setNewRow({ status: 'Planned', section: '' })
      setAddError('')
      await load()
    } catch (e: any) {
      setAddError(e.message)
    }
  }

  const inputClass = 'w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-white'
  const cellClass = 'px-3 py-2 align-top'

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
  if (error) return <div className="p-6 text-red-600 bg-red-50 m-4 rounded-lg">{error}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 bg-white border-b flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Planned docs</h2>
          <p className="text-xs text-gray-400">{docs.length} doc{docs.length !== 1 ? 's' : ''} planned</p>
        </div>
        <button
          onClick={() => setAddingRow(true)}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
        >
          + Add Planned Doc
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {docs.length === 0 && !addingRow ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <div className="text-3xl mb-2">📋</div>
            <div>No planned docs yet</div>
            <button onClick={() => setAddingRow(true)} className="mt-2 text-blue-600 text-sm hover:underline">Add the first one</button>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Doc path</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sidebar</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Section</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sprint</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Jira</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Add new row */}
              {addingRow && (
                <tr className="bg-blue-50">
                  <td className={cellClass}>
                    <input className={inputClass} placeholder="Title *" value={newRow.label ?? ''} onChange={e => setNewRow(r => ({ ...r, label: e.target.value }))} />
                    {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
                  </td>
                  <td className={cellClass}><input className={`${inputClass} font-mono`} placeholder="path/to/doc *" value={newRow.doc_id ?? ''} onChange={e => setNewRow(r => ({ ...r, doc_id: e.target.value }))} /></td>
                  <td className={cellClass}>
                    <input list="plan-sidebar-list" className={inputClass} placeholder="sidebar" value={newRow.sidebar ?? ''} onChange={e => setNewRow(r => ({ ...r, sidebar: e.target.value }))} />
                    <datalist id="plan-sidebar-list">{meta.sidebars.map(s => <option key={s} value={s} />)}</datalist>
                  </td>
                  <td className={cellClass}>
                    <input list="plan-section-list" className={inputClass} placeholder="section" value={newRow.section ?? ''} onChange={e => setNewRow(r => ({ ...r, section: e.target.value }))} />
                    <datalist id="plan-section-list">{meta.sections.map(s => <option key={s} value={s} />)}</datalist>
                  </td>
                  <td className={cellClass}>
                    <select className={inputClass} value={newRow.status ?? 'Planned'} onChange={e => setNewRow(r => ({ ...r, status: e.target.value as Doc['status'] }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={cellClass}>
                    <select className={inputClass} value={newRow.target_sprint ?? ''} onChange={e => setNewRow(r => ({ ...r, target_sprint: e.target.value || null }))}>
                      <option value="">—</option>
                      {meta.sprints.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={cellClass}><input className={inputClass} placeholder="https://jira..." value={newRow.jira_ticket_url ?? ''} onChange={e => setNewRow(r => ({ ...r, jira_ticket_url: e.target.value || null }))} /></td>
                  <td className={cellClass}><input className={inputClass} placeholder="Notes" value={newRow.notes ?? ''} onChange={e => setNewRow(r => ({ ...r, notes: e.target.value || null }))} /></td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    <button onClick={handleAddRow} className="px-2 py-1 bg-blue-600 text-white text-xs rounded mr-1">Save</button>
                    <button onClick={() => { setAddingRow(false); setNewRow({ status: 'Planned', section: '' }); setAddError('') }} className="text-gray-400 text-xs">✕</button>
                  </td>
                </tr>
              )}

              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50 group">
                  <td className={cellClass}>
                    <input
                      className={inputClass}
                      value={getField(doc, 'label')}
                      onChange={e => setField(doc.id, 'label', e.target.value)}
                      onBlur={() => saveRow(doc)}
                    />
                  </td>
                  <td className={cellClass}>
                    <input
                      className={`${inputClass} font-mono text-xs`}
                      value={getField(doc, 'doc_id')}
                      onChange={e => setField(doc.id, 'doc_id', e.target.value)}
                      onBlur={() => saveRow(doc)}
                    />
                  </td>
                  <td className={cellClass}>
                    <input
                      list="plan-sidebar-list-edit"
                      className={inputClass}
                      value={getField(doc, 'sidebar')}
                      onChange={e => setField(doc.id, 'sidebar', e.target.value)}
                      onBlur={() => saveRow(doc)}
                    />
                    <datalist id="plan-sidebar-list-edit">{meta.sidebars.map(s => <option key={s} value={s} />)}</datalist>
                  </td>
                  <td className={cellClass}>
                    <input
                      list="plan-section-list-edit"
                      className={inputClass}
                      value={getField(doc, 'section')}
                      onChange={e => setField(doc.id, 'section', e.target.value)}
                      onBlur={() => saveRow(doc)}
                    />
                    <datalist id="plan-section-list-edit">{meta.sections.map(s => <option key={s} value={s} />)}</datalist>
                  </td>
                  <td className={cellClass}>
                    <select
                      className={inputClass}
                      value={getField(doc, 'status') || doc.status}
                      onChange={e => { setField(doc.id, 'status', e.target.value); setTimeout(() => saveRow(doc), 0) }}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={cellClass}>
                    <select
                      className={inputClass}
                      value={getField(doc, 'target_sprint') || doc.target_sprint || ''}
                      onChange={e => { setField(doc.id, 'target_sprint', e.target.value || null); setTimeout(() => saveRow(doc), 0) }}
                    >
                      <option value="">—</option>
                      {meta.sprints.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={cellClass}>
                    <input
                      className={inputClass}
                      placeholder="https://jira..."
                      value={getField(doc, 'jira_ticket_url')}
                      onChange={e => setField(doc.id, 'jira_ticket_url', e.target.value || null)}
                      onBlur={() => saveRow(doc)}
                    />
                  </td>
                  <td className={cellClass}>
                    <input
                      className={inputClass}
                      value={getField(doc, 'notes')}
                      onChange={e => setField(doc.id, 'notes', e.target.value || null)}
                      onBlur={() => saveRow(doc)}
                    />
                  </td>
                  <td className={`${cellClass} whitespace-nowrap`}>
                    {saving.has(doc.id) ? (
                      <span className="text-xs text-gray-400">Saving...</span>
                    ) : (
                      <button
                        onClick={() => handleDelete(doc)}
                        className="hidden group-hover:block text-red-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50"
                      >🗑</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status legend */}
      <div className="px-4 py-2 border-t bg-gray-50 shrink-0 flex gap-3">
        {STATUSES.map(s => (
          <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s]}`}>{s}</span>
        ))}
        <span className="text-xs text-gray-400 ml-2">Changes auto-save on blur</span>
      </div>
    </div>
  )
}
