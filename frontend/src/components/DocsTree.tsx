import { useEffect, useState } from 'react'
import {
  Doc, DocsMeta, STATUS_DOT, STATUS_COLORS, STATUSES,
  listDocs, createDoc, updateDoc, deleteDoc, getDocsMeta,
} from '../lib/docsApi'

// ─── Tree data model ───────────────────────────────────────────────────────────

interface SidebarNode {
  name: string
  topLevelDocs: Doc[]
  sections: SectionNode[]
}

interface SectionNode {
  path: string       // full breadcrumb e.g. "Traceability > Design"
  displayName: string // just the last segment
  docs: Doc[]
}

function buildTree(docs: Doc[]): SidebarNode[] {
  const bySidebar = new Map<string, Doc[]>()
  for (const d of docs) {
    if (!bySidebar.has(d.sidebar)) bySidebar.set(d.sidebar, [])
    bySidebar.get(d.sidebar)!.push(d)
  }

  const result: SidebarNode[] = []
  const sidebars = [...bySidebar.keys()].sort()

  for (const sidebar of sidebars) {
    const sidebarDocs = bySidebar.get(sidebar)!
    const topLevelDocs = sidebarDocs.filter(d => !d.section)

    // Collect unique section paths
    const sectionPaths = new Set<string>()
    for (const d of sidebarDocs) {
      if (d.section) sectionPaths.add(d.section)
    }

    const sections: SectionNode[] = [...sectionPaths].sort().map(path => {
      const parts = path.split(' > ')
      return {
        path,
        displayName: parts[parts.length - 1],
        docs: sidebarDocs.filter(d => d.section === path),
      }
    })

    result.push({ name: sidebar, topLevelDocs, sections })
  }
  return result
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DocsTree() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [meta, setMeta] = useState<DocsMeta>({ sidebars: [], sections: [], sprints: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = async () => {
    try {
      setLoading(true)
      const [d, m] = await Promise.all([listDocs(), getDocsMeta()])
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

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const tree = buildTree(docs)

  // ── Add new sidebar state ──
  const [addingSidebar, setAddingSidebar] = useState(false)
  const [newSidebarName, setNewSidebarName] = useState('')
  const [newSidebarError, setNewSidebarError] = useState('')

  const handleAddSidebar = async () => {
    const name = newSidebarName.trim()
    if (!name) { setNewSidebarError('Sidebar name is required'); return }
    // We create a placeholder doc to establish the sidebar
    try {
      await createDoc({
        doc_id: `${name}/index`,
        label: 'Overview',
        sidebar: name,
        section: '',
        status: 'Planned',
      })
      setAddingSidebar(false)
      setNewSidebarName('')
      setNewSidebarError('')
      await load()
    } catch (e: any) {
      setNewSidebarError(e.message)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-400">Loading...</div>
  if (error) return <div className="p-6 text-red-600 bg-red-50 m-4 rounded-lg">{error}</div>

  return (
    <div className="p-4 overflow-auto h-full">
      {tree.length === 0 && !addingSidebar && (
        <div className="text-center text-gray-400 py-12">No docs yet. Add a sidebar to get started.</div>
      )}

      {tree.map(sb => (
        <SidebarBlock
          key={sb.name}
          node={sb}
          meta={meta}
          collapsed={collapsed}
          onToggle={toggleCollapse}
          onRefresh={load}
        />
      ))}

      {/* Add new sidebar */}
      <div className="mt-4">
        {addingSidebar ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              autoFocus
              className="border border-gray-300 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="sidebar_name"
              value={newSidebarName}
              onChange={e => setNewSidebarName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSidebar(); if (e.key === 'Escape') { setAddingSidebar(false); setNewSidebarName(''); setNewSidebarError('') } }}
            />
            <button onClick={handleAddSidebar} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">✓</button>
            <button onClick={() => { setAddingSidebar(false); setNewSidebarName(''); setNewSidebarError('') }} className="px-2 py-1 text-gray-500 text-xs">✕</button>
            {newSidebarError && <span className="text-red-500 text-xs">{newSidebarError}</span>}
          </div>
        ) : (
          <button
            onClick={() => setAddingSidebar(true)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-2"
          >
            <span className="text-lg leading-none">+</span> New Sidebar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Sidebar block ─────────────────────────────────────────────────────────────

function SidebarBlock({
  node, meta, collapsed, onToggle, onRefresh,
}: {
  node: SidebarNode
  meta: DocsMeta
  collapsed: Set<string>
  onToggle: (k: string) => void
  onRefresh: () => void
}) {
  const key = `sb:${node.name}`
  const isCollapsed = collapsed.has(key)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const [addingSection, setAddingSection] = useState(false)
  const [newSection, setNewSection] = useState('')
  const [sectionError, setSectionError] = useState('')

  const totalDocs = node.topLevelDocs.length + node.sections.reduce((a, s) => a + s.docs.length, 0)

  const handleDeleteSidebar = async () => {
    if (!window.confirm(`Delete "${node.name}" and all ${totalDocs} docs inside it? This cannot be undone.`)) return
    const allDocs = [...node.topLevelDocs, ...node.sections.flatMap(s => s.docs)]
    await Promise.all(allDocs.map(d => deleteDoc(d.id)))
    onRefresh()
  }

  const handleRenameSidebar = async () => {
    const name = newName.trim()
    if (!name || name === node.name) { setEditingName(false); return }
    const allDocs = [...node.topLevelDocs, ...node.sections.flatMap(s => s.docs)]
    await Promise.all(allDocs.map(d => updateDoc(d.id, { sidebar: name })))
    setEditingName(false)
    onRefresh()
  }

  const handleAddSection = async () => {
    const sec = newSection.trim()
    if (!sec) { setSectionError('Section name is required'); return }
    try {
      await createDoc({
        doc_id: `${node.name}/${sec.toLowerCase().replace(/\s+/g, '_')}/index`,
        label: 'Overview',
        sidebar: node.name,
        section: sec,
        status: 'Planned',
      })
      setAddingSection(false)
      setNewSection('')
      setSectionError('')
      onRefresh()
    } catch (e: any) {
      setSectionError(e.message)
    }
  }

  return (
    <div className="mb-6">
      {/* Sidebar header */}
      <div className="flex items-center gap-2 group mb-1">
        <button onClick={() => onToggle(key)} className="text-gray-400 hover:text-gray-600 w-4 text-center text-xs">
          {isCollapsed ? '▶' : '▼'}
        </button>
        <span className="text-base mr-1">📁</span>
        {editingName ? (
          <>
            <input
              autoFocus
              className="border border-gray-300 rounded px-1.5 py-0.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSidebar(); if (e.key === 'Escape') { setEditingName(false); setNewName(node.name) } }}
            />
            <button onClick={handleRenameSidebar} className="text-green-600 text-xs px-1">✓</button>
            <button onClick={() => { setEditingName(false); setNewName(node.name) }} className="text-gray-400 text-xs px-1">✕</button>
          </>
        ) : (
          <span className="font-semibold text-gray-800 font-mono text-sm">{node.name}</span>
        )}
        <span className="text-xs text-gray-400 ml-1">({totalDocs})</span>
        <div className="hidden group-hover:flex items-center gap-1 ml-1">
          <button onClick={() => { setEditingName(true); setNewName(node.name) }} className="text-gray-400 hover:text-gray-600 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100" title="Rename">✏️</button>
          <button onClick={() => setAddingSection(true)} className="text-gray-400 hover:text-blue-600 text-xs px-1.5 py-0.5 rounded hover:bg-blue-50" title="Add section">+ Section</button>
          <button onClick={handleDeleteSidebar} className="text-gray-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50" title="Delete sidebar">🗑</button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="ml-6 border-l border-gray-100 pl-4">
          {/* Add section inline */}
          {addingSection && (
            <div className="flex items-center gap-2 mb-2 py-1">
              <input
                autoFocus
                className="border border-gray-300 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Section name"
                value={newSection}
                onChange={e => setNewSection(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSection(''); setSectionError('') } }}
              />
              <button onClick={handleAddSection} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">✓</button>
              <button onClick={() => { setAddingSection(false); setNewSection(''); setSectionError('') }} className="text-gray-500 text-xs">✕</button>
              {sectionError && <span className="text-red-500 text-xs">{sectionError}</span>}
            </div>
          )}

          {/* Top-level docs */}
          {node.topLevelDocs.map(doc => (
            <DocNode key={doc.id} doc={doc} meta={meta} sidebar={node.name} section="" onRefresh={onRefresh} />
          ))}

          {/* Sections */}
          {node.sections.map(sec => (
            <SectionBlock
              key={sec.path}
              node={sec}
              sidebarName={node.name}
              meta={meta}
              collapsed={collapsed}
              onToggle={onToggle}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section block ─────────────────────────────────────────────────────────────

function SectionBlock({
  node, sidebarName, meta, collapsed, onToggle, onRefresh,
}: {
  node: SectionNode
  sidebarName: string
  meta: DocsMeta
  collapsed: Set<string>
  onToggle: (k: string) => void
  onRefresh: () => void
}) {
  const key = `sec:${sidebarName}:${node.path}`
  const isCollapsed = collapsed.has(key)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(node.path)
  const [addingDoc, setAddingDoc] = useState(false)

  const handleDeleteSection = async () => {
    if (!window.confirm(`Delete section "${node.path}" and all ${node.docs.length} docs inside it? This cannot be undone.`)) return
    await Promise.all(node.docs.map(d => deleteDoc(d.id)))
    onRefresh()
  }

  const handleRenameSection = async () => {
    const name = newName.trim()
    if (!name || name === node.path) { setEditingName(false); return }
    await Promise.all(node.docs.map(d => updateDoc(d.id, { section: name })))
    setEditingName(false)
    onRefresh()
  }

  // Indentation depth based on " > " segments
  const depth = node.path.split(' > ').length - 1

  return (
    <div className={`mb-1 ${depth > 0 ? 'ml-4' : ''}`}>
      <div className="flex items-center gap-2 group py-0.5">
        <button onClick={() => onToggle(key)} className="text-gray-400 hover:text-gray-600 w-4 text-center text-xs">
          {isCollapsed ? '▶' : '▼'}
        </button>
        <span className="text-sm mr-0.5">📁</span>
        {editingName ? (
          <>
            <input
              autoFocus
              className="border border-gray-300 rounded px-1.5 py-0.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSection(); if (e.key === 'Escape') { setEditingName(false); setNewName(node.path) } }}
            />
            <button onClick={handleRenameSection} className="text-green-600 text-xs px-1">✓</button>
            <button onClick={() => { setEditingName(false); setNewName(node.path) }} className="text-gray-400 text-xs px-1">✕</button>
          </>
        ) : (
          <span className="font-medium text-gray-700 text-sm">{node.displayName}</span>
        )}
        <span className="text-xs text-gray-400">({node.docs.length})</span>
        <div className="hidden group-hover:flex items-center gap-1 ml-1">
          <button onClick={() => { setEditingName(true); setNewName(node.path) }} className="text-gray-400 hover:text-gray-600 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100">✏️</button>
          <button onClick={() => setAddingDoc(true)} className="text-gray-400 hover:text-blue-600 text-xs px-1.5 py-0.5 rounded hover:bg-blue-50">+ Doc</button>
          <button onClick={handleDeleteSection} className="text-gray-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑</button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="ml-6 border-l border-gray-100 pl-3">
          {node.docs.map(doc => (
            <DocNode key={doc.id} doc={doc} meta={meta} sidebar={sidebarName} section={node.path} onRefresh={onRefresh} />
          ))}
          {addingDoc && (
            <AddDocInline
              sidebar={sidebarName}
              section={node.path}
              meta={meta}
              onDone={() => { setAddingDoc(false); onRefresh() }}
              onCancel={() => setAddingDoc(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Doc node ─────────────────────────────────────────────────────────────────

function DocNode({
  doc, meta, sidebar: _sidebar, section: _section, onRefresh,
}: {
  doc: Doc
  meta: DocsMeta
  sidebar: string
  section: string
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Doc>>({})

  const startEdit = () => {
    setForm({ label: doc.label, doc_id: doc.doc_id, status: doc.status, target_sprint: doc.target_sprint, section: doc.section, sidebar: doc.sidebar })
    setEditing(true)
  }

  const saveEdit = async () => {
    await updateDoc(doc.id, form)
    setEditing(false)
    onRefresh()
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${doc.label}"? This cannot be undone.`)) return
    await deleteDoc(doc.id)
    onRefresh()
  }

  return (
    <div className="group flex items-center gap-2 py-0.5 hover:bg-gray-50 rounded px-1 -mx-1 my-0.5 min-h-[28px]">
      <span className="text-sm shrink-0">📄</span>
      {editing ? (
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          <input
            autoFocus
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm w-40"
            value={form.label ?? ''}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Title"
          />
          <input
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm w-40 font-mono"
            value={form.doc_id ?? ''}
            onChange={e => setForm(f => ({ ...f, doc_id: e.target.value }))}
            placeholder="path/to/doc"
          />
          <input
            list="tree-section-list"
            className="border border-gray-300 rounded px-1.5 py-0.5 text-sm w-40"
            value={form.section ?? ''}
            onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
            placeholder="Section"
          />
          <datalist id="tree-section-list">{meta.sections.map(s => <option key={s} value={s} />)}</datalist>
          <select className="border border-gray-300 rounded px-1.5 py-0.5 text-sm" value={form.status ?? 'Planned'} onChange={e => setForm(f => ({ ...f, status: e.target.value as Doc['status'] }))}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="border border-gray-300 rounded px-1.5 py-0.5 text-sm" value={form.target_sprint ?? ''} onChange={e => setForm(f => ({ ...f, target_sprint: e.target.value || null }))}>
            <option value="">No sprint</option>
            {meta.sprints.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={saveEdit} className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded">✓</button>
          <button onClick={() => setEditing(false)} className="text-gray-400 text-xs px-1">✕</button>
        </div>
      ) : (
        <>
          <span className="text-sm text-gray-700 flex-1 truncate">{doc.label}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[doc.status]}`}>
            {STATUS_DOT[doc.status]} {doc.status}
          </span>
          {doc.target_sprint && (
            <span className="text-xs text-blue-600 font-mono shrink-0">{doc.target_sprint}</span>
          )}
          <div className="hidden group-hover:flex items-center gap-1 shrink-0">
            <button onClick={startEdit} className="text-gray-400 hover:text-gray-600 text-xs px-1.5 py-0.5 rounded hover:bg-gray-100">✏️</button>
            <button onClick={handleDelete} className="text-gray-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑</button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Add doc inline form ───────────────────────────────────────────────────────

function AddDocInline({
  sidebar, section, meta, onDone, onCancel,
}: {
  sidebar: string
  section: string
  meta: DocsMeta
  onDone: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<Partial<Doc>>({ sidebar, section, status: 'Planned' })
  const [err, setErr] = useState('')

  const handleSave = async () => {
    if (!form.doc_id?.trim() || !form.label?.trim()) { setErr('Path and title required'); return }
    try {
      await createDoc(form)
      onDone()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap py-1">
      <span className="text-sm">📄</span>
      <input
        autoFocus
        className="border border-gray-300 rounded px-1.5 py-0.5 text-sm w-36"
        placeholder="Title *"
        value={form.label ?? ''}
        onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
      />
      <input
        className="border border-gray-300 rounded px-1.5 py-0.5 text-sm w-36 font-mono"
        placeholder="path/to/doc *"
        value={form.doc_id ?? ''}
        onChange={e => setForm(f => ({ ...f, doc_id: e.target.value }))}
      />
      <select className="border border-gray-300 rounded px-1.5 py-0.5 text-sm" value={form.status ?? 'Planned'} onChange={e => setForm(f => ({ ...f, status: e.target.value as Doc['status'] }))}>
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="border border-gray-300 rounded px-1.5 py-0.5 text-sm" value={form.target_sprint ?? ''} onChange={e => setForm(f => ({ ...f, target_sprint: e.target.value || null }))}>
        <option value="">No sprint</option>
        {meta.sprints.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={handleSave} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">✓ Add</button>
      <button onClick={onCancel} className="text-gray-400 text-xs px-1">✕</button>
      {err && <span className="text-red-500 text-xs">{err}</span>}
    </div>
  )
}
