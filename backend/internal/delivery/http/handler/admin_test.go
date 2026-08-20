package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/domain/admin"
	"inventory/internal/pkg/validation"
	adminuc "inventory/internal/usecase/admin"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// adminTestRepo is the minimal in-memory admin.Repository used by the handler
// tests (business logic is covered by internal/usecase/admin).
type adminTestRepo struct {
	roles map[string]admin.Role
	perms map[string]admin.Permission
}

func newAdminTestRepo() *adminTestRepo {
	return &adminTestRepo{
		roles: map[string]admin.Role{
			"INBOUND_STAFF": {ID: 1, Code: "INBOUND_STAFF", Name: "Inbound Staff"},
		},
		perms: map[string]admin.Permission{
			"item.read":   {ID: 1, Code: "item.read"},
			"grn.create":  {ID: 2, Code: "grn.create"},
			"user.write":  {ID: 3, Code: "user.write"},
			"role.write":  {ID: 4, Code: "role.write"},
			"settings.read":  {ID: 5, Code: "settings.read"},
			"settings.write": {ID: 6, Code: "settings.write"},
		},
	}
}

func (r *adminTestRepo) CreateUser(ctx context.Context, username, email, fullName, phone, passwordHash string, isActive bool) (int64, error) {
	return 42, nil
}
func (r *adminTestRepo) UpdateUser(ctx context.Context, id int64, fullName, email, phone string, isActive bool) error {
	return nil
}
func (r *adminTestRepo) UpdateUserPassword(ctx context.Context, id int64, passwordHash string) error { return nil }
func (r *adminTestRepo) DeleteUserRoles(ctx context.Context, userID int64) error                   { return nil }
func (r *adminTestRepo) AssignUserRole(ctx context.Context, userID, roleID, warehouseID int64) error {
	return nil
}
func (r *adminTestRepo) GetRoleByCode(ctx context.Context, code string) (admin.Role, error) {
	if role, ok := r.roles[code]; ok {
		return role, nil
	}
	return admin.Role{}, pgx.ErrNoRows
}
func (r *adminTestRepo) CreateRole(ctx context.Context, code, name, description string) (int64, error) {
	return 7, nil
}
func (r *adminTestRepo) UpdateRole(ctx context.Context, id int64, code, name, description string) error {
	return nil
}
func (r *adminTestRepo) DeleteRolePermissions(ctx context.Context, roleID int64) error { return nil }
func (r *adminTestRepo) AssignRolePermission(ctx context.Context, roleID, permissionID int64) error {
	return nil
}
func (r *adminTestRepo) GetPermissionByCode(ctx context.Context, code string) (admin.Permission, error) {
	if p, ok := r.perms[code]; ok {
		return p, nil
	}
	return admin.Permission{}, pgx.ErrNoRows
}
func (r *adminTestRepo) ListSettings(ctx context.Context) ([]admin.Setting, error) { return nil, nil }
func (r *adminTestRepo) UpsertSetting(ctx context.Context, key string, value []byte, updatedBy int64) error {
	return nil
}

type adminNoTx struct{}

