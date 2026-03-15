# Data API Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Data API OAuth proxy routes to the Go backend and a new "Integrations" sidebar tab showing connection status for Google Sheets, Docs, Drive, Calendar, Jira, and Confluence.

**Architecture:** New `dataapi.go` file holds all Data API helpers (`dataAPIURL`, `initIDTokenSource`, `forwardToDataAPI`) and route handlers. `api.go` calls `registerDataAPIRoutes(api)`. `main.go` calls `initIDTokenSource()` before startup. New `Integrations.tsx` component polls `/api/connections` and renders 6 integration cards with connect/reconnect buttons.

**Tech Stack:** Go (Gin, golang.org/x/oauth2, google.golang.org/api/idtoken), React 18, TypeScript, Tailwind CSS

---

### Task 1: Create `dataapi.go`

**Files:**
- Create: `dataapi.go`

**Step 1: Create the file with exact content**

```go
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/oauth2"
	"google.golang.org/api/idtoken"
)

var iamTokenSource oauth2.TokenSource

func dataAPIURL() string {
	base := os.Getenv("URL_BASE")
	if base == "" {
		return "http://localhost:8080"
	}
	return "https://dataapi." + base
}

func initIDTokenSource() {
	audience := dataAPIURL()
	ts, err := idtoken.NewTokenSource(context.Background(), audience)
	if err != nil {
		zap.L().Warn("could not create ID token source — IAM auth disabled",
			zap.String("audience", audience),
			zap.Error(err),
		)
		return
	}
	iamTokenSource = ts
	zap.L().Info("ID token source initialized", zap.String("audience", audience))
}

func forwardToDataAPI(c *gin.Context, method, path string, body io.Reader) {
	targetURL := dataAPIURL() + path
	token := c.GetHeader("X-Request-Token")

	req, err := http.NewRequestWithContext(c.Request.Context(), method, targetURL, body)
	if err != nil {
		zap.L().Error("failed to build data API request", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build request"})
		return
	}
	req.Header.Set("X-Request-Token", token)
	if ct := c.Request.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	if iamTokenSource != nil {
		idToken, err := iamTokenSource.Token()
		if err != nil {
			zap.L().Error("failed to mint IAM token", zap.Error(err))
		} else {
			req.Header.Set("Authorization", "Bearer "+idToken.AccessToken)
		}
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		zap.L().Error("data API unreachable", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("data api unreachable: %v", err)})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	c.Status(resp.StatusCode)
	for k, vs := range resp.Header {
		for _, v := range vs {
			c.Header(k, v)
		}
	}
	c.Writer.Write(respBody)
}

func registerDataAPIRoutes(api *gin.RouterGroup) {
	api.POST("/connect/:integration", func(c *gin.Context) {
		integration := c.Param("integration")
		forwardToDataAPI(c, "POST", "/api/data/oauth/start?integration="+integration, nil)
	})
	api.GET("/connections", func(c *gin.Context) {
		forwardToDataAPI(c, "GET", "/api/data/connections", nil)
	})
	api.Any("/integration/*path", func(c *gin.Context) {
		forwardToDataAPI(c, c.Request.Method, "/api/data"+c.Param("path"), c.Request.Body)
	})
}
```

---

### Task 2: Wire Data API into `api.go` and `main.go`

**Files:**
- Modify: `api.go` — add `registerDataAPIRoutes(api)` call
- Modify: `main.go` — add `initIDTokenSource()` call

**Step 1: In `api.go`, add `registerDataAPIRoutes(api)` at the end of `registerAPIRoutes`**

Find the section in `registerAPIRoutes` that ends with:
```go
	// Anaheim API endpoints (if client is initialized)
	if anaheimClient != nil {
		api.GET("/anaheim/user/:email", handleAnaheimGetUser(anaheimClient))
		api.POST("/anaheim/users", handleAnaheimSearchUsers(anaheimClient))
	}
}
```

Change it to:
```go
	// Anaheim API endpoints (if client is initialized)
	if anaheimClient != nil {
		api.GET("/anaheim/user/:email", handleAnaheimGetUser(anaheimClient))
		api.POST("/anaheim/users", handleAnaheimSearchUsers(anaheimClient))
	}

	// Data API proxy routes
	registerDataAPIRoutes(api)
}
```

