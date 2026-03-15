# Integrations Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a single "Integrations" sidebar tab with sub-navigation for Slack Bot, Google Docs, and Google Sheets so users can verify integrations are working and explore their data.

**Architecture:** A wrapper `Integrations.tsx` manages sub-tab state and renders one of three sub-components. Google Docs and Sheets tabs accept a pasted URL or ID, extract the document ID, and fetch data via the existing `/api/integration/...` proxy. Slack Bot tab shows connection status and recent events.

**Tech Stack:** React 18, TypeScript, Tailwind CSS. No new dependencies. Verification via `cd frontend && npx tsc --noEmit`.

---

### Task 1: Add `extractGoogleId` helper and wire new tab into App + Sidebar

**Files:**
- Create: `frontend/src/lib/googleId.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Create `frontend/src/lib/googleId.ts`**

```typescript
/**
 * Extracts a Google document/spreadsheet ID from a full URL or returns the
 * input unchanged if it looks like a bare ID already.
 *
 * Handles URLs like:
 *   https://docs.google.com/document/d/DOCID/edit
 *   https://docs.google.com/spreadsheets/d/SHEETID/edit
 */
export function extractGoogleId(input: string): string {
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input.trim()
}
```

**Step 2: Add `'integrations'` to the Tab type in `frontend/src/App.tsx:12`**

Change:
```typescript
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim'
```

To:
```typescript
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim' | 'integrations'
```

**Step 3: Add the import and render case in `frontend/src/App.tsx`**

Add the import at the top with the other component imports:
```typescript
import Integrations from './components/Integrations'
```

Add a case inside `renderContent()` before the `default:`:
```typescript
case 'integrations':
  return <Integrations />
```

**Step 4: Add the sidebar entry in `frontend/src/components/Sidebar.tsx`**

In the `tabs` array, add after the `anaheim` entry:
```typescript
{ id: 'integrations', label: 'Integrations', icon: '🔌' },
```

**Step 5: Verify TypeScript compiles (Integrations import will fail — that's expected)**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: error about missing `./components/Integrations` module — that's fine, we'll create it next.

**Step 6: Commit**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template && git add frontend/src/lib/googleId.ts frontend/src/App.tsx frontend/src/components/Sidebar.tsx && git commit -m "feat: add integrations tab type, sidebar entry, and googleId helper"
```

---

### Task 2: Create `SlackBotTab.tsx`

**Files:**
- Create: `frontend/src/components/SlackBotTab.tsx`

This tab mirrors the `Dashboard.tsx` event-polling pattern and reuses the `SlackSetupModal` already in `Sidebar.tsx` — but since `SlackSetupModal` is not exported from `Sidebar.tsx`, we duplicate the small modal inline here.

