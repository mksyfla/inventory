package admin_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/netip"
	"testing"

	"inventory/internal/domain/admin"
	adminuc "inventory/internal/usecase/admin"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Fakes ──────────────────────────────────────────────────────────────────

var IP = netip.MustParseAddr("127.0.0.1")

type fakeRepo struct {
	users       map[int64]admin.User
	roles       map[string]admin.Role
	perms       map[string]admin.Permission
	assignments map[int64][]int64 // userID -> roleIDs
	settings    map[string]admin.Setting
	nextUserID  int64
	nextRoleID  int64
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		users:       map[int64]admin.User{},
		roles:       map[string]admin.Role{},
		perms:       map[string]admin.Permission{},
		assignments: map[int64][]int64{},
		settings:    map[string]admin.Setting{},
		nextUserID:  1,
		nextRoleID:  1,
	}
}

func (r *fakeRepo) CreateUser(ctx context.Context, username, email, fullName, phone, passwordHash string, isActive bool) (int64, error) {
	id := r.nextUserID
	r.nextUserID++
	r.users[id] = admin.User{ID: id, Username: username, Email: email, FullName: fullName, Phone: phone, IsActive: isActive}
	return id, nil
}

func (r *fakeRepo) UpdateUser(ctx context.Context, id int64, fullName, email, phone string, isActive bool) error {
	u, ok := r.users[id]
	if !ok {
		return pgx.ErrNoRows
	}
	u.FullName, u.Email, u.Phone, u.IsActive = fullName, email, phone, isActive
	r.users[id] = u
	return nil
}

func (r *fakeRepo) UpdateUserPassword(ctx context.Context, id int64, passwordHash string) error {
	return nil
}

func (r *fakeRepo) DeleteUserRoles(ctx context.Context, userID int64) error {
	delete(r.assignments, userID)
	return nil
}

func (r *fakeRepo) AssignUserRole(ctx context.Context, userID, roleID, warehouseID int64) error {
	r.assignments[userID] = append(r.assignments[userID], roleID)
	return nil
}

func (r *fakeRepo) GetRoleByCode(ctx context.Context, code string) (admin.Role, error) {
	if role, ok := r.roles[code]; ok {
		return role, nil
	}
	return admin.Role{}, pgx.ErrNoRows
}

func (r *fakeRepo) CreateRole(ctx context.Context, code, name, description string) (int64, error) {
	id := r.nextRoleID
	r.nextRoleID++
	r.roles[code] = admin.Role{ID: id, Code: code, Name: name, Description: description}
	return id, nil
}

func (r *fakeRepo) UpdateRole(ctx context.Context, id int64, code, name, description string) error {
	for c, role := range r.roles {
		if role.ID == id {
			delete(r.roles, c)
			r.roles[code] = admin.Role{ID: id, Code: code, Name: name, Description: description}
			return nil
		}
	}
	return pgx.ErrNoRows
}

func (r *fakeRepo) DeleteRolePermissions(ctx context.Context, roleID int64) error { return nil }
func (r *fakeRepo) AssignRolePermission(ctx context.Context, roleID, permissionID int64) error {
	return nil
}

func (r *fakeRepo) GetPermissionByCode(ctx context.Context, code string) (admin.Permission, error) {
	if p, ok := r.perms[code]; ok {
		return p, nil
	}
	return admin.Permission{}, pgx.ErrNoRows
}

func (r *fakeRepo) ListSettings(ctx context.Context) ([]admin.Setting, error) {
	out := make([]admin.Setting, 0, len(r.settings))
	for _, s := range r.settings {
		out = append(out, s)
	}
	return out, nil
}

func (r *fakeRepo) UpsertSetting(ctx context.Context, key string, value []byte, updatedBy int64) error {
	r.settings[key] = admin.Setting{Key: key, Value: value}
	return nil
}

