# Integration Bar Design

## Summary

Replace the full-page Integrations tab with a compact horizontal bar that sits persistently at the top of the main content area, visible on every tab.

## Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ INTEGRATIONS (2/6)  ● Sheets  ○ Docs  ● Drive  ○ Calendar  ○ Jira.. │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                     Tab content (Home, Event Log, etc.)             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Pill States

- **Connected**: filled/dark pill with green dot — `● Google Drive`
- **Disconnected**: muted grey pill — `○ Google Sheets`

## Click Behavior

- Click disconnected pill → launches OAuth popup immediately via POST `/api/connect/{name}`
- Click connected pill → disconnects immediately (no confirmation)
- After either action, bar refreshes connection count

## Files Changed

| Action | File |
|--------|------|
| Create | `frontend/src/components/IntegrationBar.tsx` |
| Modify | `frontend/src/App.tsx` — add bar above tab content, remove `integrations` tab type |
| Modify | `frontend/src/components/Sidebar.tsx` — remove Integrations tab |
| Delete | `frontend/src/components/Integrations.tsx` |

## API

Reuses existing endpoints:
- `GET /api/connections` — returns list of active connections
- `POST /api/connect/{name}` — returns OAuth URL to open in popup
