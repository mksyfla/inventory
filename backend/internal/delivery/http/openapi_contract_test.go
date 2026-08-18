package http

// FSD 10.4 — Validasi kontrak OpenAPI.
//
// Tiga lapis kontrak yang diuji di sini:
//  1. Spesifikasi itu sendiri valid secara struktur (openapi3.Loader + doc.Validate).
//  2. Setiap path+method di openapi.yaml terdaftar di router Echo (kontrak
//     "spec → router": tidak boleh ada endpoint yang dijanjikan spec tapi
//     tidak pernah diregistrasi).
//  3. Response riil dari router (lewat httptest) tervalidasi terhadap schema
//     spec via openapi3filter.ValidateResponse — jadi perubahan payload
//     handler atau schema spec yang tidak selaras langsung ketahuan di CI.
//
// Catatan base path: spec mendeklarasikan `servers: [{url: /api/v1}]`, jadi
// path spec `/ping` dipetakan ke `/api/v1/ping`. Endpoint observability
// (/healthz, /readyz, /metrics) dan docs (/openapi.yaml, /openapi.json)
// sengaja diregistrasi di root router.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/auth"
	"inventory/internal/pkg/metrics"
	redisclient "inventory/internal/pkg/redis"
	countinguc "inventory/internal/usecase/counting"
	inbounduc "inventory/internal/usecase/inbound"
	itemuc "inventory/internal/usecase/item"
	outbounduc "inventory/internal/usecase/outbound"
	stockuc "inventory/internal/usecase/stock"
	transferuc "inventory/internal/usecase/transfer"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// specPath is the openapi.yaml location relative to this test file
// (internal/delivery/http → ../../.. → backend/api).
const specPath = "../../../api/openapi.yaml"

// loadSpec parses and validates openapi.yaml, failing the test on any
// structural problem. All other tests share this single loaded document.
func loadSpec(t *testing.T) *openapi3.T {
	t.Helper()
	loader := openapi3.NewLoader()
	doc, err := loader.LoadFromFile(specPath)
	require.NoError(t, err, "openapi.yaml must parse")
	require.NoError(t, doc.Validate(context.Background()), "openapi.yaml must be a valid OpenAPI 3.1 document")
	return doc
}

// echoPathToSpec converts an Echo route pattern to spec form: `:id` → `{id}`.
// Echo and OpenAPI use different param syntax for the same route.
var echoParamRe = regexp.MustCompile(`:([A-Za-z0-9_]+)`)

func echoPathToSpec(p string) string {
	return echoParamRe.ReplaceAllString(p, "{$1}")
}

// newContractRouter builds the full router with every module wired (empty
// usecases suffice — route registration only needs the pointers) plus a
// working auth lookup for alice so the login-ok contract case is real.
func newContractRouter(t *testing.T) *echo.Echo {
	t.Helper()

	hash, err := auth.HashPassword("correctPassword123!")
	require.NoError(t, err)

	lookup := func(ctx context.Context, username string) (int64, string, []string, []string, error) {
		if username == "alice" {
			return 1, hash, []string{"staff"}, []string{"WH01"}, nil
		}
		return 0, "", nil, nil, fmt.Errorf("user not found")
	}

	return NewRouter(RouterConfig{
		JWTSecret: "test-secret",
		Store:     redisclient.NewInMemoryStore(),
		LookupUser: lookup,
		CreateUser: func(ctx context.Context, username, email, fullName, passwordHash string) (int64, error) {
			return 2, nil
		},
		ItemUsecase:     &itemuc.Usecase{},
		StockUsecase:    &stockuc.PostingUsecase{},
		ReceiptUsecase:  &inbounduc.ReceiptUsecase{},
		OutboundUsecase: &outbounduc.OutboundUsecase{},
		TransferUsecase: &transferuc.TransferUsecase{},
		CountingUsecase: &countinguc.CountingUsecase{},
		Metrics:         metrics.New(),
		HealthCheckers: []HealthChecker{
			{Name: "postgres", Check: func(ctx context.Context) error { return nil }},
			{Name: "redis", Check: func(ctx context.Context) error { return nil }},
		},
	})
}

// TestOpenAPISpec_IsValid — lapis 1: dokumen spec valid secara struktur.
func TestOpenAPISpec_IsValid(t *testing.T) {
	doc := loadSpec(t)
	assert.NotEmpty(t, doc.Paths.Map(), "spec must declare at least one path")
	assert.NotNil(t, doc.Components.Schemas["ApiResponse"], "spec must define the ApiResponse envelope")
}

