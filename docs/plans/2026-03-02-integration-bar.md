# Integration Bar Implementation Plan

**Goal:** Replace the full-page Integrations tab with a compact horizontal pill bar at the top of every page showing connection status for all integrations.

**Architecture:** A new `IntegrationBar` component renders a slim bar above the tab content in `App.tsx`. It fetches `/api/connections` on mount and shows a pill per integration — green dot if connected, grey if not. Clicking any pill opens the OAuth popup (connect for new, reconnect for existing). The old Integrations page and sidebar tab are deleted.

**Important note on disconnect:** The backend has no disconnect endpoint. Clicking a connected pill re-runs the OAuth flow (reconnect), same as the current behavior. Connected pills show green to indicate status, but there is no "disconnect" action.

---

### Task 1: Create `IntegrationBar.tsx`

**What this does:** New component that renders the horizontal bar with integration pills. Reuses the same API calls already in `Integrations.tsx`.

**Files:**
- Create: `frontend/src/components/IntegrationBar.tsx`

**Step 1: Create the component**

```tsx
import { useState, useEffect, useCallback } from 'react'

interface Connection {
  id: string
  provider_config_key: string
  connection_id: string
}

interface Integration {
  name: string
  label: string
  providerKey: string
}

const INTEGRATIONS: Integration[] = [
  { name: 'sheets', label: 'Google Sheets', providerKey: 'google-sheets' },
  { name: 'docs', label: 'Google Docs', providerKey: 'google-docs' },
  { name: 'drive', label: 'Google Drive', providerKey: 'google-drive' },
  { name: 'calendar', label: 'Google Calendar', providerKey: 'google-calendar' },
  { name: 'jira', label: 'Jira', providerKey: 'jira' },
  { name: 'confluence', label: 'Confluence', providerKey: 'confluence' },
]

function IntegrationBar() {
  const [connections, setConnections] = useState<Connection[]>([])

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/connections')
      if (res.ok) {
        const data = await res.json()
        setConnections(data.connections || [])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => { loadConnections() }, [loadConnections])

  const isConnected = (integration: Integration) =>
    connections.some(c => c.provider_config_key === integration.providerKey)

  const handleClick = async (name: string) => {
    try {
      const res = await fetch(`/api/connect/${name}`, { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        const popup = window.open(data.url, '_blank', 'width=600,height=700')
        const check = setInterval(() => {
          if (popup?.closed) {
            clearInterval(check)
            loadConnections()
          }
        }, 500)
      }
    } catch (err) {
      console.error('Connect failed:', err)
    }
  }

  const connectedCount = INTEGRATIONS.filter(i => isConnected(i)).length

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
        Integrations ({connectedCount}/{INTEGRATIONS.length})
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {INTEGRATIONS.map(integration => {
          const connected = isConnected(integration)
          return (
            <button
              key={integration.name}
              onClick={() => handleClick(integration.name)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                connected
                  ? 'bg-gray-800 text-white hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
              {integration.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default IntegrationBar
```

**Step 2: Verify the file saved correctly**

Open `frontend/src/components/IntegrationBar.tsx` and confirm it looks right.

---

### Task 2: Update `App.tsx`

**What this does:** Add `IntegrationBar` above the tab content. Remove `integrations` from the Tab type and `renderContent`.

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Add the import at the top of `App.tsx`**

Add this line alongside the other imports (around line 10):
```tsx
import IntegrationBar from './components/IntegrationBar'
```

Also remove:
```tsx
import Integrations from './components/Integrations'
```

**Step 2: Update the `Tab` type (line 12)**

Change:
```tsx
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim' | 'integrations'
```
To:
```tsx
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim'
```

**Step 3: Remove the `integrations` case from `renderContent`**

Remove these lines from the switch statement:
```tsx
case 'integrations':
  return <Integrations />
```

**Step 4: Add `IntegrationBar` above tab content in the JSX**

Change:
```tsx
<main className="flex-1 overflow-auto p-6">
  {renderContent()}
</main>
```
To:
```tsx
<main className="flex-1 overflow-auto flex flex-col">
  <IntegrationBar />
  <div className="flex-1 overflow-auto p-6">
    {renderContent()}
  </div>
</main>
```

---

### Task 3: Update `Sidebar.tsx`

**What this does:** Remove the Integrations tab from the sidebar nav.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Remove the integrations tab entry (around line 20)**

Remove this line from the `tabs` array:
```tsx
{ id: 'integrations', label: 'Integrations', icon: '🔌' },
```

---

### Task 4: Delete `Integrations.tsx`

**What this does:** Remove the now-unused full-page integrations component.

**Files:**
- Delete: `frontend/src/components/Integrations.tsx`

**Step 1: Delete the file**

Delete `frontend/src/components/Integrations.tsx`. It is no longer imported or used anywhere after Task 2.

---

### Task 5: Manual verification

**Step 1: Open the app in a browser**

The app runs at `http://localhost:3000` (if dev server is running).

**Step 2: Check the bar appears**

On every tab (Home, Event Log, Anaheim), you should see a slim bar at the top of the main content area with "INTEGRATIONS (0/6)" and 6 grey pills.

**Step 3: Confirm the Integrations sidebar tab is gone**

The sidebar should no longer show an "Integrations" option.

**Step 4: Click a pill**

Clicking any pill should open an OAuth popup window.

**Step 5: After connecting one integration**

The pill should turn dark with a green dot, and the count should update to "(1/6)".
