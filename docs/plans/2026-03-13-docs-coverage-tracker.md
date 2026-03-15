# Vehicle OS Docs Coverage Tracker — Implementation Plan

**Goal:** Build a four-tab docs inventory app (Coverage, Tree, Gaps, Planned) for the Vehicle OS documentation team, backed by a JSON-file-persisted in-memory store using only Go stdlib.

**Architecture:** A thread-safe in-memory `DocStore` (backed by `/tmp/docs.json`) replaces MySQL — no new Go packages needed. The store seeds ~170 docs from the four sidebar structures on first run and persists all edits between requests. The React frontend replaces all existing tabs with Coverage, Tree, Gaps, and Planned views. MySQL is a clean v2 upgrade once packages can be added.

**Storage note:** Data in `/tmp/docs.json` persists as long as the Cloud Run container is alive. If the container scales to 0 (no traffic for ~15 min) and restarts, the store re-seeds from the hardcoded sidebar data. User edits to status/planned docs survive normal usage sessions but may be lost on a cold restart. This is acceptable for v1 — MySQL persistence is deferred to v2.

---

### Task 1: Enable MySQL flag in project.toml

**Task description**
Flip `enable_mysql` to true so the platform knows this app intends to use a database. Even though we're using file persistence in v1, this primes the app for the MySQL v2 upgrade.

**Files:**
- Modify: `project.toml`

**Step 1: Edit project.toml**

Change line 5 from:
```toml
enable_mysql = false
```
To:
```toml
enable_mysql = true
```

**Step 2: Verify**
Open `project.toml` and confirm `enable_mysql = true`.

---

### Task 2: Create `store.go` — in-memory doc store with file persistence

**Task description**
This file is the entire data layer. It provides a thread-safe in-memory store of `Doc` structs, seeds from hardcoded sidebar data on first run, and persists every mutation to `/tmp/docs.json`. All API handlers call this store.

**Files:**
- Create: `store.go`

**Step 1: Write store.go**

```go
package main

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

// Doc represents a single documentation page in the inventory.
type Doc struct {
	ID            int       `json:"id"`
	DocID         string    `json:"doc_id"`
	Label         string    `json:"label"`
	Sidebar       string    `json:"sidebar"`
	Section       string    `json:"section"`
	Status        string    `json:"status"` // "Planned" | "In Progress" | "Published"
	TargetSprint  string    `json:"target_sprint"`
	JiraTicketURL string    `json:"jira_ticket_url"`
	Notes         string    `json:"notes"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// DocMeta is returned by /api/docs/meta for populating dropdowns.
type DocMeta struct {
	Sidebars []string `json:"sidebars"`
	Sections []string `json:"sections"`
	Sprints  []string `json:"sprints"`
}

var knownSprints = []string{
	"2026.07", "2026.03", "2025.47", "2025.43",
	"2025.41", "2025.39", "2025.37", "2025.35",
}

// storeState is the JSON structure written to disk.
type storeState struct {
	Docs   []Doc `json:"docs"`
	NextID int   `json:"next_id"`
}

// DocStore is a thread-safe in-memory store backed by a JSON file.
type DocStore struct {
	mu       sync.RWMutex
	docs     []Doc
	nextID   int
	filePath string
}

// NewDocStore creates a store, loading from filePath or seeding from defaults.
func NewDocStore(filePath string) *DocStore {
	s := &DocStore{filePath: filePath}
	s.load()
	return s
}

func (s *DocStore) load() {
	data, err := os.ReadFile(s.filePath)
	if err == nil {
		var state storeState
		if err := json.Unmarshal(data, &state); err == nil && len(state.Docs) > 0 {
			s.docs = state.Docs
			s.nextID = state.NextID
			log.Printf("[DocStore] loaded %d docs from %s (nextID=%d)", len(s.docs), s.filePath, s.nextID)
			return
		}
	}
	log.Printf("[DocStore] no persisted state found at %s, seeding from defaults", s.filePath)
	s.seed()
}

func (s *DocStore) save() {
	state := storeState{Docs: s.docs, NextID: s.nextID}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		log.Printf("[DocStore] marshal error: %v", err)
		return
	}
	if err := os.WriteFile(s.filePath, data, 0644); err != nil {
		log.Printf("[DocStore] write error: %v", err)
	} else {
		log.Printf("[DocStore] saved %d docs to %s", len(s.docs), s.filePath)
	}
}

func (s *DocStore) seed() {
	seeds := docSeedData()
	now := time.Now()
	for _, sd := range seeds {
		s.nextID++
		s.docs = append(s.docs, Doc{
			ID:        s.nextID,
			DocID:     sd.docID,
			Label:     sd.label,
			Sidebar:   sd.sidebar,
			Section:   sd.section,
			Status:    "Published",
			CreatedAt: now,
			UpdatedAt: now,
		})
	}
	log.Printf("[DocStore] seeded %d docs", len(s.docs))
	s.save()
}

// List returns docs matching optional filters.
func (s *DocStore) List(sidebar, section, status string) []Doc {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []Doc
	statuses := map[string]bool{}
	if status != "" {
		for _, st := range strings.Split(status, ",") {
			statuses[strings.TrimSpace(st)] = true
		}
	}

	for _, d := range s.docs {
		if sidebar != "" && d.Sidebar != sidebar {
			continue
		}
		if section != "" && d.Section != section {
			continue
		}
		if len(statuses) > 0 && !statuses[d.Status] {
			continue
		}
		result = append(result, d)
	}
	if result == nil {
		return []Doc{}
	}
	return result
}

// Meta returns distinct sidebars, sections, and the known sprints list.
func (s *DocStore) Meta() DocMeta {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sidebarSet := map[string]bool{}
	sectionSet := map[string]bool{}
	for _, d := range s.docs {
		sidebarSet[d.Sidebar] = true
		if d.Section != "" {
			sectionSet[d.Section] = true
		}
	}

	sidebars := sortedKeys(sidebarSet)
	sections := sortedKeys(sectionSet)
	return DocMeta{Sidebars: sidebars, Sections: sections, Sprints: knownSprints}
}

// Create adds a new doc and returns its ID.
func (s *DocStore) Create(d Doc) Doc {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextID++
	d.ID = s.nextID
	now := time.Now()
	d.CreatedAt = now
	d.UpdatedAt = now
	if d.Status == "" {
		d.Status = "Published"
	}
	s.docs = append(s.docs, d)
	s.save()
	log.Printf("[DocStore] created doc id=%d doc_id=%q label=%q sidebar=%q status=%q", d.ID, d.DocID, d.Label, d.Sidebar, d.Status)
	return d
}

// Update modifies an existing doc by ID. Returns false if not found.
func (s *DocStore) Update(id int, updated Doc) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, d := range s.docs {
		if d.ID == id {
			updated.ID = id
			updated.CreatedAt = d.CreatedAt
			updated.UpdatedAt = time.Now()
			s.docs[i] = updated
			s.save()
			log.Printf("[DocStore] updated doc id=%d doc_id=%q status=%q", id, updated.DocID, updated.Status)
			return true
		}
	}
	log.Printf("[DocStore] update: doc id=%d not found", id)
	return false
}

// Delete removes a doc by ID. Returns false if not found.
func (s *DocStore) Delete(id int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, d := range s.docs {
		if d.ID == id {
			s.docs = append(s.docs[:i], s.docs[i+1:]...)
			s.save()
			log.Printf("[DocStore] deleted doc id=%d", id)
			return true
		}
	}
	log.Printf("[DocStore] delete: doc id=%d not found", id)
	return false
}

func sortedKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple sort
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[i] > keys[j] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
}

// seedEntry is a lightweight struct for seed data.
type seedEntry struct {
	docID   string
	label   string
	sidebar string
	section string
}

