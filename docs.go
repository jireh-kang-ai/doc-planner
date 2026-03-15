package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"cloud.google.com/go/cloudsqlconn"
	"github.com/gin-gonic/gin"
	mysql_driver "github.com/go-sql-driver/mysql"
)

// Doc represents a documentation page entry.
type Doc struct {
	ID            int       `json:"id"`
	DocID         string    `json:"doc_id"`
	Label         string    `json:"label"`
	Sidebar       string    `json:"sidebar"`
	Section       string    `json:"section"`
	Status        string    `json:"status"` // "Planned" | "In Progress" | "Published"
	TargetSprint  *string   `json:"target_sprint"`
	JiraTicketURL *string   `json:"jira_ticket_url"`
	Notes         *string   `json:"notes"`
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

// initMySQL returns a *sql.DB for either local (proxy) or Cloud SQL IAM auth.
func initMySQL(ctx context.Context) (*sql.DB, error) {
	dbUser := os.Getenv("MYSQL_DB_USER")
	dbName := os.Getenv("MYSQL_DB_NAME")
	if dbUser == "" || dbName == "" {
		return nil, fmt.Errorf("missing MYSQL_DB_USER or MYSQL_DB_NAME env vars")
	}

	instanceConnectionName := os.Getenv("MYSQL_INSTANCE_CONNECTION_NAME")
	if instanceConnectionName == "" {
		// Local development: connect via Cloud SQL proxy on localhost:3306
		dsn := fmt.Sprintf("%s@tcp(127.0.0.1:3306)/%s?parseTime=true", dbUser, dbName)
		db, err := sql.Open("mysql", dsn)
		if err != nil {
			return nil, err
		}
		if err := db.PingContext(ctx); err != nil {
			return nil, fmt.Errorf("local MySQL ping failed: %w", err)
		}
		log.Printf("[MySQL] connected locally to %s", dbName)
		return db, nil
	}

	// Cloud Run: use Cloud SQL connector with IAM auth
	dialer, err := cloudsqlconn.NewDialer(ctx,
		cloudsqlconn.WithIAMAuthN(),
		cloudsqlconn.WithDefaultDialOptions(cloudsqlconn.WithPrivateIP()),
	)
	if err != nil {
		return nil, fmt.Errorf("cloudsqlconn.NewDialer: %w", err)
	}

	mysql_driver.RegisterDialContext("cloudsql", func(ctx context.Context, addr string) (net.Conn, error) {
		return dialer.Dial(ctx, instanceConnectionName)
	})

	dsn := fmt.Sprintf("%s@cloudsql(%s)/%s?parseTime=true", dbUser, instanceConnectionName, dbName)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("Cloud SQL ping failed: %w", err)
	}
	log.Printf("[MySQL] connected via Cloud SQL IAM auth to %s", dbName)
	return db, nil
}

