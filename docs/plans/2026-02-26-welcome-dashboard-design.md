# Welcome Dashboard Design

**Date:** 2026-02-26

## Summary

Add a new welcome/home page as the default landing tab in the agentic-apps-builder-template frontend, replacing the event dashboard as the first thing users see. The existing event dashboard remains accessible under a renamed "Event Log" tab.

## Approach

Option A: New `home` tab as default, existing `dashboard` tab renamed to `event-log`.

## Architecture

### Tab Type Changes (`App.tsx`)
- Add `'home'` to `Tab` union type
- Rename `'dashboard'` → `'event-log'` in Tab type
- Change default `activeTab` from `'dashboard'` to `'home'`
- Add `case 'home': return <Home />` to `renderContent()` switch
- Rename `case 'dashboard'` → `case 'event-log'`

### Sidebar Changes (`Sidebar.tsx`)
- Add `{ id: 'home', label: 'Home', icon: '🏠' }` as first entry
- Rename `{ id: 'dashboard', label: 'Dashboard', ... }` → `{ id: 'event-log', label: 'Event Log', icon: '📊' }`

### New Component (`Home.tsx`)
Static page with three sections:
1. **Header**: Bold h1 — "Welcome to the agentic app template!"
2. **Overview**: Paragraph with Slack and Anaheim bolded
3. **Changelog**: Versioned list — v1.0 with "First version of Agentic App Builder Template released!"

No API calls. Styled with Tailwind matching existing card/text patterns.

## Files Touched

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `home` tab, rename `dashboard` → `event-log` in type + switch + default |
| `frontend/src/components/Sidebar.tsx` | Add Home tab first, rename Dashboard → Event Log |
| `frontend/src/components/Home.tsx` | New file — welcome page component |

## Content

**Header:** Welcome to the agentic app template!

**Overview:** This is the template website for the agentic apps builder, which serves as a playground to build your apps! This template has **Slack** and **Anaheim** integrated. Explore the tabs on the left to see what they look like. If you see a not connected error on the left and you don't use slack, feel free to ignore it, or tell your agent to remove it.

**Changelog:**
- v1.0 — First version of Agentic App Builder Template released!