// fakeState is a deep-ish snapshot of the fake repo so fakeTx can emulate
// transaction rollback (writes before a failing step are undone).
type fakeState struct {
	users       map[int64]admin.User
	roles       map[string]admin.Role
	assignments map[int64][]int64
	settings    map[string]admin.Setting
	nextUserID  int64
	nextRoleID  int64
}

func (r *fakeRepo) snapshot() fakeState {
	s := fakeState{
		users:       make(map[int64]admin.User, len(r.users)),
		roles:       make(map[string]admin.Role, len(r.roles)),
		assignments: make(map[int64][]int64, len(r.assignments)),
		settings:    make(map[string]admin.Setting, len(r.settings)),
		nextUserID:  r.nextUserID,
		nextRoleID:  r.nextRoleID,
	}
	for k, v := range r.users {
		s.users[k] = v
	}
	for k, v := range r.roles {
		s.roles[k] = v
	}
	for k, v := range r.assignments {
		ids := make([]int64, len(v))
		copy(ids, v)
		s.assignments[k] = ids
	}
	for k, v := range r.settings {
		s.settings[k] = v
	}
	return s
}

func (r *fakeRepo) restore(s fakeState) {
	r.users, r.roles = s.users, s.roles
	r.assignments, r.settings = s.assignments, s.settings
	r.nextUserID, r.nextRoleID = s.nextUserID, s.nextRoleID
}

type fakeTx struct{ repo *fakeRepo }

func (t fakeTx) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	before := t.repo.snapshot()
	if err := fn(ctx); err != nil {
		t.repo.restore(before)
		return err
	}
	return nil
}

func newUseCase(repo *fakeRepo) (*adminuc.AdminUsecase, *fakeAudit) {
	audit := &fakeAudit{}
	uc := adminuc.NewAdminUsecase(repo, fakeTx{repo: repo}, audit,
		adminuc.WithPasswordHasher(func(password string) (string, error) { return "hashed:" + password, nil }),
	)
	return uc, audit
}

type fakeAudit struct{ calls int }

func (a *fakeAudit) InsertAuditLog(ctx context.Context, userID int64, action, entity string, entityID int64, newValue []byte, ipAddr *netip.Addr) error {
	a.calls++
	return nil
}

// ─── Tests ──────────────────────────────────────────────────────────────────

func TestAdminUsecase_CreateUser(t *testing.T) {
	repo := newFakeRepo()
	repo.roles["INBOUND_STAFF"] = admin.Role{ID: 1, Code: "INBOUND_STAFF", Name: "Inbound Staff"}
	uc, audit := newUseCase(repo)

	id, err := uc.CreateUser(context.Background(), adminuc.CreateUserInput{
		Username:     "ahmad.inbound",
		Email:        "ahmad@peruri.co.id",
		FullName:     "Ahmad Staff Inbound",
		Phone:        "081311223344",
		Password:     "secret123",
		IsActive:     true,
		Roles:        []string{"INBOUND_STAFF"},
		WarehouseIDs: []int64{1},
		ActorID:      9,
	}, &IP)
	require.NoError(t, err)
	assert.Equal(t, int64(1), id)
	assert.Equal(t, []int64{1}, repo.assignments[id])
	assert.Equal(t, 1, audit.calls)

	// Duplicate username surfaces as ERR_DUPLICATE_KEY via the fake? Not simulated;
	// covered at repo level. Missing role → ERR_VALIDATION.
	_, err = uc.CreateUser(context.Background(), adminuc.CreateUserInput{
		Username: "x", FullName: "X", Password: "secret123",
		Roles: []string{"NO_SUCH_ROLE"}, WarehouseIDs: []int64{1}, ActorID: 9,
	}, &IP)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown role")
}

func TestAdminUsecase_CreateUser_Validation(t *testing.T) {
	uc, _ := newUseCase(newFakeRepo())

	_, err := uc.CreateUser(context.Background(), adminuc.CreateUserInput{Username: "u", FullName: "No Password"}, &IP)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "password is required")

	_, err = uc.CreateUser(context.Background(), adminuc.CreateUserInput{
		Username: "u", FullName: "U", Password: "secret123",
		Roles: []string{"ADMIN"}, // no warehouse IDs
	}, &IP)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "warehouse")
}