// migrateDocsTable creates the docs table if it does not already exist.
func migrateDocsTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS docs (
			id               INT AUTO_INCREMENT PRIMARY KEY,
			doc_id           VARCHAR(512)  NOT NULL,
			label            VARCHAR(512)  NOT NULL,
			sidebar          VARCHAR(255)  NOT NULL,
			section          VARCHAR(1024) NOT NULL DEFAULT '',
			status           VARCHAR(20)   NOT NULL DEFAULT 'Planned',
			target_sprint    VARCHAR(20)   DEFAULT NULL,
			jira_ticket_url  VARCHAR(1024) DEFAULT NULL,
			notes            TEXT          DEFAULT NULL,
			created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY unique_doc (sidebar(191), doc_id(191))
		)
	`)
	if err != nil {
		log.Printf("[MySQL] migrateDocsTable error: %v", err)
		return err
	}
	log.Printf("[MySQL] docs table migration OK")
	return nil
}

// seedDocsIfEmpty inserts seed data when the docs table is empty.
func seedDocsIfEmpty(db *sql.DB) error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM docs").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		log.Printf("[MySQL] docs table already has %d rows, skipping seed", count)
		return nil
	}
	seeds := docSeedData()
	inserted := 0
	for _, sd := range seeds {
		_, err := db.Exec(
			`INSERT IGNORE INTO docs (doc_id, label, sidebar, section, status) VALUES (?, ?, ?, ?, 'Published')`,
			sd.DocID, sd.Label, sd.Sidebar, sd.Section,
		)
		if err != nil {
			log.Printf("[MySQL] seed insert error doc_id=%q: %v", sd.DocID, err)
		} else {
			inserted++
		}
	}
	log.Printf("[MySQL] seeded %d docs (attempted %d)", inserted, len(seeds))
	return nil
}

// registerDocsRoutes wires all /api/docs endpoints onto the router group.
func registerDocsRoutes(api *gin.RouterGroup, db *sql.DB) {
	api.GET("/docs", handleListDocs(db))
	api.GET("/docs/meta", handleDocsMeta(db))
	api.POST("/docs", handleCreateDoc(db))
	api.PUT("/docs/:id", handleUpdateDoc(db))
	api.DELETE("/docs/:id", handleDeleteDoc(db))
}

// scanDoc reads one row from a *sql.Rows into a Doc.
func scanDoc(rows *sql.Rows) (Doc, error) {
	var d Doc
	var targetSprint, jiraTicketURL, notes sql.NullString
	err := rows.Scan(
		&d.ID, &d.DocID, &d.Label, &d.Sidebar, &d.Section,
		&d.Status, &targetSprint, &jiraTicketURL, &notes,
		&d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return d, err
	}
	if targetSprint.Valid {
		d.TargetSprint = &targetSprint.String
	}
	if jiraTicketURL.Valid {
		d.JiraTicketURL = &jiraTicketURL.String
	}
	if notes.Valid {
		d.Notes = &notes.String
	}
	return d, nil
}

func handleListDocs(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sidebar := c.Query("sidebar")
		section := c.Query("section")
		status := c.Query("status")
		log.Printf("[DocsAPI] GET /api/docs sidebar=%q section=%q status=%q", sidebar, section, status)

		query := "SELECT id, doc_id, label, sidebar, section, status, target_sprint, jira_ticket_url, notes, created_at, updated_at FROM docs WHERE 1=1"
		args := []interface{}{}

		if sidebar != "" {
			query += " AND sidebar = ?"
			args = append(args, sidebar)
		}
		if section != "" {
			query += " AND section = ?"
			args = append(args, section)
		}
		if status != "" {
			parts := strings.Split(status, ",")
			placeholders := make([]string, len(parts))
			for i, s := range parts {
				placeholders[i] = "?"
				args = append(args, strings.TrimSpace(s))
			}
			query += " AND status IN (" + strings.Join(placeholders, ",") + ")"
		}
		query += " ORDER BY sidebar, section, label"

		rows, err := db.QueryContext(c.Request.Context(), query, args...)
		if err != nil {
			log.Printf("[DocsAPI] list query error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		docs := []Doc{}
		for rows.Next() {
			d, err := scanDoc(rows)
			if err != nil {
				log.Printf("[DocsAPI] scan error: %v", err)
				continue
			}
			docs = append(docs, d)
		}
		log.Printf("[DocsAPI] GET /api/docs returning %d docs", len(docs))
		c.JSON(http.StatusOK, docs)
	}
}

func handleDocsMeta(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		log.Printf("[DocsAPI] GET /api/docs/meta")

		sidebarRows, err := db.QueryContext(c.Request.Context(),
			"SELECT DISTINCT sidebar FROM docs ORDER BY sidebar")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer sidebarRows.Close()
		var sidebars []string
		for sidebarRows.Next() {
			var s string
			if err := sidebarRows.Scan(&s); err == nil {
				sidebars = append(sidebars, s)
			}
		}

		sectionRows, err := db.QueryContext(c.Request.Context(),
			"SELECT DISTINCT section FROM docs WHERE section != '' ORDER BY section")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer sectionRows.Close()
		var sections []string
		for sectionRows.Next() {
			var s string
			if err := sectionRows.Scan(&s); err == nil {
				sections = append(sections, s)
			}
		}

		if sidebars == nil {
			sidebars = []string{}
		}
		if sections == nil {
			sections = []string{}
		}

		meta := DocMeta{
			Sidebars: sidebars,
			Sections: sections,
			Sprints:  knownSprints,
		}
		log.Printf("[DocsAPI] meta sidebars=%d sections=%d", len(meta.Sidebars), len(meta.Sections))
		c.JSON(http.StatusOK, meta)
	}
}

func handleCreateDoc(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body Doc
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if body.DocID == "" || body.Label == "" || body.Sidebar == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "doc_id, label, and sidebar are required"})
			return
		}
		if body.Status == "" {
			body.Status = "Planned"
		}
		log.Printf("[DocsAPI] POST /api/docs doc_id=%q sidebar=%q section=%q status=%q",
			body.DocID, body.Sidebar, body.Section, body.Status)

		result, err := db.ExecContext(c.Request.Context(),
			`INSERT INTO docs (doc_id, label, sidebar, section, status, target_sprint, jira_ticket_url, notes)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			body.DocID, body.Label, body.Sidebar, body.Section, body.Status,
			body.TargetSprint, body.JiraTicketURL, body.Notes,
		)
		if err != nil {
			log.Printf("[DocsAPI] create error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		newID, _ := result.LastInsertId()
		log.Printf("[DocsAPI] created doc id=%d doc_id=%q", newID, body.DocID)

		// Fetch and return the created doc with generated fields (created_at, updated_at)
		row := db.QueryRowContext(c.Request.Context(),
			"SELECT id, doc_id, label, sidebar, section, status, target_sprint, jira_ticket_url, notes, created_at, updated_at FROM docs WHERE id = ?",
			newID)
		var created Doc
		var ts, jira, notes sql.NullString
		if err := row.Scan(&created.ID, &created.DocID, &created.Label, &created.Sidebar, &created.Section,
			&created.Status, &ts, &jira, &notes, &created.CreatedAt, &created.UpdatedAt); err == nil {
			if ts.Valid {
				created.TargetSprint = &ts.String
			}
			if jira.Valid {
				created.JiraTicketURL = &jira.String
			}
			if notes.Valid {
				created.Notes = &notes.String
			}
		} else {
			created = Doc{ID: int(newID)}
		}
		c.JSON(http.StatusCreated, created)
	}
}