func docSeedData() []seedEntry {
	return []seedEntry{
		// ── developer_tooling ──────────────────────────────────────────────────
		{"index", "Overview", "developer_tooling", ""},
		{"workbench", "Workbench", "developer_tooling", ""},
		{"dev_docker", "Dev Docker", "developer_tooling", ""},
		// Bazel
		{"bazel/bazel_intro", "Introduction", "developer_tooling", "Bazel"},
		{"bazel/basic_commands", "Basic commands", "developer_tooling", "Bazel"},
		{"bazel/third_party_dependencies", "Third-party dependencies", "developer_tooling", "Bazel"},
		{"bazel/platforms_and_toolchains", "Platforms and toolchains", "developer_tooling", "Bazel"},
		{"bazel/deprecating_bazel_targets", "Deprecating Bazel targets", "developer_tooling", "Bazel"},
		// CLI tools
		{"cli_tools/cli_tools_header", "CLI tools", "developer_tooling", "CLI tools"},
		{"cli_tools/ssh", "moz ssh", "developer_tooling", "CLI tools"},
		{"cli_tools/adb", "moz adb", "developer_tooling", "CLI tools"},
		{"cli_tools/remote_flash", "moz remote flash", "developer_tooling", "CLI tools"},
		// PyArch
		{"pyarch/concept", "PyArch", "developer_tooling", "PyArch"},
		{"pyarch/terminology", "Terminology", "developer_tooling", "PyArch"},
		{"pyarch/structure", "Structure", "developer_tooling", "PyArch"},
		{"pyarch/meta_model", "Meta model development", "developer_tooling", "PyArch"},
		{"pyarch/meta_model_reference", "Meta model reference", "developer_tooling", "PyArch"},
		// Coverage
		{"coverage/coverage", "Coverage", "developer_tooling", "Coverage"},
		{"coverage/exceptions", "Exceptions", "developer_tooling", "Coverage"},
		{"coverage/faq", "FAQ", "developer_tooling", "Coverage"},
		// Static analysis
		{"static_analysis/compliance_tool", "Static analysis", "developer_tooling", "Static analysis"},
		{"static_analysis/faq", "FAQ", "developer_tooling", "Static analysis"},
		// Traceability
		{"traceability/concept", "Traceability", "developer_tooling", "Traceability"},
		{"traceability/design/architecture", "Architecture", "developer_tooling", "Traceability > Design"},
		{"traceability/design/changelog", "Changelog", "developer_tooling", "Traceability > Design"},
		{"traceability/design/supported_integrations", "Supported integrations", "developer_tooling", "Traceability > Design"},
		{"traceability/design/v_model_workflow", "V-Model workflow", "developer_tooling", "Traceability > Design"},
		{"traceability/tutorials/linking_code", "Link code to requirements", "developer_tooling", "Traceability > Tutorials"},

		// ── infotainment ───────────────────────────────────────────────────────
		{"infotainment/introduction", "Introduction", "infotainment", "Introduction"},
		{"infotainment/in_vehicle_experience", "In-vehicle experience", "infotainment", "Introduction"},
		{"infotainment/quickstart", "Quickstart", "infotainment", ""},
		// Essential concepts
		{"infotainment/aaos", "What is AAOS?", "infotainment", "Essential concepts"},
		{"infotainment/gerrit_and_repo", "Gerrit and repo in AAOS", "infotainment", "Essential concepts"},
		{"infotainment/aaos_source_code", "Work with AAOS source code", "infotainment", "Essential concepts"},
		{"infotainment/gabz_build_system", "Gabz build system", "infotainment", "Essential concepts > Gabz build system"},
		{"infotainment/gabz_moz_commands", "Gabz moz commands", "infotainment", "Essential concepts > Gabz build system"},
		{"infotainment/gabz_config", "Gabz configuration reference", "infotainment", "Essential concepts > Gabz build system"},
		// Setup Guides
		{"infotainment/system_requirements", "System requirements", "infotainment", "Setup Guides"},
		{"infotainment/aws", "Set up AWS account", "infotainment", "Setup Guides > Account setup"},
		{"infotainment/github", "Configure GitHub account", "infotainment", "Setup Guides > Account setup"},
		{"infotainment/contribution_guide", "Gerrit contribution guide", "infotainment", "Setup Guides > Gerrit contribution guide"},
		{"infotainment/access_gerrit", "Access Gerrit", "infotainment", "Setup Guides > Gerrit contribution guide"},
		{"infotainment/gerrit_hook", "Set Up Gerrit Hook", "infotainment", "Setup Guides > Gerrit contribution guide"},
		{"infotainment/push_to_gerrit", "Push code to Gerrit", "infotainment", "Setup Guides > Gerrit contribution guide"},
		{"infotainment/manifest_branch_structure", "Manifest branch structure", "infotainment", "Setup Guides"},
		{"infotainment/source_code_management", "Source code management", "infotainment", "Setup Guides"},
		// Developer guides
		{"infotainment/android_app", "Build a new Android app", "infotainment", "Developer guides > Build a new Android app"},
		{"infotainment/app_permissions", "OEM app permissions", "infotainment", "Developer guides > Build a new Android app"},
		{"infotainment/native_service", "Build native Android service", "infotainment", "Developer guides"},
		{"infotainment/driveux_sdk", "Drive UX SDK Tokenization", "infotainment", "Developer guides"},
		{"infotainment/flash_to_board", "Flash an image to a board", "infotainment", "Developer guides"},
		{"infotainment/get_android_log", "Logging", "infotainment", "Developer guides > Logging"},
		{"infotainment/extract_logs", "Extract vehicle logs", "infotainment", "Developer guides > Logging"},
		{"infotainment/aaos_performance", "Performance debugging", "infotainment", "Developer guides"},
		{"infotainment/tech_stack", "AAOS tech stack", "infotainment", "Developer guides"},
		{"infotainment/appium_testing_framework", "HMI testing framework", "infotainment", "Developer guides"},
		{"infotainment/android_vm", "System architecture", "infotainment", "Developer guides > System architecture"},
		{"infotainment/android_vhal_guide", "VHAL", "infotainment", "Developer guides > System architecture"},
		{"infotainment/vehicle_communication", "Communicate with a vehicle", "infotainment", "Developer guides > System architecture"},

		// ── onboard_sdk ────────────────────────────────────────────────────────
		// Overview
		{"onboard_sdk/introduction", "Introduction", "onboard_sdk", "Overview"},
		{"onboard_sdk/bsw", "Base software component", "onboard_sdk", "Overview"},
		// Embedded firmware
		{"onboard_sdk/embedded_firmware/overview", "Embedded firmware", "onboard_sdk", "Embedded firmware"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/index", "Build a classic AUTOSAR feature with PyArch", "onboard_sdk", "Embedded firmware > Tutorials"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/define_interfaces", "1. Define interfaces and data types", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/create_software_components", "2. Create software components", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/create_instances", "3. Create software component instances", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/build_system", "4. Build the system model", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/define_communication", "5. Define communication signals", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/generate_rte", "6. Generate ARXML and RTE", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/implement_firmware", "7. Implement firmware", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/build_and_verify", "8. Build and verify", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/pyarch/write_unit_tests", "9. Write unit tests", "onboard_sdk", "Embedded firmware > Tutorials > Build a classic AUTOSAR feature with PyArch"},
		{"onboard_sdk/embedded_firmware/tutorials/embedded_applications", "Build a native embedded application", "onboard_sdk", "Embedded firmware > Tutorials"},
		// Classic AUTOSAR
		{"onboard_sdk/embedded_firmware/classic/overview", "Classic AUTOSAR development", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development"},
		{"onboard_sdk/embedded_firmware/firmware", "Build a Classic AUTOSAR application", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development"},
		{"onboard_sdk/embedded_firmware/classic/modeling/intro", "Modeling", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development"},
		{"onboard_sdk/embedded_firmware/classic/modeling/howToModel", "How to model", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/modeling/import", "Tools", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/modeling/software", "Software", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/modeling/communication", "Communication", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/modeling/topology", "Topology", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/modeling/system", "System", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/modeling/model", "Model", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > Modeling"},
		{"onboard_sdk/embedded_firmware/classic/rte/intro", "RTE generation", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development"},
		{"onboard_sdk/embedded_firmware/classic/rte/rte", "Runtime environment", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > RTE generation"},
		{"onboard_sdk/embedded_firmware/classic/rte/swcs", "Software components", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > RTE generation"},
		{"onboard_sdk/embedded_firmware/classic/rte/connections", "Connections", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > RTE generation"},
		{"onboard_sdk/embedded_firmware/classic/rte/multiple_instantiation", "Multiple instantiation", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development > RTE generation"},
		{"onboard_sdk/embedded_firmware/classic/hardware_io_abstraction", "Hardware IO Abstractions", "onboard_sdk", "Embedded firmware > Classic AUTOSAR development"},
		// Configuration
		{"onboard_sdk/embedded_firmware/firmware_config_modeling", "Configuration modeling", "onboard_sdk", "Embedded firmware > Configuration"},
		{"onboard_sdk/embedded_firmware/firmware_config_usage", "Configuration usage", "onboard_sdk", "Embedded firmware > Configuration"},
		// Firmware platform
		{"onboard_sdk/embedded_firmware/firmware_startup", "System Startup", "onboard_sdk", "Embedded firmware > Firmware platform"},
		{"onboard_sdk/embedded_firmware/communication/concept", "Communication", "onboard_sdk", "Embedded firmware > Firmware platform"},
		{"onboard_sdk/embedded_firmware/communication/terminology", "Terminology", "onboard_sdk", "Embedded firmware > Firmware platform > Communication"},
		{"onboard_sdk/embedded_firmware/communication/data_structure", "Data structure", "onboard_sdk", "Embedded firmware > Firmware platform > Communication"},
		{"onboard_sdk/embedded_firmware/communication/datastore", "Datastore", "onboard_sdk", "Embedded firmware > Firmware platform > Communication"},
		{"onboard_sdk/embedded_firmware/communication/busgen_user", "Busgen user guide", "onboard_sdk", "Embedded firmware > Firmware platform > Communication"},
		{"onboard_sdk/embedded_firmware/firmware_device_api", "Device API", "onboard_sdk", "Embedded firmware > Firmware platform"},
		{"onboard_sdk/embedded_firmware/nvm/nvm_overview", "Non-volatile memory (NVM)", "onboard_sdk", "Embedded firmware > Firmware platform"},
		{"onboard_sdk/embedded_firmware/nvm/modeling/bsw_nvm_modeling", "BSW NVM block modeling", "onboard_sdk", "Embedded firmware > Firmware platform > Non-volatile memory (NVM)"},
		// Tools and testing > Debugging
		{"onboard_sdk/embedded_firmware/embedded_debugging", "Embedded debugging", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/coredump", "Coredump", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/jtag_shell", "JTAG shell (jtag_sh)", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/s32z2xx_multicore_debug", "S32Z2xx multi-core debug script", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/firmware_fault_injection", "Firmware fault injection", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/open1722_user_guide", "Use Open1722 tools", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/quickstart_UDS_CLI_DoIP", "Run UDS client over DoIP", "onboard_sdk", "Embedded firmware > Tools and testing > Debugging"},
		{"onboard_sdk/embedded_firmware/s32k_flashing_guide", "Flash S32K chips", "onboard_sdk", "Embedded firmware > Tools and testing"},
		{"onboard_sdk/embedded_firmware/palm_z_flashing", "Flash the Palm Z chip", "onboard_sdk", "Embedded firmware > Tools and testing"},
		{"onboard_sdk/embedded_firmware/embedded_unit_testing", "Embedded unit testing", "onboard_sdk", "Embedded firmware > Tools and testing"},
		{"onboard_sdk/embedded_firmware/test_equipment_topology", "Manage bench test equipment", "onboard_sdk", "Embedded firmware > Tools and testing"},
		// HPC
		{"onboard_sdk/hpc/overview", "High performance computing (HPC)", "onboard_sdk", "High performance computing (HPC)"},
		{"onboard_sdk/hpc/adaptive_autosar_api/intro", "Adaptive AUTOSAR API", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API"},
		{"onboard_sdk/hpc/adaptive_autosar_api/tutorials/datatypes", "Datatype modeling", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Tutorials"},
		{"onboard_sdk/hpc/adaptive_autosar_api/tutorials/service_interfaces", "Service interface modeling", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Tutorials"},
		{"onboard_sdk/hpc/adaptive_autosar_api/tutorials/executables", "Executables modeling", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Tutorials"},
		{"onboard_sdk/hpc/adaptive_autosar_api/tutorials/machine", "Machine modeling", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Tutorials"},
		{"onboard_sdk/hpc/adaptive_autosar_api/tutorials/deployment", "Deployment modeling", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Tutorials"},
		{"onboard_sdk/hpc/adaptive_autosar_api/tutorials/signal_gateway", "Signal Gateway", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Tutorials"},
		{"onboard_sdk/hpc/adaptive_autosar_api/concepts/communication", "Communication (ara::com)", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Concepts"},
		{"onboard_sdk/hpc/adaptive_autosar_api/concepts/phm", "Platform Health Management (ara::phm)", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Concepts"},
		{"onboard_sdk/hpc/adaptive_autosar_api/concepts/persistency", "Persistency (ara::per)", "onboard_sdk", "High performance computing (HPC) > Adaptive AUTOSAR API > Concepts"},
		{"onboard_sdk/hpc/component_api/components", "Component API", "onboard_sdk", "High performance computing (HPC) > Component API"},
		{"onboard_sdk/hpc/component_api/tutorials/component_tutorial", "Build Components", "onboard_sdk", "High performance computing (HPC) > Component API > Tutorials"},
		{"onboard_sdk/hpc/component_api/concepts/architecture", "Architecture", "onboard_sdk", "High performance computing (HPC) > Component API > Concepts"},
		{"onboard_sdk/hpc/component_api/concepts/core_interface", "Core Interface API", "onboard_sdk", "High performance computing (HPC) > Component API > Concepts"},
		{"onboard_sdk/hpc/component_api/concepts/queued_subscription", "Queued subscription", "onboard_sdk", "High performance computing (HPC) > Component API > Concepts"},
		{"onboard_sdk/hpc/component_api/concepts/fault_reporter", "Fault reporter", "onboard_sdk", "High performance computing (HPC) > Component API > Concepts"},
		{"onboard_sdk/hpc/component_api/concepts/serialization", "Serialization", "onboard_sdk", "High performance computing (HPC) > Component API > Concepts"},
		{"onboard_sdk/hpc/component_api/concepts/transport", "Transport", "onboard_sdk", "High performance computing (HPC) > Component API > Concepts"},
		{"onboard_sdk/hpc/component_api/tooling/autapse", "Autapse", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/component_api/tooling/bag_looper", "Bag Looper", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/component_api/tooling/data_processor", "Data processor", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/component_api/tooling/latency_tagging", "Latency tagging", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/component_api/tooling/latency_monitoring", "Latency monitoring", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/component_api/tooling/recorder", "Recorder", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/component_api/tooling/transform_tree", "Transform Tree", "onboard_sdk", "High performance computing (HPC) > Component API > Tooling"},
		{"onboard_sdk/hpc/action_graph_api/action_graph_components", "Action Graph API", "onboard_sdk", "High performance computing (HPC) > Action Graph API"},
		{"onboard_sdk/hpc/action_graph_api/tutorials/action_graph_component_tutorial", "Build Action Graph Components", "onboard_sdk", "High performance computing (HPC) > Action Graph API > Tutorials"},
		{"onboard_sdk/hpc/action_graph_api/tutorials/component_unit_testing", "Unit test components", "onboard_sdk", "High performance computing (HPC) > Action Graph API > Tutorials"},
		{"onboard_sdk/hpc/action_graph_api/tutorials/middleware_sim_bridge", "Middleware Sim Bridge", "onboard_sdk", "High performance computing (HPC) > Action Graph API > Tutorials"},
		{"onboard_sdk/hpc/action_graph_api/tutorials/quickstart", "Reference tutorials", "onboard_sdk", "High performance computing (HPC) > Action Graph API > Tutorials"},
		{"onboard_sdk/hpc/action_graph_api/concepts/deterministic_execution", "Deterministic execution", "onboard_sdk", "High performance computing (HPC) > Action Graph API > Concepts"},
		{"onboard_sdk/hpc/action_graph_api/tooling/composition_conductor", "Composition Conductor", "onboard_sdk", "High performance computing (HPC) > Action Graph API > Tooling"},
		// Diagnostics
		{"onboard_sdk/diagnostics/diagnostics_overview", "Overview", "onboard_sdk", "Diagnostics"},
		{"onboard_sdk/diagnostics/sovd/sovd_user_manual", "SOVD user manual", "onboard_sdk", "Diagnostics > SOVD user manual"},
		{"onboard_sdk/diagnostics/sovd/sovd_operations", "SOVD operations", "onboard_sdk", "Diagnostics > SOVD user manual"},
		{"onboard_sdk/diagnostics/sovd/sovd_registered_operations", "SOVD registered operations", "onboard_sdk", "Diagnostics > SOVD user manual > SOVD operations"},
		{"onboard_sdk/diagnostics/sovd/sovd_making_operations", "Create SOVD operations", "onboard_sdk", "Diagnostics > SOVD user manual > SOVD operations"},
		{"onboard_sdk/diagnostics/sovd/sovd_creating_a_topology", "Create SOVD topologies", "onboard_sdk", "Diagnostics > SOVD user manual"},
		{"onboard_sdk/diagnostics/sovd/adding_sovd_to_a_vehicle", "Add SOVD to a vehicle", "onboard_sdk", "Diagnostics > SOVD user manual"},
		{"onboard_sdk/diagnostics/sovd/troubleshoot_sovd_web_access", "Troubleshoot SOVD not accessible from a web client", "onboard_sdk", "Diagnostics > SOVD user manual"},
		{"onboard_sdk/diagnostics/diag_cli/diag_cli_user_manual", "Diag CLI user manual", "onboard_sdk", "Diagnostics > Diag CLI user manual"},
		{"onboard_sdk/diagnostics/diag_cli/diag_cli_command_reference", "Diag CLI command reference", "onboard_sdk", "Diagnostics > Diag CLI user manual"},
		{"onboard_sdk/diagnostics/sovd_sub_cli/sovd_sub_cli_quickstart", "SOVD sub-CLI quickstart", "onboard_sdk", "Diagnostics > Diag CLI user manual > SOVD sub-CLI"},
		{"onboard_sdk/diagnostics/sovd_sub_cli/sovd_sub_cli_command_reference", "SOVD sub-CLI command reference", "onboard_sdk", "Diagnostics > Diag CLI user manual > SOVD sub-CLI"},
		{"onboard_sdk/diagnostics/sovd_sub_cli/sovd_sub_cli_tutorial", "Read diagnostic data with SOVD sub-CLI", "onboard_sdk", "Diagnostics > Diag CLI user manual > SOVD sub-CLI"},
		{"onboard_sdk/diagnostics/diag_cli/runtime_stats_quickstart", "Runtime stats quickstart", "onboard_sdk", "Diagnostics > Diag CLI user manual > Runtime stats"},
		{"onboard_sdk/diagnostics/diag_cli/runtime_stats_command_reference", "Runtime stats command reference", "onboard_sdk", "Diagnostics > Diag CLI user manual > Runtime stats"},
		{"onboard_sdk/diagnostics/modeling/pyar_modeling_user_manual", "PyAr modeling user manual", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/modeling/swcs/dem_events", "DEM events from SWCs", "onboard_sdk", "Diagnostics > PyAr modeling user manual > SWC diagnostics"},
		{"onboard_sdk/diagnostics/modeling/bsw_dem_modeling", "BSW DEM modeling", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/modeling/bsw_did_modeling", "BSW DID Modeling", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/modeling/bsw_routine_modeling", "BSW routine modeling", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/modeling/bsw_fim_modeling", "BSW FIM modeling", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/modeling/generic_zonal_diagnostics", "Generic Zonal with Diagnostics", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/modeling/pyar_odx_modeling", "PyAr ODX modeling", "onboard_sdk", "Diagnostics > PyAr modeling user manual"},
		{"onboard_sdk/diagnostics/adaptive_dm/posix_dm_guide", "Adaptive Diagnostic Manager", "onboard_sdk", "Diagnostics > Adaptive Diagnostic Manager"},
		{"onboard_sdk/diagnostics/adaptive_dm/posix_dm_events", "Adaptive Diagnostic event modeling and reporting", "onboard_sdk", "Diagnostics > Adaptive Diagnostic Manager"},
		{"onboard_sdk/diagnostics/dem/dtc_guide", "Diagnostic Trouble Codes (DTCs)", "onboard_sdk", "Diagnostics > DEM tools"},
		{"onboard_sdk/diagnostics/dem/dem_monitor", "DEM Monitor user manual", "onboard_sdk", "Diagnostics > DEM tools"},
		{"onboard_sdk/diagnostics/firmware/memmap_tool", "Memmap tool user manual", "onboard_sdk", "Diagnostics > Firmware tools"},
		{"onboard_sdk/diagnostics/xcp/xcp_server", "XCP server user guide", "onboard_sdk", "Diagnostics"},
		// Testing and validation
		{"onboard_sdk/sil/overview", "Software-in-the-loop (SIL)", "onboard_sdk", "Testing and validation > Software-in-the-loop (SIL)"},
		{"onboard_sdk/sil/vecu", "Virtual ECUs", "onboard_sdk", "Testing and validation > Software-in-the-loop (SIL)"},
		{"onboard_sdk/sil/adaptive_applications", "Run Adaptive AUTOSAR applications", "onboard_sdk", "Testing and validation > Software-in-the-loop (SIL)"},
		{"onboard_sdk/sil/firmware_applications", "Run firmware applications", "onboard_sdk", "Testing and validation > Software-in-the-loop (SIL)"},
		{"onboard_sdk/signal_probe", "Test with Signal Probe", "onboard_sdk", "Testing and validation"},
		{"onboard_sdk/local_rig_injector", "Test with Local Rig Injector", "onboard_sdk", "Testing and validation"},
		{"onboard_sdk/sil/integration_testing", "Integration testing", "onboard_sdk", "Testing and validation > Integration testing"},
		{"onboard_sdk/sil/integration_testing/overview", "Overview", "onboard_sdk", "Testing and validation > Integration testing"},
		{"onboard_sdk/sil/integration_testing/framework", "Framework", "onboard_sdk", "Testing and validation > Integration testing"},
		{"onboard_sdk/sil/integration_testing/available_fixtures", "Available fixtures", "onboard_sdk", "Testing and validation > Integration testing"},
		{"onboard_sdk/sil/integration_testing/writing_and_running_tests", "Writing and running tests", "onboard_sdk", "Testing and validation > Integration testing"},
		{"onboard_sdk/sil/integration_testing/example_test", "Example test", "onboard_sdk", "Testing and validation > Integration testing"},
		// Reference
		{"onboard_sdk/onboard_folder_structure", "Onboard folder structure", "onboard_sdk", "Reference"},
		{"onboard_sdk/coding_guidelines", "Coding style guidelines", "onboard_sdk", "Reference"},

		// ── vehicle_os ─────────────────────────────────────────────────────────
		{"vehicle_os/introduction", "Overview", "vehicle_os", ""},
		{"vehicle_os/get_started/index", "Get started", "vehicle_os", "Get started"},
		{"vehicle_os/get_started/set_up_environment", "Set up environment", "vehicle_os", "Get started"},
		{"vehicle_os/get_started/build_see_you_home_feature", "Build the See You Home feature", "vehicle_os", "Get started"},
		{"vehicle_os/get_started/submit_your_changes", "Submit your changes", "vehicle_os", "Get started"},
		{"vehicle_os/roadmap", "Roadmap", "vehicle_os", ""},
		{"vehicle_os/release-management", "Release management", "vehicle_os", ""},
	}
}
```

**Step 2: Verify the file compiles**

```bash
go build ./...
```
Expected: no errors.

---

### Task 3: Create `docs.go` — HTTP API handlers

**Task description**
This file registers all five REST API routes for the docs tracker. It receives a `*DocStore` and wires it to Gin handlers. All handlers log with `[DocsAPI]` prefix.

**Files:**
- Create: `docs.go`

**Step 1: Write docs.go**

```go
package main

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func registerDocsRoutes(r *gin.Engine, store *DocStore) {
	// GET /api/docs — list docs with optional filters
	r.GET("/api/docs", func(c *gin.Context) {
		sidebar := c.Query("sidebar")
		section := c.Query("section")
		status := c.Query("status")
		log.Printf("[DocsAPI] GET /api/docs sidebar=%q section=%q status=%q", sidebar, section, status)
		docs := store.List(sidebar, section, status)
		c.JSON(http.StatusOK, docs)
	})

	// GET /api/docs/meta — return sidebars, sections, sprints for dropdowns
	r.GET("/api/docs/meta", func(c *gin.Context) {
		log.Printf("[DocsAPI] GET /api/docs/meta")
		meta := store.Meta()
		log.Printf("[DocsAPI] meta: %d sidebars, %d sections", len(meta.Sidebars), len(meta.Sections))
		c.JSON(http.StatusOK, meta)
	})

	// POST /api/docs — create a doc
	r.POST("/api/docs", func(c *gin.Context) {
		var body Doc
		if err := c.ShouldBindJSON(&body); err != nil {
			log.Printf("[DocsAPI] POST /api/docs bind error: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if body.DocID == "" || body.Label == "" || body.Sidebar == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "doc_id, label, and sidebar are required"})
			return
		}
		log.Printf("[DocsAPI] POST /api/docs doc_id=%q label=%q sidebar=%q status=%q", body.DocID, body.Label, body.Sidebar, body.Status)
		created := store.Create(body)
		c.JSON(http.StatusCreated, created)
	})

	// PUT /api/docs/:id — update a doc
	r.PUT("/api/docs/:id", func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		var body Doc
		if err := c.ShouldBindJSON(&body); err != nil {
			log.Printf("[DocsAPI] PUT /api/docs/%d bind error: %v", id, err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("[DocsAPI] PUT /api/docs/%d doc_id=%q status=%q", id, body.DocID, body.Status)
		if !store.Update(id, body) {
			c.JSON(http.StatusNotFound, gin.H{"error": "doc not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// DELETE /api/docs/:id — delete a doc
	r.DELETE("/api/docs/:id", func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		log.Printf("[DocsAPI] DELETE /api/docs/%d", id)
		if !store.Delete(id) {
			c.JSON(http.StatusNotFound, gin.H{"error": "doc not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}
```

**Step 2: Verify**

```bash
go build ./...
```
Expected: no errors.

---

### Task 4: Wire the store into `main.go`

**Task description**
Initialize the `DocStore` in `main()` and pass it to `registerDocsRoutes`. Add two lines after `registerAPIRoutes`.

**Files:**
- Modify: `main.go`

**Step 1: Add the store initialization after `registerAPIRoutes`**

Find this line in `main.go`:
```go
registerAPIRoutes(r, bot, anaheimClient)
```

Add immediately after it:
```go
	// Docs coverage tracker
	docStore := NewDocStore("/tmp/docs.json")
	registerDocsRoutes(r, docStore)
```

**Step 2: Verify build**

```bash
go build ./...
```
Expected: no errors. If there are import issues (e.g. `log` not imported in main.go), they will appear in `store.go` and `docs.go`, not main.go — those files have their own imports.

---

### Task 5: Update `frontend/src/App.tsx` — new Tab type and routing

**Task description**
Replace the existing tab type and rendering switch with the four new docs tabs. Keep the `StatusContext` and sidebar toggle — remove only the tab-specific imports and cases.

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: Write the updated App.tsx**

```tsx
import { useState, createContext, useContext } from 'react'
import Sidebar from './components/Sidebar'
import CoverageTab from './components/CoverageTab'
import TreeTab from './components/TreeTab'
import GapsTab from './components/GapsTab'
import PlannedTab from './components/PlannedTab'
import IntegrationBar from './components/IntegrationBar'

export type Tab = 'coverage' | 'tree' | 'gaps' | 'planned'

interface BotStatus {
  ready: boolean
  message: string
}

const StatusContext = createContext<BotStatus>({ ready: false, message: 'Loading...' })

export function useStatus() {
  return useContext(StatusContext)
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('coverage')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const status: BotStatus = { ready: true, message: 'Docs Tracker' }

  const renderContent = () => {
    switch (activeTab) {
      case 'coverage': return <CoverageTab />
      case 'tree':     return <TreeTab />
      case 'gaps':     return <GapsTab />
      case 'planned':  return <PlannedTab />
      default:         return <CoverageTab />
    }
  }

  return (
    <StatusContext.Provider value={status}>
      <div className="flex h-screen bg-gray-100">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isOpen={sidebarOpen} onToggle={() => setSidebarOpen(v => !v)} />
        <main className="flex-1 overflow-auto flex flex-col">
          <IntegrationBar />
          <div className="flex-1 overflow-auto p-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </StatusContext.Provider>
  )
}

export default App
```

---

### Task 6: Update `frontend/src/components/Sidebar.tsx` — four new tabs

**Task description**
Replace the existing tabs array with the four docs tabs. Keep the existing collapsible sidebar chrome.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: Replace only the tabs array and header**

Find and replace:
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
  { id: 'integrations', label: 'Integrations', icon: '🔌' },
]
```

With:
```tsx
const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'coverage', label: 'Coverage', icon: '📋' },
  { id: 'tree',     label: 'Tree',     icon: '🌲' },
  { id: 'gaps',     label: 'Gaps',     icon: '🔍' },
  { id: 'planned',  label: 'Planned',  icon: '📅' },
]
```

Also update the header text in the sidebar component from `"Agentic App Template"` to `"Docs Tracker"` and subtitle from `"Go + React"` to `"Vehicle OS"`:

Find:
```tsx
<h1 className="text-xl font-bold text-gray-800">Agentic App Template</h1>
<p className="text-sm text-gray-500 mt-1">Go + React</p>
```
Replace with:
```tsx
<h1 className="text-xl font-bold text-gray-800">Docs Tracker</h1>
<p className="text-sm text-gray-500 mt-1">Vehicle OS</p>
```

---

### Task 7: Create `frontend/src/lib/docsApi.ts` — shared types and fetch helpers

**Task description**
All four tab components import from here. Centralizes the `Doc` type, API fetch functions, sprint list, and status badge color helper.

**Files:**
- Create: `frontend/src/lib/docsApi.ts`

**Step 1: Write docsApi.ts**

```typescript
export interface Doc {
  id: number
  doc_id: string
  label: string
  sidebar: string
  section: string
  status: 'Planned' | 'In Progress' | 'Published'
  target_sprint: string
  jira_ticket_url: string
  notes: string
  created_at: string
  updated_at: string
}

export interface DocMeta {
  sidebars: string[]
  sections: string[]
  sprints: string[]
}

export const KNOWN_SPRINTS = [
  '2026.07', '2026.03', '2025.47', '2025.43',
  '2025.41', '2025.39', '2025.37', '2025.35',
]

export const ALL_STATUSES = ['Published', 'In Progress', 'Planned'] as const

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Published':   return 'bg-green-100 text-green-800'
    case 'In Progress': return 'bg-yellow-100 text-yellow-800'
    case 'Planned':     return 'bg-gray-100 text-gray-600'
    default:            return 'bg-gray-100 text-gray-600'
  }
}

export function statusDot(status: string): string {
  switch (status) {
    case 'Published':   return '🟢'
    case 'In Progress': return '🟡'
    case 'Planned':     return '⚪'
    default:            return '⚪'
  }
}

export async function fetchDocs(params?: {
  sidebar?: string
  section?: string
  status?: string
}): Promise<Doc[]> {
  const q = new URLSearchParams()
  if (params?.sidebar) q.set('sidebar', params.sidebar)
  if (params?.section)  q.set('section',  params.section)
  if (params?.status)   q.set('status',   params.status)
  const res = await fetch(`/api/docs?${q}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchMeta(): Promise<DocMeta> {
  const res = await fetch('/api/docs/meta')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createDoc(doc: Partial<Doc>): Promise<Doc> {
  const res = await fetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateDoc(id: number, doc: Partial<Doc>): Promise<void> {
  const res = await fetch(`/api/docs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function deleteDoc(id: number): Promise<void> {
  const res = await fetch(`/api/docs/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await res.text())
}
```

---

### Task 8: Create `frontend/src/components/CoverageTab.tsx`

**Task description**
The default landing tab. Shows a summary banner, filter bar, and sortable table of all docs. Includes an Add Doc modal.

**Files:**
- Create: `frontend/src/components/CoverageTab.tsx`

**Step 1: Write CoverageTab.tsx**

```tsx
import { useState, useEffect, useMemo } from 'react'
import {
  Doc, DocMeta, fetchDocs, fetchMeta, createDoc, deleteDoc, updateDoc,
  statusBadgeClass, statusDot, KNOWN_SPRINTS, ALL_STATUSES
} from '../lib/docsApi'

type SortKey = 'label' | 'sidebar' | 'section' | 'status'

const EMPTY_FORM: Partial<Doc> = {
  doc_id: '', label: '', sidebar: '', section: '',
  status: 'Published', target_sprint: '', jira_ticket_url: '', notes: ''
}

export default function CoverageTab() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [meta, setMeta] = useState<DocMeta>({ sidebars: [], sections: [], sprints: KNOWN_SPRINTS })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterSidebar, setFilterSidebar] = useState('')
  const [filterSection, setFilterSection] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('label')
  const [sortAsc, setSortAsc] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<Partial<Doc>>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Doc | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [d, m] = await Promise.all([
        fetchDocs({ sidebar: filterSidebar, section: filterSection, status: filterStatus }),
        fetchMeta()
      ])
      setDocs(d)
      setMeta(m)
    } catch (e: any) {
      setError(e.message || 'Failed to load docs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterSidebar, filterSection, filterStatus])

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => {
      const av = a[sortKey] || ''
      const bv = b[sortKey] || ''
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [docs, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const total = docs.length
  const published = docs.filter(d => d.status === 'Published').length
  const inProgress = docs.filter(d => d.status === 'In Progress').length
  const planned = docs.filter(d => d.status === 'Planned').length
  const pctPublished = total > 0 ? Math.round((published / total) * 100) : 0

  const handleSave = async () => {
    if (!form.doc_id || !form.label || !form.sidebar) {
      setFormError('doc_id, label, and sidebar are required')
      return
    }
    try {
      setSaving(true)
      setFormError('')
      await createDoc(form)
      setShowModal(false)
      setForm(EMPTY_FORM)
      load()
    } catch (e: any) {
      setFormError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (doc: Doc) => {
    try {
      await deleteDoc(doc.id)
      setDeleteConfirm(null)
      load()
    } catch (e: any) {
      setError(e.message || 'Delete failed')
    }
  }

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total docs', value: total, color: 'text-gray-800' },
          { label: '% Published', value: `${pctPublished}%`, color: 'text-green-700' },
          { label: 'In Progress', value: inProgress, color: 'text-yellow-700' },
          { label: 'Planned', value: planned, color: 'text-gray-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar + actions */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <select value={filterSidebar} onChange={e => setFilterSidebar(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="">All sidebars</option>
            {meta.sidebars.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="">All sections</option>
            {meta.sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm">
            <option value="">All statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filterSidebar || filterSection || filterStatus) && (
            <button onClick={() => { setFilterSidebar(''); setFilterSection(''); setFilterStatus('') }}
              className="text-sm text-blue-600 hover:underline">Clear filters</button>
          )}
        </div>
        <button onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError('') }}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
          + Add Doc
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No docs found. Try clearing filters or adding a doc.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortHeader k="label" label="Title" />
                <SortHeader k="sidebar" label="Sidebar" />
                <SortHeader k="section" label="Section" />
                <SortHeader k="status" label="Status" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{doc.label}</td>
                  <td className="px-4 py-3 text-gray-500">{doc.sidebar}</td>
                  <td className="px-4 py-3 text-gray-500">{doc.section || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(doc.status)}`}>
                      {statusDot(doc.status)} {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDeleteConfirm(doc)}
                      className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Doc modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-bold">Add Doc</h2>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            {[
              { key: 'label', label: 'Title *', placeholder: 'e.g. Link code to requirements' },
              { key: 'doc_id', label: 'Doc ID (path) *', placeholder: 'e.g. traceability/tutorials/linking_code' },
              { key: 'jira_ticket_url', label: 'Jira URL', placeholder: 'https://jira.../DOCS-123' },
              { key: 'notes', label: 'Notes', placeholder: '' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                {f.key === 'notes' ? (
                  <textarea
                    className="w-full border rounded px-3 py-2 text-sm"
                    rows={2}
                    value={(form as any)[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={(form as any)[f.key] || ''}
                    placeholder={f.placeholder}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sidebar *</label>
                <input list="sidebar-list" className="w-full border rounded px-3 py-2 text-sm"
                  value={form.sidebar || ''}
                  onChange={e => setForm(prev => ({ ...prev, sidebar: e.target.value }))} />
                <datalist id="sidebar-list">
                  {meta.sidebars.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                <input list="section-list" className="w-full border rounded px-3 py-2 text-sm"
                  value={form.section || ''}
                  onChange={e => setForm(prev => ({ ...prev, section: e.target.value }))} />
                <datalist id="section-list">
                  {meta.sections.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="w-full border rounded px-3 py-2 text-sm"
                  value={form.status || 'Published'}
                  onChange={e => setForm(prev => ({ ...prev, status: e.target.value as Doc['status'] }))}>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Sprint</label>
                <select className="w-full border rounded px-3 py-2 text-sm"
                  value={form.target_sprint || ''}
                  onChange={e => setForm(prev => ({ ...prev, target_sprint: e.target.value }))}>
                  <option value="">None</option>
                  {KNOWN_SPRINTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-700">Delete doc?</h2>
            <p className="text-sm text-gray-600">
              Delete <strong>"{deleteConfirm.label}"</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### Task 9: Create `frontend/src/components/TreeTab.tsx`

**Task description**
The editable hierarchy view. All four sidebars visible, expanded by default. Click ✏️ to edit any doc inline. Add/delete at every level. Sections are derived from docs — no separate section entity.

**Files:**
- Create: `frontend/src/components/TreeTab.tsx`

**Step 1: Write TreeTab.tsx**

```tsx
import { useState, useEffect } from 'react'
import {
  Doc, fetchDocs, createDoc, updateDoc, deleteDoc,
  statusDot, statusBadgeClass, KNOWN_SPRINTS, ALL_STATUSES
} from '../lib/docsApi'

interface TreeSection {
  path: string
  name: string
  docs: Doc[]
  children: TreeSection[]
}

interface TreeSidebar {
  name: string
  topDocs: Doc[]
  sections: TreeSection[]
}

function buildTree(docs: Doc[]): TreeSidebar[] {
  const sidebarMap = new Map<string, Doc[]>()
  for (const d of docs) {
    if (!sidebarMap.has(d.sidebar)) sidebarMap.set(d.sidebar, [])
    sidebarMap.get(d.sidebar)!.push(d)
  }

  const sidebars: TreeSidebar[] = []
  sidebarMap.forEach((sidebarDocs, sidebarName) => {
    const topDocs = sidebarDocs.filter(d => !d.section)
    const sectioned = sidebarDocs.filter(d => d.section)

    const sectionNodeMap = new Map<string, TreeSection>()
    const rootSections: TreeSection[] = []

    const allSectionPaths = [...new Set(sectioned.map(d => d.section))].sort()
    for (const sectionPath of allSectionPaths) {
      const parts = sectionPath.split(' > ')
      let currentPath = ''
      let parentChildren = rootSections
      for (let i = 0; i < parts.length; i++) {
        const prevPath = currentPath
        currentPath = i === 0 ? parts[i] : `${currentPath} > ${parts[i]}`
        if (!sectionNodeMap.has(currentPath)) {
          const node: TreeSection = { path: currentPath, name: parts[i], docs: [], children: [] }
          sectionNodeMap.set(currentPath, node)
          if (i === 0) rootSections.push(node)
          else sectionNodeMap.get(prevPath)?.children.push(node)
        }
        parentChildren = sectionNodeMap.get(currentPath)!.children
      }
    }
    for (const d of sectioned) {
      sectionNodeMap.get(d.section)?.docs.push(d)
    }

    sidebars.push({ name: sidebarName, topDocs, sections: rootSections })
  })

  return sidebars.sort((a, b) => a.name.localeCompare(b.name))
}

const EMPTY_DOC = (sidebar: string, section: string): Partial<Doc> => ({
  doc_id: '', label: '', sidebar, section, status: 'Published', target_sprint: '', jira_ticket_url: '', notes: ''
})

export default function TreeTab() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<Doc>>({})
  const [addingIn, setAddingIn] = useState<{ sidebar: string; section: string } | null>(null)
  const [addForm, setAddForm] = useState<Partial<Doc>>({})
  const [addingSection, setAddingSection] = useState<{ sidebar: string; parentSection: string } | null>(null)
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSidebar, setAddingSidebar] = useState(false)
  const [newSidebarName, setNewSidebarName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'doc' | 'section' | 'sidebar'; label: string; count: number; action: () => void } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const d = await fetchDocs()
      setDocs(d)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const tree = buildTree(docs)

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const startEdit = (doc: Doc) => {
    setEditingId(doc.id)
    setEditForm({ ...doc })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      setSaving(true)
      await updateDoc(editingId, editForm as Doc)
      setEditingId(null)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const saveAdd = async () => {
    if (!addForm.doc_id || !addForm.label) { setError('doc_id and label are required'); return }
    try {
      setSaving(true)
      setError('')
      await createDoc(addForm)
      setAddingIn(null)
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const doDeleteDoc = async (doc: Doc) => {
    await deleteDoc(doc.id)
    setDeleteConfirm(null)
    load()
  }

  const doDeleteSection = async (sidebar: string, sectionPath: string) => {
    const toDelete = docs.filter(d => d.sidebar === sidebar && (d.section === sectionPath || d.section.startsWith(sectionPath + ' > ')))
    for (const d of toDelete) await deleteDoc(d.id)
    setDeleteConfirm(null)
    load()
  }

  const doDeleteSidebar = async (sidebar: string) => {
    const toDelete = docs.filter(d => d.sidebar === sidebar)
    for (const d of toDelete) await deleteDoc(d.id)
    setDeleteConfirm(null)
    load()
  }

  const confirmDeleteDoc = (doc: Doc) => setDeleteConfirm({
    type: 'doc', label: doc.label, count: 1, action: () => doDeleteDoc(doc)
  })

  const confirmDeleteSection = (sidebar: string, section: TreeSection) => {
    const count = docs.filter(d => d.sidebar === sidebar && (d.section === section.path || d.section.startsWith(section.path + ' > '))).length
    setDeleteConfirm({ type: 'section', label: section.name, count, action: () => doDeleteSection(sidebar, section.path) })
  }

  const confirmDeleteSidebar = (sidebar: string) => {
    const count = docs.filter(d => d.sidebar === sidebar).length
    setDeleteConfirm({ type: 'sidebar', label: sidebar, count, action: () => doDeleteSidebar(sidebar) })
  }

  const InlineEditRow = ({ doc }: { doc: Doc }) => (
    <div className="flex items-center gap-2 ml-1 py-1 px-2 bg-blue-50 rounded border border-blue-200">
      <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="Label"
        value={editForm.label || ''} onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))} />
      <input className="border rounded px-2 py-1 text-xs w-48" placeholder="doc_id path"
        value={editForm.doc_id || ''} onChange={e => setEditForm(p => ({ ...p, doc_id: e.target.value }))} />
      <select className="border rounded px-2 py-1 text-xs"
        value={editForm.status || 'Published'} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as Doc['status'] }))}>
        {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="border rounded px-2 py-1 text-xs"
        value={editForm.target_sprint || ''} onChange={e => setEditForm(p => ({ ...p, target_sprint: e.target.value }))}>
        <option value="">No sprint</option>
        {KNOWN_SPRINTS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="border rounded px-2 py-1 text-xs w-32" placeholder="Jira URL"
        value={editForm.jira_ticket_url || ''} onChange={e => setEditForm(p => ({ ...p, jira_ticket_url: e.target.value }))} />
      <button onClick={saveEdit} disabled={saving}
        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">✓</button>
      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
    </div>
  )

  const AddDocRow = ({ sidebar, section }: { sidebar: string; section: string }) => (
    <div className="flex items-center gap-2 ml-1 py-1 px-2 bg-green-50 rounded border border-green-200 mt-1">
      <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="Label *"
        value={addForm.label || ''} onChange={e => setAddForm(p => ({ ...p, label: e.target.value }))} />
      <input className="border rounded px-2 py-1 text-xs w-48" placeholder="doc_id path *"
        value={addForm.doc_id || ''} onChange={e => setAddForm(p => ({ ...p, doc_id: e.target.value }))} />
      <select className="border rounded px-2 py-1 text-xs"
        value={addForm.status || 'Published'} onChange={e => setAddForm(p => ({ ...p, status: e.target.value as Doc['status'] }))}>
        {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={saveAdd} disabled={saving}
        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50">Add</button>
      <button onClick={() => setAddingIn(null)} className="text-xs text-gray-500 hover:text-gray-700">✕</button>
    </div>
  )

  const DocRow = ({ doc, indent }: { doc: Doc; indent: number }) => {
    if (editingId === doc.id) return (
      <div style={{ marginLeft: indent * 16 }}>
        <InlineEditRow doc={doc} />
      </div>
    )
    return (
      <div style={{ marginLeft: indent * 16 }}
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 group">
        <span className="text-gray-400 text-xs">📄</span>
        <span className="text-sm text-gray-700 flex-1">{doc.label}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusBadgeClass(doc.status)}`}>
          {statusDot(doc.status)} {doc.status}
        </span>
        {doc.target_sprint && (
          <span className="text-xs text-gray-400">{doc.target_sprint}</span>
        )}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => startEdit(doc)} className="text-xs text-blue-500 hover:text-blue-700">✏️</button>
          <button onClick={() => confirmDeleteDoc(doc)} className="text-xs text-red-400 hover:text-red-600">🗑</button>
        </div>
      </div>
    )
  }

  const SectionNode = ({ section, sidebar, indent }: { section: TreeSection; sidebar: string; indent: number }) => {
    const key = `${sidebar}::${section.path}`
    const isOpen = !collapsed.has(key)
    return (
      <div style={{ marginLeft: indent * 16 }} className="mt-1">
        <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 group cursor-pointer"
          onClick={() => toggleCollapse(key)}>
          <span className="text-gray-400 text-xs">{isOpen ? '▼' : '▶'}</span>
          <span className="text-sm font-medium text-gray-600 flex-1">📁 {section.name}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => { setAddingIn({ sidebar, section: section.path }); setAddForm(EMPTY_DOC(sidebar, section.path)) }}
              className="text-xs text-green-500 hover:text-green-700">+ Add Doc</button>
            <button onClick={() => { setAddingSection({ sidebar, parentSection: section.path }); setNewSectionName('') }}
              className="text-xs text-blue-500 hover:text-blue-700">+ Sub-section</button>
            <button onClick={() => confirmDeleteSection(sidebar, section)}
              className="text-xs text-red-400 hover:text-red-600">🗑</button>
          </div>
        </div>
        {isOpen && (
          <div>
            {addingIn?.sidebar === sidebar && addingIn?.section === section.path && (
              <div style={{ marginLeft: 16 }}>
                <AddDocRow sidebar={sidebar} section={section.path} />
              </div>
            )}
            {section.docs.map(d => <DocRow key={d.id} doc={d} indent={1} />)}
            {section.children.map(child => (
              <SectionNode key={child.path} section={child} sidebar={sidebar} indent={1} />
            ))}
            {addingSection?.sidebar === sidebar && addingSection?.parentSection === section.path && (
              <div style={{ marginLeft: 16 }} className="flex items-center gap-2 py-1 px-2 bg-blue-50 rounded border border-blue-200 mt-1">
                <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="New sub-section name"
                  value={newSectionName} onChange={e => setNewSectionName(e.target.value)} />
                <button onClick={() => {
                  setAddingIn({ sidebar, section: section.path + ' > ' + newSectionName })
                  setAddForm(EMPTY_DOC(sidebar, section.path + ' > ' + newSectionName))
                  setAddingSection(null)
                }} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Create</button>
                <button onClick={() => setAddingSection(null)} className="text-xs text-gray-500">✕</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Doc Hierarchy</h2>
        <button onClick={() => { setAddingSidebar(true); setNewSidebarName('') }}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
          + New Sidebar
        </button>
      </div>

      {addingSidebar && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-center gap-3">
          <input className="border rounded px-3 py-1.5 text-sm flex-1" placeholder="New sidebar name (e.g. platform_tools)"
            value={newSidebarName} onChange={e => setNewSidebarName(e.target.value)} />
          <button onClick={() => {
            if (!newSidebarName.trim()) return
            setAddingIn({ sidebar: newSidebarName.trim(), section: '' })
            setAddForm(EMPTY_DOC(newSidebarName.trim(), ''))
            setAddingSidebar(false)
          }} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded">Create & Add First Doc</button>
          <button onClick={() => setAddingSidebar(false)} className="text-sm text-gray-500">✕</button>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      {loading ? (
        <div className="p-12 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {tree.map(sidebar => {
            const sidebarKey = `sidebar::${sidebar.name}`
            const isOpen = !collapsed.has(sidebarKey)
            return (
              <div key={sidebar.name} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => toggleCollapse(sidebarKey)}>
                  <span className="text-gray-500">{isOpen ? '▼' : '▶'}</span>
                  <span className="font-bold text-gray-800 flex-1">📁 {sidebar.name}</span>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setAddingIn({ sidebar: sidebar.name, section: '' }); setAddForm(EMPTY_DOC(sidebar.name, '')) }}
                      className="text-xs text-green-600 hover:text-green-800 border border-green-300 rounded px-2 py-0.5">+ Add Doc</button>
                    <button onClick={() => { setAddingSection({ sidebar: sidebar.name, parentSection: '' }); setNewSectionName('') }}
                      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-2 py-0.5">+ Add Section</button>
                    <button onClick={() => confirmDeleteSidebar(sidebar.name)}
                      className="text-xs text-red-500 hover:text-red-700 border border-red-300 rounded px-2 py-0.5">🗑 Delete sidebar</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="mt-2">
                    {addingIn?.sidebar === sidebar.name && addingIn?.section === '' && (
                      <AddDocRow sidebar={sidebar.name} section="" />
                    )}
                    {addingSection?.sidebar === sidebar.name && addingSection?.parentSection === '' && (
                      <div className="flex items-center gap-2 py-1 px-2 bg-blue-50 rounded border border-blue-200 mt-1">
                        <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="New section name"
                          value={newSectionName} onChange={e => setNewSectionName(e.target.value)} />
                        <button onClick={() => {
                          setAddingIn({ sidebar: sidebar.name, section: newSectionName })
                          setAddForm(EMPTY_DOC(sidebar.name, newSectionName))
                          setAddingSection(null)
                        }} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Create</button>
                        <button onClick={() => setAddingSection(null)} className="text-xs text-gray-500">✕</button>
                      </div>
                    )}
                    {sidebar.topDocs.map(d => <DocRow key={d.id} doc={d} indent={0} />)}
                    {sidebar.sections.map(s => (
                      <SectionNode key={s.path} section={s} sidebar={sidebar.name} indent={0} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-700">
              Delete {deleteConfirm.type}?
            </h2>
            <p className="text-sm text-gray-600">
              {deleteConfirm.type === 'doc' && <>Delete <strong>"{deleteConfirm.label}"</strong>? This cannot be undone.</>}
              {deleteConfirm.type === 'section' && <>Delete section <strong>"{deleteConfirm.label}"</strong> and all <strong>{deleteConfirm.count} docs</strong> inside it? This cannot be undone.</>}
              {deleteConfirm.type === 'sidebar' && <>Delete sidebar <strong>"{deleteConfirm.label}"</strong> and all <strong>{deleteConfirm.count} docs</strong> inside it? This cannot be undone.</>}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={deleteConfirm.action}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### Task 10: Create `frontend/src/components/GapsTab.tsx`

**Task description**
Shows all docs with status "In Progress" or "Planned", grouped by sidebar → section, sorted by target sprint. Shows what needs to be written.

**Files:**
- Create: `frontend/src/components/GapsTab.tsx`

**Step 1: Write GapsTab.tsx**

```tsx
import { useState, useEffect } from 'react'
import { Doc, fetchDocs, statusBadgeClass, statusDot } from '../lib/docsApi'

interface Group {
  key: string
  sidebar: string
  section: string
  docs: Doc[]
}

function groupDocs(docs: Doc[]): Group[] {
  const map = new Map<string, Group>()
  for (const d of docs) {
    const key = `${d.sidebar}::${d.section}`
    if (!map.has(key)) map.set(key, { key, sidebar: d.sidebar, section: d.section, docs: [] })
    map.get(key)!.docs.push(d)
  }
  return [...map.values()].sort((a, b) => {
    const aSprint = a.docs[0]?.target_sprint || 'zzz'
    const bSprint = b.docs[0]?.target_sprint || 'zzz'
    return aSprint.localeCompare(bSprint)
  })
}

export default function GapsTab() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const d = await fetchDocs({ status: 'In Progress,Planned' })
      // Sort by target_sprint ascending, empty sprint last
      d.sort((a, b) => {
        const as = a.target_sprint || 'zzz'
        const bs = b.target_sprint || 'zzz'
        return as.localeCompare(bs)
      })
      setDocs(d)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const groups = groupDocs(docs)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Gaps</h2>
        <span className="text-sm text-gray-500">{docs.length} doc{docs.length !== 1 ? 's' : ''} not yet published</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      {loading ? (
        <div className="p-12 text-center text-gray-400">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-gray-500">No gaps — all docs are published!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.key} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-700">{group.sidebar}</span>
                  {group.section && <span className="text-gray-400 ml-2">/ {group.section}</span>}
                </div>
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                  {group.docs.length} gap{group.docs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {group.docs.map(doc => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{doc.label}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(doc.status)}`}>
                          {statusDot(doc.status)} {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {doc.target_sprint ? `Sprint ${doc.target_sprint}` : <span className="text-gray-300">No sprint</span>}
                      </td>
                      <td className="px-4 py-3">
                        {doc.jira_ticket_url ? (
                          <a href={doc.jira_ticket_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-xs">Jira ↗</a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">{doc.doc_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### Task 11: Create `frontend/src/components/PlannedTab.tsx`

**Task description**
An inline-editable table of all Planned-status docs. Add a new row with "+" button, edit any cell directly, save on blur. Target sprint uses prepopulated dropdown.

**Files:**
- Create: `frontend/src/components/PlannedTab.tsx`

**Step 1: Write PlannedTab.tsx**

```tsx
import { useState, useEffect } from 'react'
import { Doc, fetchDocs, createDoc, updateDoc, deleteDoc, KNOWN_SPRINTS } from '../lib/docsApi'

export default function PlannedTab() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ id: number; field: keyof Doc; value: string } | null>(null)
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState<Partial<Doc>>({
    label: '', doc_id: '', sidebar: '', section: '',
    status: 'Planned', target_sprint: '', jira_ticket_url: '', notes: ''
  })
  const [deleteConfirm, setDeleteConfirm] = useState<Doc | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const d = await fetchDocs({ status: 'Planned' })
      setDocs(d)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const saveField = async (doc: Doc, field: keyof Doc, value: string) => {
    try {
      const updated = { ...doc, [field]: value }
      await updateDoc(doc.id, updated)
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, [field]: value } : d))
    } catch (e: any) {
      setError(e.message)
    }
    setEditing(null)
  }

  const saveNewRow = async () => {
    if (!newRow.label || !newRow.doc_id || !newRow.sidebar) {
      setError('Label, doc ID, and sidebar are required')
      return
    }
    try {
      setSaving(true)
      setError('')
      await createDoc({ ...newRow, status: 'Planned' })
      setAddingRow(false)
      setNewRow({ label: '', doc_id: '', sidebar: '', section: '', status: 'Planned', target_sprint: '', jira_ticket_url: '', notes: '' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async (doc: Doc) => {
    await deleteDoc(doc.id)
    setDeleteConfirm(null)
    load()
  }

  const EditCell = ({ doc, field, wide }: { doc: Doc; field: keyof Doc; wide?: boolean }) => {
    const isEditing = editing?.id === doc.id && editing?.field === field
    const val = (doc[field] as string) || ''
    if (isEditing) {
      if (field === 'target_sprint') {
        return (
          <select autoFocus className="border rounded px-1 py-0.5 text-xs w-full"
            value={editing.value}
            onChange={e => setEditing({ ...editing, value: e.target.value })}
            onBlur={() => saveField(doc, field, editing.value)}>
            <option value="">None</option>
            {KNOWN_SPRINTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )
      }
      return (
        <input autoFocus className={`border rounded px-1 py-0.5 text-xs ${wide ? 'w-full' : 'w-24'}`}
          value={editing.value}
          onChange={e => setEditing({ ...editing, value: e.target.value })}
          onBlur={() => saveField(doc, field, editing.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveField(doc, field, editing.value) }} />
      )
    }
    return (
      <span className={`cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-xs ${val ? '' : 'text-gray-300 italic'}`}
        onClick={() => setEditing({ id: doc.id, field, value: val })}>
        {val || 'click to edit'}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Planned Docs</h2>
        <button onClick={() => setAddingRow(true)}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
          + Add Planned Doc
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Title', 'Doc ID', 'Sidebar', 'Section', 'Sprint', 'Jira', 'Notes', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.length === 0 && !addingRow && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No planned docs yet. Click "+ Add Planned Doc" to start.</td></tr>
              )}
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><EditCell doc={doc} field="label" wide /></td>
                  <td className="px-3 py-2 font-mono"><EditCell doc={doc} field="doc_id" wide /></td>
                  <td className="px-3 py-2"><EditCell doc={doc} field="sidebar" /></td>
                  <td className="px-3 py-2"><EditCell doc={doc} field="section" wide /></td>
                  <td className="px-3 py-2"><EditCell doc={doc} field="target_sprint" /></td>
                  <td className="px-3 py-2">
                    {doc.jira_ticket_url ? (
                      <div className="flex items-center gap-1">
                        <a href={doc.jira_ticket_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-500 hover:underline text-xs">↗</a>
                        <EditCell doc={doc} field="jira_ticket_url" wide />
                      </div>
                    ) : <EditCell doc={doc} field="jira_ticket_url" wide />}
                  </td>
                  <td className="px-3 py-2"><EditCell doc={doc} field="notes" wide /></td>
                  <td className="px-3 py-2">
                    <button onClick={() => setDeleteConfirm(doc)} className="text-red-400 hover:text-red-600 text-xs">🗑</button>
                  </td>
                </tr>
              ))}
              {addingRow && (
                <tr className="bg-green-50">
                  <td className="px-3 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="Title *"
                    value={newRow.label || ''} onChange={e => setNewRow(p => ({ ...p, label: e.target.value }))} /></td>
                  <td className="px-3 py-2"><input className="border rounded px-2 py-1 text-xs w-full font-mono" placeholder="doc_id *"
                    value={newRow.doc_id || ''} onChange={e => setNewRow(p => ({ ...p, doc_id: e.target.value }))} /></td>
                  <td className="px-3 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="Sidebar *"
                    value={newRow.sidebar || ''} onChange={e => setNewRow(p => ({ ...p, sidebar: e.target.value }))} /></td>
                  <td className="px-3 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="Section"
                    value={newRow.section || ''} onChange={e => setNewRow(p => ({ ...p, section: e.target.value }))} /></td>
                  <td className="px-3 py-2">
                    <select className="border rounded px-2 py-1 text-xs w-full"
                      value={newRow.target_sprint || ''} onChange={e => setNewRow(p => ({ ...p, target_sprint: e.target.value }))}>
                      <option value="">None</option>
                      {KNOWN_SPRINTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="Jira URL"
                    value={newRow.jira_ticket_url || ''} onChange={e => setNewRow(p => ({ ...p, jira_ticket_url: e.target.value }))} /></td>
                  <td className="px-3 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="Notes"
                    value={newRow.notes || ''} onChange={e => setNewRow(p => ({ ...p, notes: e.target.value }))} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={saveNewRow} disabled={saving}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded disabled:opacity-50">Add</button>
                      <button onClick={() => setAddingRow(false)} className="text-xs text-gray-500">✕</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-red-700">Delete planned doc?</h2>
            <p className="text-sm text-gray-600">Delete <strong>"{deleteConfirm.label}"</strong>? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button onClick={() => doDelete(deleteConfirm)} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### Task 12: Run `go build ./...` to verify Go compiles

**Task description**
Confirm the Go backend compiles cleanly with the new `store.go` and `docs.go` files and the updated `main.go`.

**Step 1: Run build**

```bash
go build ./...
```

Expected: no output (success). If there are errors, fix them before proceeding.

---

### Task 13: Deploy and verify

**Task description**
Deploy the app to Cloud Run and confirm the docs API seeded correctly by tailing logs.

**Step 1: Deploy**

Use the `apps-platform` skill to run:
```
apps-platform app deploy
```

**Step 2: Tail logs and look for these lines**

Use the `apps-platform` skill to run:
```
apps-platform app logs
```

Expected log lines (confirming success):
```
[DocStore] seeded 170 docs          ← first ever deploy
[DocStore] loaded 170 docs from /tmp/docs.json   ← subsequent restarts
[DocsAPI] GET /api/docs sidebar="" section="" status=""
[DocsAPI] GET /api/docs/meta: 4 sidebars, N sections
```

If you see `[DocStore] seeded 170 docs`, the app is working correctly.

---

### Task 14: Walk the user through the app

**What was built:**
The Vehicle OS Docs Coverage Tracker is live. It's a four-tab React app backed by a Go server that stores ~170 pre-seeded docs (from your four sidebar files) in memory, persisted to `/tmp/docs.json`. Every edit — status changes, new docs, new sections — is saved immediately.

**How to use it:**

1. **Coverage tab** (default) — See the summary banner at the top showing total docs, % published, in-progress count, and planned count. Use the dropdown filters to narrow by sidebar, section, or status. Click column headers to sort. Click "+ Add Doc" to create a new entry via a modal form.

2. **Tree tab** — See all four sidebars fully expanded in a file-browser layout. Hover any row to reveal ✏️ (edit inline) and 🗑 (delete with confirmation). Use "+ Add Doc" at any section level to add a child doc, "+ Add Section" to create a new subsection, and "+ New Sidebar" at the top to create a brand new sidebar. Edits take effect immediately.

3. **Gaps tab** — See all In Progress and Planned docs grouped by sidebar/section, sorted by target sprint. Shows what needs to be written. Empty state shows 🎉 when everything is published.

4. **Planned tab** — Inline-editable table of all Planned docs. Click any cell to edit it. Use the Target Sprint dropdown (pre-loaded with your sprint IDs like `2026.07`). Click "+ Add Planned Doc" to add a new row.

**If something looks wrong:**
- If the tree is empty, check the logs for `[DocStore] seeded` — the store may need a moment to initialize on first deploy.
- If edits don't stick after a container restart, that's expected behavior in v1 (file storage is ephemeral across cold starts). MySQL persistence is the v2 upgrade.