**Step 2: In `main.go`, add `initIDTokenSource()` before `r.Run`**

Find:
```go
	zap.L().Info("server starting", zap.String("port", port))
	if err := r.Run(":" + port); err != nil {
```

Change to:
```go
	initIDTokenSource()
	zap.L().Info("server starting", zap.String("port", port))
	if err := r.Run(":" + port); err != nil {
```

---

### Task 3: Create `frontend/src/components/Integrations.tsx`

**Files:**
- Create: `frontend/src/components/Integrations.tsx`

**Step 1: Create the file with exact content**

```tsx
import { useState, useEffect, useCallback } from 'react'

interface Connection {
  id: string
  provider_config_key: string
  connection_id: string
}

interface Integration {
  name: string
  label: string
  icon: string
  providerKey: string
}

const INTEGRATIONS: Integration[] = [
  { name: 'sheets', label: 'Google Sheets', icon: '📊', providerKey: 'google-sheets' },
  { name: 'docs', label: 'Google Docs', icon: '📝', providerKey: 'google-docs' },
  { name: 'drive', label: 'Google Drive', icon: '📁', providerKey: 'google-drive' },
  { name: 'calendar', label: 'Google Calendar', icon: '📅', providerKey: 'google-calendar' },
  { name: 'jira', label: 'Jira', icon: '🎫', providerKey: 'jira' },
  { name: 'confluence', label: 'Confluence', icon: '📖', providerKey: 'confluence' },
]

function Integrations() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  const loadConnections = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/connections')
      if (res.ok) {
        const data = await res.json()
        setConnections(data.connections || [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConnections() }, [loadConnections])

  const isConnected = (integration: Integration) =>
    connections.some(c => c.provider_config_key === integration.providerKey)

  const connect = async (name: string) => {
    try {
      const res = await fetch(`/api/connect/${name}`, { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        const popup = window.open(data.url, '_blank', 'width=600,height=700')
        const check = setInterval(() => {
          if (popup?.closed) {
            clearInterval(check)
            loadConnections()
          }
        }, 500)
      }
    } catch (err) {
      console.error('Connect failed:', err)
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-12 px-4">
      <div className="bg-white rounded-xl shadow p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <button
            onClick={loadConnections}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="space-y-3">
          {INTEGRATIONS.map(integration => {
            const connected = isConnected(integration)
            return (
              <div
                key={integration.name}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integration.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{integration.label}</p>
                    <span className={`text-xs font-medium ${connected ? 'text-green-600' : 'text-gray-400'}`}>
                      {connected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => connect(integration.name)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    connected
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {connected ? 'Reconnect' : 'Connect'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Integrations
```

---

### Task 4: Wire the Integrations tab into `App.tsx` and `Sidebar.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Step 1: In `App.tsx`, add the Integrations import after the Home import (line 9)**

Add:
```tsx
import Integrations from './components/Integrations'
```

**Step 2: In `App.tsx`, add `'integrations'` to the Tab type**

Change:
```tsx
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim'
```
To:
```tsx
export type Tab = 'home' | 'event-log' | 'send-message' | 'send-dm' | 'members' | 'feedback' | 'anaheim' | 'integrations'
```

**Step 3: In `App.tsx`, add case to `renderContent()` before the default**

Add before `default:`:
```tsx
      case 'integrations':
        return <Integrations />
```

**Step 4: In `Sidebar.tsx`, add the Integrations tab entry after Anaheim**

Change:
```tsx
  { id: 'anaheim', label: 'Anaheim', icon: '👥' },
]
```
To:
```tsx
  { id: 'anaheim', label: 'Anaheim', icon: '👥' },
  { id: 'integrations', label: 'Integrations', icon: '🔌' },
]
```

---

### Verification

1. App loads — Home tab shown, sidebar closed by default
2. Open sidebar — tabs visible: Home, Event Log, Anaheim, Integrations
3. Click "Integrations" — panel shows 6 cards (Sheets, Docs, Drive, Calendar, Jira, Confluence)
4. Each card shows "Not connected" initially and a blue "Connect" button
5. Backend: `GET /api/connections` and `POST /api/connect/:integration` routes exist (verify with `/api/debug`)
