# Toggleable Sidebar Design

**Date:** 2026-02-26

## Summary

Add a toggle to the sidebar so it starts closed and can be opened/closed via a chevron button. When closed, a narrow strip with a `>` chevron is pinned to the left edge. When open, the full sidebar slides in and pushes the main content right.

## Approach

Push layout: sidebar width animates between a thin strip and full width. State lives in `App.tsx` and is passed as props to `Sidebar.tsx`.

## Architecture

### State (`App.tsx`)
- Add `sidebarOpen` boolean state, default `false`
- Pass `isOpen={sidebarOpen}` and `onToggle={() => setSidebarOpen(v => !v)}` to `<Sidebar>`

### Sidebar (`Sidebar.tsx`)
- Accept new props: `isOpen: boolean`, `onToggle: () => void`
- **Closed state**: thin strip (`w-10`), single centered chevron `>` button, no tabs/status visible
- **Open state**: full width (`w-64`), chevron `<` button in the header, all existing tabs and status indicator visible
- `transition-all duration-300` for smooth width animation

### Chevron
- No icon library — plain text `‹` / `›` or inline SVG
- Rotates/flips based on `isOpen`

## Files Touched

| File | Change |
|------|--------|
| `App.tsx` | Add `sidebarOpen` state (default `false`), pass `isOpen` + `onToggle` props |
| `Sidebar.tsx` | Accept `isOpen`/`onToggle` props, conditional layout for open vs. closed |
