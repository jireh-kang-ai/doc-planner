# Slack User Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Slack User" data integration pill, rename the existing "Slack" pill to "Slack Bot", explain the difference on the Home page, and document Slack API usage in integrations.md.

**Architecture:** All changes are frontend-only except the docs update. The Slack User pill reuses the existing OAuth popup flow (`POST /api/connect/slack-user`) already present in `IntegrationBar.tsx`. No new backend code is needed.

**Tech Stack:** React 18, TypeScript, Tailwind CSS

---

### Task 1: Rename "Slack" → "Slack Bot" in IntegrationBar and Sidebar

**Files:**
- Modify: `frontend/src/components/IntegrationBar.tsx:150`
- Modify: `frontend/src/components/Sidebar.tsx` (the pill button label)

**Step 1: Update IntegrationBar.tsx pill label**

In `frontend/src/components/IntegrationBar.tsx`, find the Slack button (around line 150) and change its label:

```tsx
// Before
Slack

// After
Slack Bot
```

**Step 2: Update Sidebar.tsx pill label**

In `frontend/src/components/Sidebar.tsx`, find the equivalent Slack button label and change it to `Slack Bot`.

**Step 3: Verify visually**

Run `npm run build` in `frontend/` and confirm the pill now reads "Slack Bot".

**Step 4: Commit**

```bash
git add frontend/src/components/IntegrationBar.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: rename Slack pill to Slack Bot"
```

---

### Task 2: Add Slack User pill to IntegrationBar

**Files:**
- Modify: `frontend/src/components/IntegrationBar.tsx:16-23`

**Step 1: Add Slack User to INTEGRATIONS array**

In `frontend/src/components/IntegrationBar.tsx`, add a new entry to the `INTEGRATIONS` array:

```ts
const INTEGRATIONS: Integration[] = [
  { name: 'sheets', label: 'Google Sheets', providerKey: 'google-sheet' },
  { name: 'docs', label: 'Google Docs', providerKey: 'google-docs' },
  { name: 'drive', label: 'Google Drive', providerKey: 'google-drive' },
  { name: 'calendar', label: 'Google Calendar', providerKey: 'google-calendar' },
  { name: 'jira', label: 'Jira', providerKey: 'jira' },
  { name: 'confluence', label: 'Confluence', providerKey: 'confluence' },
  { name: 'slack-user', label: 'Slack User', providerKey: 'slack-user' },
]
```

This is all that's needed — the existing `handleClick`, `isConnected`, and pill rendering loop already handle it generically.

**Step 2: Verify the total count updates**

The `total` variable is `INTEGRATIONS.length + 1` (the +1 is Slack Bot). With the new entry, `INTEGRATIONS.length` becomes 7, so total becomes 8. Confirm the counter in the bar reads `x/8`.

**Step 3: Commit**

```bash
git add frontend/src/components/IntegrationBar.tsx
git commit -m "feat: add Slack User data integration pill"
```

---

### Task 3: Update Home.tsx with Slack Bot vs Slack User explainer

**Files:**
- Modify: `frontend/src/components/Home.tsx`

**Step 1: Add explainer section after the Overview section**

In `frontend/src/components/Home.tsx`, insert a new `<section>` block after the closing `</section>` of the Overview block (around line 19):

```tsx
<section className="mb-8">
  <h2 className="text-lg font-semibold text-gray-800 mb-2">Slack Bot vs Slack User</h2>
  <div className="space-y-3 text-gray-600 leading-relaxed">
    <p>
      <strong>Slack Bot</strong> is the app's bot identity in your workspace. It can receive
      mentions, respond to slash commands, and send messages proactively. You set it up once
      via the Apps Platform — see the <em>Slack Bot</em> pill in the integration bar above.
    </p>
    <p>
      <strong>Slack User</strong> connects your personal Slack account as a data integration.
      It lets the app read channels, search messages, and act on your behalf using your own
      credentials. Connect it via the <em>Slack User</em> pill in the integration bar above.
    </p>
  </div>
</section>
```

**Step 2: Commit**

```bash
git add frontend/src/components/Home.tsx
git commit -m "feat: add Slack Bot vs Slack User explainer on Home page"
```

---

### Task 4: Document Slack User in integrations.md

**Files:**
- Modify: `.claude/docs/integrations.md`

**Step 1: Add Slack User to the name reference table**

In `.claude/docs/integrations.md`, add a row to the Integration Name Reference table:

```markdown
| Slack (User)    | `slack-user`             | `slack-user`                             |
```

**Step 2: Add Slack User example section at the bottom of the file**

```markdown
## Example: Slack User

```typescript
// List the user's conversations/channels
const res = await fetch('/api/integration/slack-user/conversations.list')

// Get messages in a channel
const res = await fetch('/api/integration/slack-user/conversations.history?channel=C123ABC')

// Search messages
const res = await fetch('/api/integration/slack-user/search.messages?query=hello')

// Post a message as the user
const res = await fetch('/api/integration/slack-user/chat.postMessage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel: 'C123ABC', text: 'Hello from the app!' }),
})

// Get user profile
const res = await fetch('/api/integration/slack-user/users.identity')
```
```

**Step 3: Commit**

```bash
git add .claude/docs/integrations.md
git commit -m "docs: add Slack User integration reference and examples"
```
