export interface Doc {
  id: number
  doc_id: string
  label: string
  sidebar: string
  section: string
  status: 'Planned' | 'In Progress' | 'Published'
  target_sprint: string | null
  jira_ticket_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DocsMeta {
  sidebars: string[]
  sections: string[]
  sprints: string[]
}

export const STATUS_COLORS: Record<string, string> = {
  Published: 'bg-green-100 text-green-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  Planned: 'bg-gray-100 text-gray-600',
}

export const STATUS_DOT: Record<string, string> = {
  Published: '🟢',
  'In Progress': '🟡',
  Planned: '⚪',
}

export const STATUSES = ['Published', 'In Progress', 'Planned'] as const

export async function listDocs(filters?: {
  sidebar?: string
  section?: string
  status?: string
}): Promise<Doc[]> {
  const params = new URLSearchParams()
  if (filters?.sidebar) params.set('sidebar', filters.sidebar)
  if (filters?.section) params.set('section', filters.section)
  if (filters?.status) params.set('status', filters.status)
  const res = await fetch(`/api/docs?${params}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createDoc(doc: Partial<Doc>): Promise<{ id: number }> {
  const res = await fetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text)
  }
  return res.json()
}

export async function updateDoc(id: number, updates: Partial<Doc>): Promise<void> {
  const res = await fetch(`/api/docs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteDoc(id: number): Promise<void> {
  const res = await fetch(`/api/docs/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}

export async function getDocsMeta(sidebar?: string): Promise<DocsMeta> {
  const params = new URLSearchParams()
  if (sidebar) params.set('sidebar', sidebar)
  const res = await fetch(`/api/docs/meta?${params}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function liveDocUrl(docId: string): string {
  return `https://home.applied.co/manual/latest/vehicle_os/${docId}.html`
}
