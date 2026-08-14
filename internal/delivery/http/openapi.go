package http

import (
	"encoding/json"
	"net/http"
	"sync"

	specapi "inventory/api"

	"github.com/labstack/echo/v4"
	swgui "github.com/swaggest/swgui/v5emb"
	"gopkg.in/yaml.v3"
)

var (
	specJSONOnce sync.Once
	specJSON     []byte
	specJSONErr  error
)

// openAPIJSON converts the canonical YAML spec to JSON once and caches it.
func openAPIJSON() ([]byte, error) {
	specJSONOnce.Do(func() {
		var doc map[string]any
		if err := yaml.Unmarshal(specapi.SpecYAML, &doc); err != nil {
			specJSONErr = err
			return
		}
		specJSON, specJSONErr = json.Marshal(doc)
	})
	return specJSON, specJSONErr
}

// registerOpenAPI serves the OpenAPI spec (YAML + JSON) and an embedded Swagger UI.
func registerOpenAPI(e *echo.Echo, v1 *echo.Group) {
	v1.GET("/openapi.yaml", func(c echo.Context) error {
		return c.Blob(http.StatusOK, "application/yaml", specapi.SpecYAML)
	})

	v1.GET("/openapi.json", func(c echo.Context) error {
		b, err := openAPIJSON()
		if err != nil {
			return err
		}
		return c.Blob(http.StatusOK, "application/json", b)
	})

	// Swagger UI with embedded assets (no CDN — works in restricted networks).
	ui := swgui.New("SIMBAR API", "/api/v1/openapi.json", "/swagger")
	e.GET("/swagger", echo.WrapHandler(ui))
	e.GET("/swagger/*", echo.WrapHandler(ui))

}