func TestAdminUsecase_UpdateUser(t *testing.T) {
	repo := newFakeRepo()
	repo.roles["WH_MANAGER"] = admin.Role{ID: 2, Code: "WH_MANAGER", Name: "WH Manager"}
	repo.users[7] = admin.User{ID: 7, Username: "budi", FullName: "Budi", IsActive: true}
	uc, audit := newUseCase(repo)

	err := uc.UpdateUser(context.Background(), adminuc.UpdateUserInput{
		ID:           7,
		FullName:     "Budi Baru",
		IsActive:     false,
		Roles:        []string{"WH_MANAGER"},
		WarehouseIDs: []int64{2},
		ActorID:      9,
	}, &IP)
	require.NoError(t, err)
	assert.Equal(t, "Budi Baru", repo.users[7].FullName)
	assert.False(t, repo.users[7].IsActive)
	assert.Equal(t, []int64{2}, repo.assignments[7])
	assert.Equal(t, 1, audit.calls)

	// Unknown id → not found
	err = uc.UpdateUser(context.Background(), adminuc.UpdateUserInput{ID: 999, FullName: "X", ActorID: 9}, &IP)
	require.Error(t, err)
	assert.True(t, errors.Is(err, pgx.ErrNoRows))
}

func TestAdminUsecase_Roles(t *testing.T) {
	repo := newFakeRepo()
	repo.perms["item.read"] = admin.Permission{ID: 1, Code: "item.read"}
	repo.perms["grn.create"] = admin.Permission{ID: 2, Code: "grn.create"}
	uc, audit := newUseCase(repo)

	// Create role with permissions.
	id, err := uc.CreateRole(context.Background(), adminuc.CreateRoleInput{
		Code: "INBOUND_STAFF", Name: "Inbound Staff", Permissions: []string{"item.read", "grn.create"}, ActorID: 9,
	}, &IP)
	require.NoError(t, err)
	assert.Equal(t, int64(1), id)
	assert.Equal(t, "Inbound Staff", repo.roles["INBOUND_STAFF"].Name)
	assert.Equal(t, 1, audit.calls)

	// Unknown permission → ERR_VALIDATION, transaction aborted.
	_, err = uc.CreateRole(context.Background(), adminuc.CreateRoleInput{
		Code: "X_STAFF", Name: "X Staff", Permissions: []string{"nope.read"}, ActorID: 9,
	}, &IP)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown permission")
	_, exists := repo.roles["X_STAFF"]
	assert.False(t, exists, "role must not persist when permission assignment fails")

	// Update role.
	err = uc.UpdateRole(context.Background(), adminuc.UpdateRoleInput{
		ID: 1, Code: "INBOUND_STAFF", Name: "Inbound (updated)", Permissions: []string{"item.read"}, ActorID: 9,
	}, &IP)
	require.NoError(t, err)
	assert.Equal(t, "Inbound (updated)", repo.roles["INBOUND_STAFF"].Name)
	assert.Equal(t, 2, audit.calls)
}

func TestAdminUsecase_Settings(t *testing.T) {
	repo := newFakeRepo()
	uc, audit := newUseCase(repo)

	err := uc.UpdateSettings(context.Background(), map[string]json.RawMessage{
		"companyName":          json.RawMessage(`"PT Peruri"`),
		"minStockThresholdPct": json.RawMessage(`15`),
	}, 9, &IP)
	require.NoError(t, err)
	assert.Equal(t, 1, audit.calls)

	settings, err := uc.GetSettings(context.Background())
	require.NoError(t, err)
	assert.JSONEq(t, `"PT Peruri"`, string(settings["companyName"]))
	assert.JSONEq(t, `15`, string(settings["minStockThresholdPct"]))

	// Empty update → ERR_VALIDATION.
	err = uc.UpdateSettings(context.Background(), map[string]json.RawMessage{}, 9, &IP)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no settings")
}