**Step 1: Create `frontend/src/components/SlackBotTab.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useStatus } from '../App'
import { isBuildingResponse } from '../lib/api'

interface EventLog {
  id: string
  type: string
  user: string
  channel: string
  text: string
  timestamp: string
}

function SlackSetupModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Connect to Slack</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">1.</span>
            <span>Go to <a href="https://apps.applied.dev/apps/my-apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">apps.applied.dev/apps/my-apps</a></span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">2.</span>
            <span>Find your app name</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">3.</span>
            <span>Click <strong>"Install Slack App into Workspace"</strong></span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">4.</span>
            <span>Wait for <strong>@SamK</strong> to approve your Slackbot</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">5.</span>
            <span>Revisit <a href="https://apps.applied.dev/apps/my-apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">apps.applied.dev</a> to install your Slackbot</span>
          </li>
        </ol>
        <p className="text-sm text-gray-500 mt-2"><strong>Note: Slack does not work when the app is run locally.</strong></p>
        <button onClick={onClose} className="mt-5 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Got it</button>
      </div>
    </div>
  )
}

function SlackBotTab() {
  const status = useStatus()
  const [showModal, setShowModal] = useState(false)
  const [events, setEvents] = useState<EventLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events')
      if (await isBuildingResponse(response)) return
      const data = await response.json()
      if (data.success) setEvents(data.events || [])
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString()

  return (
    <div className="space-y-6">
      {showModal && <SlackSetupModal onClose={() => setShowModal(false)} />}

      {/* Status card */}
      <div className={`rounded-lg p-4 border ${status.ready ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${status.ready ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <p className={`font-medium ${status.ready ? 'text-green-800' : 'text-red-800'}`}>
                {status.ready ? 'Slack Bot Connected' : 'Slack Bot Not Connected'}
              </p>
              <p className={`text-sm mt-0.5 ${status.ready ? 'text-green-600' : 'text-red-600'}`}>
                {status.message}
              </p>
            </div>
          </div>
          {!status.ready && (
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              How to connect
            </button>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b">
          <h3 className="font-medium text-gray-800">Recent Bot Events</h3>
          <p className="text-sm text-gray-500 mt-0.5">Live feed of Slack events received by your bot</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No events yet. Try mentioning the bot or sending it a DM!</div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {events.map(event => (
              <div key={event.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{event.type}</span>
                  <span className="text-xs text-gray-400">{formatTime(event.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-800">{event.text || '(no text)'}</p>
                {(event.user || event.channel) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {event.user && <span>User: {event.user}</span>}
                    {event.channel && <span className="ml-3">Channel: {event.channel}</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SlackBotTab
```

**Step 2: Verify TypeScript**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: still errors about missing `Integrations`, `GoogleDocsTab`, `GoogleSheetsTab` — that's fine.

**Step 3: Commit**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template && git add frontend/src/components/SlackBotTab.tsx && git commit -m "feat: add SlackBotTab with connection status and event feed"
```

---

### Task 3: Create `GoogleDocsTab.tsx`

**Files:**
- Create: `frontend/src/components/GoogleDocsTab.tsx`

The Docs API returns a complex JSON structure. We flatten `body.content` into readable paragraphs by walking `structuralElement` → `paragraph` → `elements` → `textRun.content`.

**Step 1: Create `frontend/src/components/GoogleDocsTab.tsx`**

```typescript
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
```

**Step 2: Verify TypeScript**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors only about missing `Integrations` and `GoogleSheetsTab`.

**Step 3: Commit**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template && git add frontend/src/components/GoogleDocsTab.tsx && git commit -m "feat: add GoogleDocsTab with URL input and document viewer"
```

---

### Task 4: Create `GoogleSheetsTab.tsx`

**Files:**
- Create: `frontend/src/components/GoogleSheetsTab.tsx`

The Sheets values API returns `{ values: string[][] }`. The first row is treated as the header.

**Step 1: Create `frontend/src/components/GoogleSheetsTab.tsx`**

```typescript
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
      const res = await fetch(`/api/integration/sheets/spreadsheets/${id}/values/A1:Z200`)
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
```

**Step 2: Verify TypeScript**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: only error about missing `Integrations`.

**Step 3: Commit**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template && git add frontend/src/components/GoogleSheetsTab.tsx && git commit -m "feat: add GoogleSheetsTab with URL input and table viewer"
```

---

### Task 5: Create `Integrations.tsx` wrapper and verify full build

**Files:**
- Create: `frontend/src/components/Integrations.tsx`

**Step 1: Create `frontend/src/components/Integrations.tsx`**

```typescript
import { useState } from 'react'
import SlackBotTab from './SlackBotTab'
import GoogleDocsTab from './GoogleDocsTab'
import GoogleSheetsTab from './GoogleSheetsTab'

type SubTab = 'slack-bot' | 'google-docs' | 'google-sheets'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'slack-bot', label: 'Slack Bot' },
  { id: 'google-docs', label: 'Google Docs' },
  { id: 'google-sheets', label: 'Google Sheets' },
]

function Integrations() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('slack-bot')

  const renderSubTab = () => {
    switch (activeSubTab) {
      case 'slack-bot': return <SlackBotTab />
      case 'google-docs': return <GoogleDocsTab />
      case 'google-sheets': return <GoogleSheetsTab />
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Integrations</h2>
        <p className="text-gray-600 mt-1">Verify your integrations are connected and explore their data</p>
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSubTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {renderSubTab()}
    </div>
  )
}

export default Integrations
```

**Step 2: Verify TypeScript compiles cleanly**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 3: Run the frontend build to confirm no bundling errors**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ built in ...` with no errors.

**Step 4: Commit**

```bash
cd /home/brandon_man/code/apps-platform-example-apps/agentic-apps-builder-template && git add frontend/src/components/Integrations.tsx frontend/dist && git commit -m "feat: add Integrations tab with Slack Bot, Google Docs, and Google Sheets sub-tabs"
```

---

## Manual Verification Checklist

After all tasks complete, verify in the browser:

- [ ] "Integrations" tab appears in the sidebar and is clickable
- [ ] Three sub-tabs render: Slack Bot, Google Docs, Google Sheets
- [ ] Slack Bot tab shows connected/not-connected status card
- [ ] Slack Bot tab shows "How to connect" button when disconnected
- [ ] Slack Bot event list shows recent events (or empty state message)
- [ ] Google Docs tab shows "not connected" banner when Google Docs pill is disconnected
- [ ] Google Docs tab: pasting a full Google Docs URL loads and renders the document title and paragraphs
- [ ] Google Sheets tab: pasting a full Google Sheets URL loads and renders a table with header row
- [ ] TypeScript: `cd frontend && npx tsc --noEmit` exits with no errors
- [ ] Build: `cd frontend && npm run build` succeeds
