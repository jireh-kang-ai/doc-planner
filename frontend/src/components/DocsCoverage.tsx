import { useEffect, useState, useMemo } from 'react'
import {
  Doc, DocsMeta, STATUS_COLORS, STATUSES,
  listDocs, createDoc, getDocsMeta,
} from '../lib/docsApi'

type SortKey = 'label' | 'sidebar' | 'section' | 'status'

export default function DocsCoverage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [meta, setMeta] = useState<DocsMeta>({ sidebars: [], sections: [], sprints: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [filterSidebar, setFilterSidebar] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('label')
  const [sortAsc, setSortAsc] = useState(true)

  // Add doc modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<Partial<Doc>>({ status: 'Planned', section: '' })
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [d, m] = await Promise.all([
        listDocs({ sidebar: filterSidebar, section: filterSection, status: filterStatus }),
        getDocsMeta(filterSidebar),
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

  useEffect(() => { load() }, [filterSidebar, filterSection, filterStatus])

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [docs, sortKey, sortAsc])

  const published = docs.filter(d => d.status === 'Published').length
  const inProgress = docs.filter(d => d.status === 'In Progress').length
  const planned = docs.filter(d => d.status === 'Planned').length
  const pctPublished = docs.length ? Math.round((published / docs.length) * 100) : 0

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
  }

  const handleAdd = async () => {
    if (!addForm.doc_id?.trim() || !addForm.label?.trim() || !addForm.sidebar?.trim()) {
      setAddError('Doc path, title, and sidebar are required.')
      return
    }
    try {
      setSaving(true)
      setAddError('')
      await createDoc(addForm)
      setShowAdd(false)
      setAddForm({ status: 'Planned', section: '' })
      await load()
    } catch (e: any) {
      setAddError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const thClass = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800'

  return (
    <div className="flex flex-col h-full">
      {/* Summary Banner */}
      <div className="grid grid-cols-4 gap-4 p-4 bg-white border-b shrink-0">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-800">{docs.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total docs</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{pctPublished}%</div>
          <div className="text-xs text-gray-500 mt-1">Published</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-700">{inProgress}</div>
          <div className="text-xs text-gray-500 mt-1">In Progress</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-600">{planned}</div>
          <div className="text-xs text-gray-500 mt-1">Planned</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b shrink-0 flex-wrap">
        <select
          value={filterSidebar}
          onChange={e => { setFilterSidebar(e.target.value); setFilterSection('') }}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All sidebars</option>
          {meta.sidebars.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterSection}
          onChange={e => setFilterSection(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All sections</option>
          {meta.sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          + Add Doc
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="p-6 text-red-600 bg-red-50 m-4 rounded-lg">{error}</div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <div className="text-4xl mb-2">📄</div>
            <div>No docs found</div>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className={thClass} onClick={() => handleSort('label')}>Title <SortIcon k="label" /></th>
                <th className={thClass} onClick={() => handleSort('sidebar')}>Sidebar <SortIcon k="sidebar" /></th>
                <th className={thClass} onClick={() => handleSort('section')}>Section <SortIcon k="section" /></th>
                <th className={thClass} onClick={() => handleSort('status')}>Status <SortIcon k="status" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(doc => (
                <DocRow key={doc.id} doc={doc} meta={meta} onUpdated={load} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Doc Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Doc</h2>
            {addError && <div className="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded">{addError}</div>}
            <div className="space-y-3">
              <Field label="Doc path *" hint="e.g. traceability/tutorials/linking_code">
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.doc_id ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, doc_id: e.target.value }))}
                  placeholder="path/to/doc"
                />
              </Field>
              <Field label="Title *">
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.label ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Human-readable title"
                />
              </Field>
              <Field label="Sidebar *">
                <input
                  list="sidebar-list"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.sidebar ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, sidebar: e.target.value }))}
                  placeholder="e.g. developer_tooling"
                />
                <datalist id="sidebar-list">
                  {meta.sidebars.map(s => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <Field label="Section">
                <input
                  list="section-list"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.section ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, section: e.target.value }))}
                  placeholder="e.g. Traceability > Design"
                />
                <datalist id="section-list">
                  {meta.sections.map(s => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addForm.status ?? 'Planned'}
                    onChange={e => setAddForm(f => ({ ...f, status: e.target.value as Doc['status'] }))}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Target sprint">
                  <select
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={addForm.target_sprint ?? ''}
                    onChange={e => setAddForm(f => ({ ...f, target_sprint: e.target.value || null }))}
                  >
                    <option value="">None</option>
                    {meta.sprints.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Jira ticket URL">
                <input
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={addForm.jira_ticket_url ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, jira_ticket_url: e.target.value || null }))}
                  placeholder="https://jira..."
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  value={addForm.notes ?? ''}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value || null }))}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowAdd(false); setAddForm({ status: 'Planned', section: '' }); setAddError('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >Cancel</button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md disabled:opacity-50"
              >{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

function DocRow({ doc, meta, onUpdated }: { doc: Doc; meta: DocsMeta; onUpdated: () => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Doc>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const startEdit = () => {
    setForm({
      doc_id: doc.doc_id,
      label: doc.label,
      sidebar: doc.sidebar,
      section: doc.section,
      status: doc.status,
      target_sprint: doc.target_sprint,
      jira_ticket_url: doc.jira_ticket_url,
      notes: doc.notes,
    })
    setEditing(true)
    setOpen(true)
  }

  const saveEdit = async () => {
    try {
      setSaving(true)
      setErr('')
      const { updateDoc } = await import('../lib/docsApi')
      await updateDoc(doc.id, form)
      setEditing(false)
      onUpdated()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${doc.label}"? This cannot be undone.`)) return
    const { deleteDoc } = await import('../lib/docsApi')
    await deleteDoc(doc.id)
    onUpdated()
  }

  const liveUrl = `https://home.applied.co/manual/latest/vehicle_os/${doc.doc_id}.html`

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={() => !editing && setOpen(o => !o)}
      >
        <td className="px-4 py-3 font-medium text-gray-800">{doc.label}</td>
        <td className="px-4 py-3 text-gray-500 text-xs font-mono">{doc.sidebar}</td>
        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{doc.section || '—'}</td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status]}`}>
            {doc.status}
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="bg-gray-50 px-6 py-4 border-b">
            {editing ? (
              <div className="space-y-3 max-w-2xl">
                {err && <div className="p-2 bg-red-50 text-red-600 text-sm rounded">{err}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Doc path</label>
                    <input className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.doc_id ?? ''} onChange={e => setForm(f => ({ ...f, doc_id: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Title</label>
                    <input className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.label ?? ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Sidebar</label>
                    <input list="edit-sidebar-list" className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.sidebar ?? ''} onChange={e => setForm(f => ({ ...f, sidebar: e.target.value }))} />
                    <datalist id="edit-sidebar-list">{meta.sidebars.map(s => <option key={s} value={s} />)}</datalist>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Section</label>
                    <input list="edit-section-list" className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.section ?? ''} onChange={e => setForm(f => ({ ...f, section: e.target.value }))} />
                    <datalist id="edit-section-list">{meta.sections.map(s => <option key={s} value={s} />)}</datalist>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Status</label>
                    <select className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.status ?? 'Planned'} onChange={e => setForm(f => ({ ...f, status: e.target.value as Doc['status'] }))}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Target sprint</label>
                    <select className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.target_sprint ?? ''} onChange={e => setForm(f => ({ ...f, target_sprint: e.target.value || null }))}>
                      <option value="">None</option>
                      {meta.sprints.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Jira URL</label>
                    <input className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.jira_ticket_url ?? ''} onChange={e => setForm(f => ({ ...f, jira_ticket_url: e.target.value || null }))} placeholder="https://jira..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Notes</label>
                    <input className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm" value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50">{saving ? 'Saving...' : '✓ Save'}</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-sm">✕ Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-8 text-sm flex-wrap">
                <Detail label="Doc path"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{doc.doc_id}</code></Detail>
                <Detail label="Status"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status]}`}>{doc.status}</span></Detail>
                {doc.target_sprint && <Detail label="Target sprint"><span className="text-blue-700 font-medium">{doc.target_sprint}</span></Detail>}
                <Detail label="Live doc"><a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs break-all">{liveUrl}</a></Detail>
                {doc.jira_ticket_url && <Detail label="Jira"><a href={doc.jira_ticket_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">{doc.jira_ticket_url}</a></Detail>}
                {doc.notes && <Detail label="Notes"><span className="text-gray-600">{doc.notes}</span></Detail>}
                <div className="ml-auto flex gap-2 items-start">
                  <button onClick={startEdit} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded">✏️ Edit</button>
                  <button onClick={handleDelete} className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs rounded">🗑 Delete</button>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  )
}