// TestOpenAPI_SpecPathsRegisteredInRouter — lapis 2: setiap path+method yang
// dijanjikan spec benar-benar terdaftar di router Echo.
func TestOpenAPI_SpecPathsRegisteredInRouter(t *testing.T) {
	doc := loadSpec(t)
	e := newContractRouter(t)

	registered := map[string]map[string]bool{} // method → normalized path
	for _, r := range e.Routes() {
		if registered[r.Method] == nil {
			registered[r.Method] = map[string]bool{}
		}
		registered[r.Method][echoPathToSpec(r.Path)] = true
	}

	for specPath, item := range doc.Paths.Map() {
		for method, op := range item.Operations() {
			// Path spec relatif terhadap base `/api/v1` (kecuali yang root).
			full := "/api/v1" + specPath
			if isRootSpecPath(specPath) {
				full = specPath
			}
			method = strings.ToUpper(method)

			t.Run(method+" "+full, func(t *testing.T) {
				if op == nil {
					t.Fatal("operation must be non-nil after doc.Validate")
				}
				assert.True(t, registered[method][full],
					"spec path %s %s must be registered in the Echo router", method, full)
			})
		}
	}
}

// isRootSpecPath reports whether a spec path is registered at the router root
// instead of under the `/api/v1` base (health probes, metrics, docs).
func isRootSpecPath(p string) bool {
	switch p {
	case "/healthz", "/readyz", "/metrics", "/swagger", "/swagger/*":
		return true
	}
	return false
}

// routeFor resolves the spec route for a request. gorillamux prepends the
// spec base (`/api/v1`) to every path, so root-level endpoints (/healthz,
// /readyz, /metrics) never match via FindRoute — build the route manually
// for those.
func routeFor(doc *openapi3.T, specRouter routers.Router, req *http.Request) *routers.Route {
	route, _, err := specRouter.FindRoute(req)
	if err == nil {
		return route
	}
	item := doc.Paths.Value(req.URL.Path)
	if item == nil {
		return nil
	}
	op := item.GetOperation(req.Method)
	if op == nil {
		return nil
	}
	return &routers.Route{Spec: doc, Path: req.URL.Path, PathItem: item, Method: req.Method, Operation: op}
}

// assertResponseMatchesSpec runs the real response through
// openapi3filter.ValidateResponse and fails the test on any mismatch.
func assertResponseMatchesSpec(t *testing.T, doc *openapi3.T, specRouter routers.Router, req *http.Request, rec *httptest.ResponseRecorder) {
	t.Helper()

	route := routeFor(doc, specRouter, req)
	require.NotNil(t, route, "request %s %s must match a route in the spec", req.Method, req.URL.Path)

	input := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{
			Request: req,
			Route:   route,
		},
		Status: rec.Code,
		Header: rec.Header(),
		Body:   io.NopCloser(bytes.NewReader(rec.Body.Bytes())),
	}
	err := openapi3filter.ValidateResponse(context.Background(), input)
	require.NoError(t, err,
		"response %d for %s %s must conform to openapi.yaml (status, content-type, payload schema)",
		rec.Code, req.Method, req.URL.Path)
}

// TestOpenAPI_ResponsesMatchSchemas — lapis 3: response riil (sukses maupun
// error) divalidasi terhadap schema spec. Semua kasus sengaja bebas-DB:
// cukup router + fake lookup + in-memory store.
func TestOpenAPI_ResponsesMatchSchemas(t *testing.T) {
	doc := loadSpec(t)
	specRouter, err := gorillamux.NewRouter(doc)
	require.NoError(t, err)

	e := newContractRouter(t)

	cases := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
	}{
		{
			name:       "ping success",
			method:     http.MethodGet,
			path:       "/api/v1/ping",
			wantStatus: http.StatusOK,
		},
		{
			name:       "healthz liveness",
			method:     http.MethodGet,
			path:       "/healthz",
			wantStatus: http.StatusOK,
		},
		{
			name:       "readyz readiness all-up",
			method:     http.MethodGet,
			path:       "/readyz",
			wantStatus: http.StatusOK,
		},
		{
			name:       "login success",
			method:     http.MethodPost,
			path:       "/api/v1/auth/login",
			body:       `{"username":"alice","password":"correctPassword123!"}`,
			wantStatus: http.StatusOK,
		},
		{
			name:       "login wrong password",
			method:     http.MethodPost,
			path:       "/api/v1/auth/login",
			body:       `{"username":"alice","password":"wrong-password"}`,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "protected endpoint without token",
			method:     http.MethodGet,
			path:       "/api/v1/items",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "register invalid payload",
			method:     http.MethodPost,
			path:       "/api/v1/auth/register",
			body:       `{}`,
			wantStatus: http.StatusUnprocessableEntity,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			e.ServeHTTP(rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code,
				"unexpected status; body=%s", rec.Body.String())
			assertResponseMatchesSpec(t, doc, specRouter, req, rec)
		})
	}
}

// TestOpenAPI_ErrorEnvelopeHasRequestID spot-checks the error envelope
// contract: every error response must carry success=false and a
// machine-readable code (FSD §5.4) — beyond schema conformance.
func TestOpenAPI_ErrorEnvelopeHasRequestID(t *testing.T) {
	e := newContractRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login",
		strings.NewReader(`{"username":"alice","password":"wrong-password"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)

	var resp response.Response
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	assert.False(t, resp.Success)
	require.NotNil(t, resp.Error)
	assert.Equal(t, "ERR_UNAUTHENTICATED", resp.Error.Code)
	assert.NotEmpty(t, resp.Error.RequestID, "error payload must echo the request_id (FSD 10.5)")
}
