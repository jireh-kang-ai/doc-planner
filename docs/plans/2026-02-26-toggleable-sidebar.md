# Toggleable Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the sidebar collapsible — closed by default, toggled open/closed via a chevron button pinned to the left edge.

**Architecture:** `sidebarOpen` boolean state lives in `App.tsx` and is passed as `isOpen`/`onToggle` props to `Sidebar.tsx`. The sidebar renders a thin chevron-only strip when closed and the full panel when open, with a CSS width transition for smooth animation.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

### Task 1: Add `sidebarOpen` state and props to `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx:24-68`

**Step 1: Add sidebarOpen state on line 25 (after the activeTab useState)**

Change line 25 from:
```tsx
  const [status, setStatus] = useState<BotStatus>({ ready: false, message: 'Loading...' })
```
To:
```tsx
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [status, setStatus] = useState<BotStatus>({ ready: false, message: 'Loading...' })
```

**Step 2: Pass isOpen and onToggle to Sidebar on line 68**

Change:
```tsx
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
```
To:
```tsx
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(v => !v)} />
```

---

### Task 2: Rewrite `Sidebar.tsx` with toggle support

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Replace the entire file contents with the following**

```tsx
import { useState } from 'react'
import { Tab, useStatus } from '../App'

interface SidebarProps {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  isOpen: boolean
  onToggle: () => void
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  // Uncomment if you want to add a tab
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'event-log', label: 'Event Log', icon: '📊' },
  //{ id: 'send-message', label: 'Send Message', icon: '💬' },
  //{ id: 'send-dm', label: 'Send DM', icon: '📨' },
  //{ id: 'members', label: 'Channel Members', icon: '👥' },
  //{ id: 'feedback', label: 'Feedback', icon: '📝' },
  { id: 'anaheim', label: 'Anaheim', icon: '👥' },
]

function ChevronRight() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
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
            <span>
              Go to{' '}
              <a
                href="https://apps.applied.dev/apps/my-apps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                https://apps.applied.dev/apps/my-apps
              </a>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">2.</span>
            <span>Find your app name</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600 shrink-0">3.</span>
            <span>Click on <strong>"Install Slack App into Workspace"</strong></span>
          </li>
        </ol>
        <p className="text-sm text-gray-500 mt-2">
          <strong>Note: Slack does not work when the app is run locally.</strong>
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

function Sidebar({ activeTab, setActiveTab, isOpen, onToggle }: SidebarProps) {
  const status = useStatus()
  const [showModal, setShowModal] = useState(false)

  if (!isOpen) {
    return (
      <aside className="w-10 bg-white shadow-md flex flex-col items-center pt-4 shrink-0">
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 p-1">
          <ChevronRight />
        </button>
      </aside>
    )
  }

  return (
    <aside className="w-64 bg-white shadow-md flex flex-col shrink-0">
      <div className="p-6 border-b flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Agentic App Template</h1>
          <p className="text-sm text-gray-500 mt-1">Go + React</p>
        </div>
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 p-1 ml-2 shrink-0">
          <ChevronLeft />
        </button>
      </div>

      {/* Status Indicator */}
      <div className={`mx-4 mt-4 p-3 rounded-lg max-h-20 overflow-y-auto ${status.ready ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${status.ready ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-sm font-medium ${status.ready ? 'text-green-800' : 'text-red-800'}`}>
            {status.ready ? 'Connected' : 'Not Connected'}
          </span>
        </div>
        <p className={`text-xs mt-1 ${status.ready ? 'text-green-600' : 'text-red-600'}`}>
          {status.message}
        </p>
        {!status.ready && (
          <button
            onClick={() => setShowModal(true)}
            className="text-xs mt-1 text-blue-600 underline hover:text-blue-800 text-left"
          >
            Make sure your app is connected to Slack
          </button>
        )}
      </div>
      {showModal && <SlackSetupModal onClose={() => setShowModal(false)} />}

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <span className="mr-3">{tab.icon}</span>
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

export default Sidebar
```

---

### Verification

After all tasks are complete, visually confirm:
1. On load: only a narrow `~40px` strip with a `>` chevron is visible on the left
2. Click the chevron: full sidebar slides in, chevron changes to `<`
3. Click `<`: sidebar collapses back to the strip
4. All tabs (Home, Event Log, Anaheim) work correctly when sidebar is open
5. Status indicator is visible when sidebar is open
