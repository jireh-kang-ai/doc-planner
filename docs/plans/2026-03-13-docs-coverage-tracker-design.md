# Vehicle OS Docs Coverage Tracker — Design Doc

**Date:** 2026-03-13
**Status:** Approved

---

## Overview

An internal tool for the Vehicle OS documentation team to plan, organize, and track the status of all documentation pages across four sidebars. The app replaces manual spreadsheet tracking with a structured, editable inventory backed by MySQL.

Usage analytics (page views, time on page) remain in Sigma. This app owns the **planning and structure** side: what docs exist, what's being written, what's planned, and how it all fits together.

---

## Goals

1. **Plan** — track every doc's status (Planned → In Progress → Published) and target sprint
2. **Visualize** — show the full content hierarchy to share with the wider team
3. **Manage** — add, edit, delete docs and sections; create new sidebars as the team grows

---

## Data Model

Single `docs` table in MySQL:

| Column | Type | Notes |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | — |
| `doc_id` | VARCHAR(512) UNIQUE NOT NULL | e.g. `traceability/tutorials/linking_code` |
| `label` | VARCHAR(512) NOT NULL | Human-readable title |
| `sidebar` | VARCHAR(128) NOT NULL | e.g. `developer_tooling` |
| `section` | VARCHAR(1024) NOT NULL DEFAULT '' | Breadcrumb path, e.g. `Traceability > Design` |
| `status` | ENUM('Planned','In Progress','Published') | Default: `Published` |
| `target_sprint` | VARCHAR(16) | e.g. `2026.07`. Null for published docs. |
| `jira_ticket_url` | VARCHAR(1024) | Optional |
| `notes` | TEXT | Optional |
| `created_at` | TIMESTAMP | Auto-set on insert |
| `updated_at` | TIMESTAMP | Auto-updated on change |

### Known Sprints (prepopulated dropdown)

`2026.07`, `2026.03`, `2025.47`, `2025.43`, `2025.41`, `2025.39`, `2025.37`, `2025.35`

---

## Seed Data

On first startup (empty table), insert all ~170 docs parsed from the four sidebar structures:

- `developer_tooling` — ~29 docs
- `infotainment` — ~35 docs
- `onboard_sdk` — ~100 docs
- `vehicle_os` — ~6 static docs (release notes excluded, they are dynamically generated)

All seeded with `status = Published`. Section is the breadcrumb of parent categories (e.g. `Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch`).

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/docs` | List all docs. Query params: `sidebar`, `section`, `status` |
| `POST` | `/api/docs` | Create a single doc |
| `PUT` | `/api/docs/:id` | Update any fields on a doc |
| `DELETE` | `/api/docs/:id` | Delete a doc |
| `GET` | `/api/docs/meta` | Returns `{sidebars: [], sections: [], sprints: []}` for dropdowns |
| `GET` | `/api/docs/export` | Download full inventory as CSV |
| `POST` | `/api/docs/import` | Parse pasted sidebar.ts text, bulk insert (skip duplicates) |

---

## Frontend: Four Tabs

### Tab 1 — Coverage (default)

The main overview table.

- **Summary banner**: Total docs | % Published | # In Progress | # Planned
- **Filter bar**: Sidebar dropdown | Section dropdown | Status filter (All / Planned / In Progress / Published)
- **Sortable table**: Label | Sidebar | Section | Status badge
- **Click row** → slide-in detail panel:
  - Full `doc_id` path
  - Status badge
  - Live doc link: `https://home.applied.co/manual/latest/vehicle_os/{doc_id}.html`
  - Jira ticket link (if set)
  - Target sprint (if set)
  - Notes
- **Buttons**: Export CSV · Add Doc (modal form) · Import sidebar.ts (modal with textarea)

### Tab 2 — Tree

Full hierarchy view — all four sidebars visible and expanded by default. Primary editing interface.

```
▼ 📁 developer_tooling                    [+ Add Section] [✏️] [🗑]
  ▼ 📁 Bazel                  [+ Add Doc] [✏️] [🗑]
      📄 Introduction  ● Published        [✏️] [🗑]
      📄 Basic commands ● Published       [✏️] [🗑]
  ▼ 📁 Traceability           [+ Add Doc] [✏️] [🗑]
    ▼ 📁 Design         [+ Add Doc]       [✏️] [🗑]
        📄 Architecture ● Published       [✏️] [🗑]

▼ 📁 infotainment                         [+ Add Section] [✏️] [🗑]
  ...

[+ New Sidebar]
```

- **Collapse/expand** per sidebar (default: all expanded)
- **✏️ Edit** any node inline: label, doc_id, status, target sprint
- **[+ Add Doc]** at section level → inline new row
- **[+ Add Section]** at sidebar level → new section node
- **[+ New Sidebar]** at page bottom → new top-level sidebar
- **🗑 Delete** any node (with confirmation)
- **Import sidebar.ts** per sidebar → bulk seed an entire sidebar from pasted .ts
- **Status badge colors**: 🟢 Published · 🟡 In Progress · ⚪ Planned
- Moving docs: edit the Section/Sidebar field via ✏️ to reassign

### Tab 3 — Gaps

Docs that are not yet Published, grouped by sidebar → section.

- Shows **In Progress** and **Planned** only
- Group headers show count badge (e.g. `Bazel — 2 gaps`)
- Columns: Label | Status | Target Sprint | Jira Link
- **Mark Published** quick-action per row
- Sorted by target sprint ascending (nearest sprint first)
- Empty state: "No gaps — all docs are published 🎉"

### Tab 4 — Planned

Focused editable view for upcoming docs.

- Inline-editable table: Label | doc_id | Sidebar | Section | Target Sprint | Jira URL | Notes
- **+ Add Planned Doc** button → new inline row, status auto-set to `Planned`
- All fields editable inline
- Target Sprint uses prepopulated dropdown
- Promoting a doc: change status to `In Progress` or `Published` inline

---

## Import Flow (sidebar.ts paste)

1. User clicks **Import sidebar.ts** (on Coverage tab or Tree tab)
2. Modal opens: sidebar name field + large textarea
3. User pastes their `.ts` file content
4. Frontend JS parser traverses the structure, extracts `type: 'doc'` entries and their parent category breadcrumbs
5. Preview list shows: N docs found, with label and inferred section
6. User confirms → `POST /api/docs/import` → backend bulk inserts, skips any `doc_id` already in the table
7. Tree and Coverage tabs refresh

---

## Status Workflow

```
Planned → In Progress → Published
```

All three statuses editable from any tab (Tree ✏️, Coverage detail panel, Gaps quick-action, Planned inline).

---

## Non-Goals (v1)

- Drag-and-drop reordering (v2)
- Snowflake / usage analytics integration (handled in Sigma)
- User authentication / access control
- Orphan view (pages with traffic but no inventory entry) — no Snowflake connection
- Coverage heatmap by month — no usage data