func handleUpdateDoc(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		var body Doc
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("[DocsAPI] PUT /api/docs/%d doc_id=%q status=%q", id, body.DocID, body.Status)

		result, err := db.ExecContext(c.Request.Context(),
			`UPDATE docs SET doc_id=?, label=?, sidebar=?, section=?, status=?, target_sprint=?, jira_ticket_url=?, notes=?
			 WHERE id=?`,
			body.DocID, body.Label, body.Sidebar, body.Section, body.Status,
			body.TargetSprint, body.JiraTicketURL, body.Notes, id,
		)
		if err != nil {
			log.Printf("[DocsAPI] update error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		affected, _ := result.RowsAffected()
		if affected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "doc not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

func handleDeleteDoc(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
			return
		}
		log.Printf("[DocsAPI] DELETE /api/docs/%d", id)

		result, err := db.ExecContext(c.Request.Context(), "DELETE FROM docs WHERE id = ?", id)
		if err != nil {
			log.Printf("[DocsAPI] delete error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		affected, _ := result.RowsAffected()
		if affected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "doc not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// ── Seed data ──────────────────────────────────────────────────────────────────

// seedEntry is a lightweight struct for the initial seed dataset.
type seedEntry struct {
	DocID   string
	Label   string
	Sidebar string
	Section string
}

func docSeedData() []seedEntry {
	return []seedEntry{
		// ── developer_tooling ──────────────────────────────────────────────────
		{"dev_tooling/index", "Overview", "developer_tooling", ""},
		{"dev_tooling/workbench", "Workbench", "developer_tooling", ""},
		{"dev_tooling/dev_docker", "Dev Docker", "developer_tooling", ""},
		// Bazel
		{"dev_tooling/bazel/bazel_intro", "Introduction", "developer_tooling", "Bazel"},
		{"dev_tooling/bazel/basic_commands", "Basic commands", "developer_tooling", "Bazel"},
		{"dev_tooling/bazel/third_party_dependencies", "Third-party dependencies", "developer_tooling", "Bazel"},
		{"dev_tooling/bazel/platforms_and_toolchains", "Platforms and toolchains", "developer_tooling", "Bazel"},
		{"dev_tooling/bazel/deprecating_bazel_targets", "Deprecating Bazel targets", "developer_tooling", "Bazel"},
		// CLI tools
		{"dev_tooling/cli_tools/cli_tools_header", "CLI tools", "developer_tooling", "CLI tools"},
		{"dev_tooling/cli_tools/ssh", "moz ssh", "developer_tooling", "CLI tools"},
		{"dev_tooling/cli_tools/adb", "moz adb", "developer_tooling", "CLI tools"},
		{"dev_tooling/cli_tools/remote_flash", "moz remote flash", "developer_tooling", "CLI tools"},
		// PyArch
		{"dev_tooling/pyarch/concept", "PyArch", "developer_tooling", "PyArch"},
		{"dev_tooling/pyarch/terminology", "Terminology", "developer_tooling", "PyArch"},
		{"dev_tooling/pyarch/structure", "Structure", "developer_tooling", "PyArch"},
		{"dev_tooling/pyarch/meta_model", "Meta model development", "developer_tooling", "PyArch"},
		{"dev_tooling/pyarch/meta_model_reference", "Meta model reference", "developer_tooling", "PyArch"},
		// Coverage
		{"dev_tooling/coverage/coverage", "Coverage", "developer_tooling", "Coverage"},
		{"dev_tooling/coverage/exceptions", "Exceptions", "developer_tooling", "Coverage"},
		{"dev_tooling/coverage/faq", "FAQ", "developer_tooling", "Coverage"},
		// Static analysis
		{"dev_tooling/static_analysis/compliance_tool", "Static analysis", "developer_tooling", "Static analysis"},
		{"dev_tooling/static_analysis/faq", "FAQ", "developer_tooling", "Static analysis"},
		// Traceability
		{"dev_tooling/traceability/concept", "Traceability", "developer_tooling", "Traceability"},
		{"dev_tooling/traceability/design/architecture", "Architecture", "developer_tooling", "Traceability > Design"},
		{"dev_tooling/traceability/design/changelog", "Changelog", "developer_tooling", "Traceability > Design"},
		{"dev_tooling/traceability/design/supported_integrations", "Supported integrations", "developer_tooling", "Traceability > Design"},
		{"dev_tooling/traceability/design/v_model_workflow", "V-Model workflow", "developer_tooling", "Traceability > Design"},
		{"dev_tooling/traceability/tutorials/linking_code", "Link code to requirements", "developer_tooling", "Traceability > Tutorials"},

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
