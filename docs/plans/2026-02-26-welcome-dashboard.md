# Welcome Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new "Home" welcome page as the default landing tab, renaming the existing event dashboard to "Event Log".

**Architecture:** Create a new static `Home.tsx` component; add `'home'` to the `Tab` type and make it the default; rename `'dashboard'` → `'event-log'` throughout; update the sidebar tab list accordingly. No backend changes needed.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

### Task 1: Create `Home.tsx` component

**Files:**
- Create: `frontend/src/components/Home.tsx`

**Step 1: Create the file with the welcome content**

```tsx
function Home() {
  return (
    <div className="max-w-2xl mx-auto mt-12 px-4">
      <div className="bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Welcome to the agentic app template!
        </h1>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Overview</h2>
          <p className="text-gray-600 leading-relaxed">
            This is the template website for the agentic apps builder, which serves as a playground
            to build your apps! This template has <strong>Slack</strong> and{' '}
            <strong>Anaheim</strong> integrated. Explore the tabs on the left to see what they look
            like. If you see a not connected error on the left and you don't use slack, feel free to
            ignore it, or tell your agent to remove it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Changelog</h2>
          <div className="space-y-3">
            <div className="border border-gray-200 rounded-lg p-4">
              <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded mb-1">
                v1.0
              </span>
              <p className="text-gray-600 text-sm">First version of Agentic App Builder Template released!</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Home
```

---

### Task 2: Update `App.tsx` — add `home` tab, rename `dashboard` → `event-log`

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Add `Home` import at line 8 (after existing imports)**

Add this line after the `import Anaheim` line:
```tsx
import Home from './components/Home'
```

**Step 2: Update the `Tab` type at line 10**

Change:
```tsx
export type Tab = 'dashboard' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim'
```
To:
```tsx
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim'
```

**Step 3: Update default `activeTab` at line 24**

Change:
```tsx
const [activeTab, setActiveTab] = useState<Tab>('dashboard')
```
To:
```tsx
const [activeTab, setActiveTab] = useState<Tab>('home')
```

**Step 4: Update `renderContent()` switch at lines 43–60**

Change:
```tsx
const renderContent = () => {
  switch (activeTab) {
    case 'dashboard':
      return <Dashboard />
    case 'send-message':
      return <SendMessage />
    case 'send-dm':
      return <SendDM />
    case 'members':
      return <ChannelMembers />
    case 'feedback':
      return <FeedbackList />
    case 'anaheim':
      return <Anaheim />
    default:
      return <Dashboard />
  }
}
```
To:
```tsx
const renderContent = () => {
  switch (activeTab) {
    case 'home':
      return <Home />
    case 'event-log':
      return <Dashboard />
    case 'send-message':
      return <SendMessage />
    case 'send-dm':
      return <SendDM />
    case 'members':
      return <ChannelMembers />
    case 'feedback':
      return <FeedbackList />
    case 'anaheim':
      return <Anaheim />
    default:
      return <Home />
  }
}
```

---

### Task 3: Update `Sidebar.tsx` — add Home tab, rename Dashboard → Event Log

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Update the tabs array at lines 9–17**

Change:
```tsx
const tabs: { id: Tab; label: string; icon: string }[] = [
  // Uncomment if you want to add a tab
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  //{ id: 'send-message', label: 'Send Message', icon: '💬' },
  //{ id: 'send-dm', label: 'Send DM', icon: '📨' },
  //{ id: 'members', label: 'Channel Members', icon: '👥' },
  //{ id: 'feedback', label: 'Feedback', icon: '📝' },
  { id: 'anaheim', label: 'Anaheim', icon: '👥' },
]
```
To:
```tsx
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
```

---

### Verification

After all tasks are complete, visually verify:
1. Opening the app lands on the Home tab (welcome page visible)
2. The sidebar shows: Home, Event Log, Anaheim
3. Clicking "Event Log" shows the existing event dashboard
4. Clicking "Anaheim" shows the employee directory
5. Welcome page renders: bold header, overview paragraph with **Slack** and **Anaheim** bolded, changelog with v1.0 entry
