# Integrations Tab Design

**Date:** 2026-03-05

## Overview

Add a single "Integrations" tab to the sidebar that gives users a way to verify each integration is working and explore its data. Sub-navigation inside the tab covers Slack Bot, Google Docs, and Google Sheets.

## Architecture

### Navigation Changes
- Add `'integrations'` to the `Tab` union type in `App.tsx`
- Add `{ id: 'integrations', label: 'Integrations', icon: '🔌' }` to the `tabs` array in `Sidebar.tsx`
- Add `case 'integrations': return <Integrations />` to `renderContent()` in `App.tsx`

### Component Structure

```
Integrations.tsx          — wrapper; manages activeSubTab state
├── SlackBotTab.tsx       — status card + recent bot events
├── GoogleDocsTab.tsx     — URL/ID input + document text viewer
└── GoogleSheetsTab.tsx   — URL/ID input + table viewer
```

A shared helper `extractGoogleId(url: string): string` parses full Google URLs (matches `/d/{id}/`) or passes through raw IDs as-is.

## Sub-tab Designs

### Slack Bot
- **Status card** using `useStatus()` — shows connected/not-connected with a "How to connect" button that opens the existing `SlackSetupModal`
- **Event feed** polls `GET /api/events` every 5s, shows event type, channel, timestamp in a scrollable list

### Google Docs
- **Connection check** on mount via `GET /api/connections` — if not connected, show a banner: "Connect Google Docs in the integration bar above to get started"
- **URL/ID input bar** with a "Load" button
- **Document viewer** calls `GET /api/integration/docs/v1/documents/{documentId}`, renders title + plain-text body (extracted from `body.content` paragraphs)

### Google Sheets
- Same connection check pattern as Google Docs
- **URL/ID input bar** with a "Load" button
- **Table viewer** calls `GET /api/integration/sheets/spreadsheets/{spreadsheetId}/values/A1:Z200`, renders data as a styled HTML table (sticky header, zebra striping, horizontally scrollable)

## Data Flow

```
User pastes URL → extractGoogleId() → fetch /api/integration/... → render
```

Connection status is checked independently on mount for each sub-tab.

## Error States
- Not connected → friendly banner with instructions
- Doc/sheet not found or API error → inline error message below the input bar
- Empty sheet → "No data found" message

## Files to Create
- `frontend/src/components/Integrations.tsx`
- `frontend/src/components/SlackBotTab.tsx`
- `frontend/src/components/GoogleDocsTab.tsx`
- `frontend/src/components/GoogleSheetsTab.tsx`

## Files to Modify
- `frontend/src/App.tsx` — add tab type + render case
- `frontend/src/components/Sidebar.tsx` — add tab entry