func (adminNoTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error { return fn(ctx) }

func newAdminHandler() *AdminHandler {
	uc := adminuc.NewAdminUsecase(newAdminTestRepo(), adminNoTx{}, nil,
		adminuc.WithPasswordHasher(func(password string) (string, error) { return "h:" + password, nil }),
	)
	return NewAdminHandler(uc)
}

func serveAdmin(t *testing.T, h *AdminHandler, method, path string, body any, userID int64) *httptest.ResponseRecorder {
	t.Helper()
	e := echo.New()
	e.Validator = validation.New()
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.Set("user_id", userID)

	parts := strings.Split(strings.TrimSuffix(path, "/"), "/")
	id := parts[len(parts)-1]
	if id != "users" && id != "roles" && id != "settings" {
		c.SetParamNames("id")
		c.SetParamValues(id)
	}

	var err error
	switch {
	case strings.Contains(path, "/users") && method == http.MethodPost:
		err = h.CreateUser(c)
	case strings.Contains(path, "/users") && method == http.MethodPatch:
		err = h.UpdateUser(c)
	case strings.Contains(path, "/roles") && method == http.MethodPost:
		err = h.CreateRole(c)
	case strings.Contains(path, "/roles") && method == http.MethodPatch:
		err = h.UpdateRole(c)
	case path == "/api/v1/settings" && method == http.MethodGet:
		err = h.GetSettings(c)
	case path == "/api/v1/settings" && method == http.MethodPut:
		err = h.UpdateSettings(c)
	default:
		t.Fatalf("unmapped admin route: %s %s", method, path)
	}
	require.NoError(t, err)
	return rec
}

func TestAdminHandler_CreateUser_Success(t *testing.T) {
	h := newAdminHandler()
	rec := serveAdmin(t, h, http.MethodPost, "/api/v1/users", dto.CreateUserRequest{
		Username:     "ahmad.inbound",
		FullName:     "Ahmad Staff Inbound",
		Email:        "ahmad@peruri.co.id",
		Phone:        "081311223344",
		Password:     "secret123",
		Roles:        []string{"INBOUND_STAFF"},
		WarehouseIDs: []int64{1},
	}, 9)
	assert.Equal(t, http.StatusCreated, rec.Code)

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &envelope))
	assert.True(t, envelope.Success)
	assert.Equal(t, int64(42), envelope.Data.ID)
}

func TestAdminHandler_User_Validation(t *testing.T) {
	h := newAdminHandler()

	// Missing username → 422.
	rec := serveAdmin(t, h, http.MethodPost, "/api/v1/users", dto.CreateUserRequest{
		FullName: "X", Password: "secret123",
	}, 9)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	assert.Contains(t, rec.Body.String(), "ERR_VALIDATION")

	// Missing password → 422.
	rec = serveAdmin(t, h, http.MethodPost, "/api/v1/users", dto.CreateUserRequest{
		Username: "x", FullName: "X",
	}, 9)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	// Bad path id → 422.
	rec = serveAdmin(t, h, http.MethodPatch, "/api/v1/users/abc", dto.UpdateUserRequest{FullName: "X"}, 9)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	// Unknown role → 422 (usecase validation bubbles through writeUsecaseError).
	rec = serveAdmin(t, h, http.MethodPost, "/api/v1/users", dto.CreateUserRequest{
		Username: "y", FullName: "Y", Password: "secret123",
		Roles: []string{"NO_SUCH"}, WarehouseIDs: []int64{1},
	}, 9)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestAdminHandler_Roles(t *testing.T) {
	h := newAdminHandler()

	rec := serveAdmin(t, h, http.MethodPost, "/api/v1/roles", dto.CreateRoleRequest{
		Code: "INBOUND_STAFF", Name: "Inbound Staff", Permissions: []string{"item.read"},
	}, 9)
	assert.Equal(t, http.StatusCreated, rec.Code)

	// Unknown permission → 422.
	rec = serveAdmin(t, h, http.MethodPost, "/api/v1/roles", dto.CreateRoleRequest{
		Code: "X", Name: "X", Permissions: []string{"nope.read"},
	}, 9)
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)

	// Update success.
	rec = serveAdmin(t, h, http.MethodPatch, "/api/v1/roles/7", dto.UpdateRoleRequest{
		Code: "INBOUND_STAFF", Name: "Inbound", Permissions: []string{"item.read"},
	}, 9)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestAdminHandler_Settings(t *testing.T) {
	h := newAdminHandler()

	rec := serveAdmin(t, h, http.MethodPut, "/api/v1/settings", map[string]any{
		"companyName": "PT Peruri",
		"enabled":     true,
	}, 9)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"updated":true`)

	// GET returns an empty object when nothing is stored.
	rec = serveAdmin(t, h, http.MethodGet, "/api/v1/settings", nil, 9)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"data":{}`)
}
