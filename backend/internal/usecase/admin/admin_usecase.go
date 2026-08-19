// Package admin implements the RBAC write usecases (Fase 10.x): create/update
// users with their role×warehouse assignments, create/update roles with their
// permission sets, and a persistent system-settings store. All mutations run
// inside a single transaction.
package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"inventory/internal/domain/admin"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/auth"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// txRunner runs a whole admin mutation in one transaction.
type txRunner interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// AuditLogWriter records durable events into aud.audit_logs.
type AuditLogWriter interface {
	InsertAuditLog(ctx context.Context, userID int64, action, entity string, entityID int64, newValue []byte) error
}

// CreateUserInput is the payload of POST /users.
type CreateUserInput struct {
	Username     string
	Email        string
	FullName     string
	Phone        string
	Password     string
	IsActive     bool
	Roles        []string
	WarehouseIDs []int64
	ActorID      int64
}

// UpdateUserInput is the payload of PATCH /users/:id. Password is nil when the
// caller does not want to change the password.
type UpdateUserInput struct {
	ID           int64
	FullName     string
	Email        string
	Phone        string
	Password     *string
	IsActive     bool
	Roles        []string
	WarehouseIDs []int64
	ActorID      int64
}

// CreateRoleInput is the payload of POST /roles.
type CreateRoleInput struct {
	Code        string
	Name        string
	Description string
	Permissions []string
	ActorID     int64
}

// UpdateRoleInput is the payload of PATCH /roles/:id.
type UpdateRoleInput struct {
	ID          int64
	Code        string
	Name        string
	Description string
	Permissions []string
	ActorID     int64
}

// AdminUsecase implements the RBAC write operations.
type AdminUsecase struct {
	repo     admin.Repository
	txRunner txRunner
	audit    AuditLogWriter
	hash     func(password string) (string, error)
}

// NewAdminUsecase wires the admin module. hash defaults to auth.HashPassword;
// override with WithPasswordHasher for deterministic tests.
func NewAdminUsecase(repo admin.Repository, txRunner txRunner, audit AuditLogWriter, opts ...Option) *AdminUsecase {
	u := &AdminUsecase{
		repo:     repo,
		txRunner: txRunner,
		audit:    audit,
		hash:     auth.HashPassword,
	}
	for _, opt := range opts {
		opt(u)
	}
	return u
}

// Option customizes an AdminUsecase (test hooks).
type Option func(*AdminUsecase)

// WithPasswordHasher replaces the Argon2id hasher used for new passwords.
func WithPasswordHasher(hash func(password string) (string, error)) Option {
	return func(u *AdminUsecase) { u.hash = hash }
}

// CreateUser hashes the password, resolves role codes to ids and stores the
// user with its role×warehouse assignments atomically.
func (u *AdminUsecase) CreateUser(ctx context.Context, in CreateUserInput) (int64, error) {
	if in.Username == "" || in.FullName == "" {
		return 0, apperr.New("ERR_VALIDATION", "username and full_name are required")
	}
	if in.Password == "" {
		return 0, apperr.New("ERR_VALIDATION", "password is required when creating a user")
	}
	if len(in.Roles) > 0 && len(in.WarehouseIDs) == 0 {
		return 0, apperr.New("ERR_VALIDATION", "roles require at least one warehouse assignment")
	}

	passwordHash, err := u.hash(in.Password)
	if err != nil {
		return 0, apperr.New("ERR_INTERNAL", "failed to hash password")
	}

	roleIDs, err := u.resolveRoles(ctx, in.Roles)
	if err != nil {
		return 0, err
	}

	var userID int64
	err = u.txRunner.RunInTx(ctx, func(ctx context.Context) error {
		id, err := u.repo.CreateUser(ctx, in.Username, in.Email, in.FullName, in.Phone, passwordHash, in.IsActive)
		if err != nil {
			return err
		}
		userID = id
		if err := u.assignRoles(ctx, id, roleIDs, in.WarehouseIDs); err != nil {
			return err
		}
		if u.audit != nil {
			payload, _ := json.Marshal(map[string]any{
				"username":      in.Username,
				"full_name":     in.FullName,
				"roles":         in.Roles,
				"warehouse_ids": in.WarehouseIDs,
			})
			return u.audit.InsertAuditLog(ctx, in.ActorID, "create", "user", id, payload)
		}
		return nil
	})
	if err != nil {
		if pgErrIsUniqueViolation(err) {
			return 0, apperr.New("ERR_DUPLICATE_KEY", "username or email already exists")
		}
		return 0, err
	}
	return userID, nil
}

// UpdateUser applies profile/password/assignment changes atomically.
func (u *AdminUsecase) UpdateUser(ctx context.Context, in UpdateUserInput) error {
	if in.FullName == "" {
		return apperr.New("ERR_VALIDATION", "full_name is required")
	}

	var passwordHash *string
	if in.Password != nil && *in.Password != "" {
		h, err := u.hash(*in.Password)
		if err != nil {
			return apperr.New("ERR_INTERNAL", "failed to hash password")
		}
		passwordHash = &h
	}

	roleIDs, err := u.resolveRoles(ctx, in.Roles)
	if err != nil {
		return err
	}

	err = u.txRunner.RunInTx(ctx, func(ctx context.Context) error {
		if err := u.repo.UpdateUser(ctx, in.ID, in.FullName, in.Email, in.Phone, in.IsActive); err != nil {
			return err
		}
		if passwordHash != nil {
			if err := u.repo.UpdateUserPassword(ctx, in.ID, *passwordHash); err != nil {
				return err
			}
		}
		if err := u.repo.DeleteUserRoles(ctx, in.ID); err != nil {
			return err
		}
		if err := u.assignRoles(ctx, in.ID, roleIDs, in.WarehouseIDs); err != nil {
			return err
		}
		if u.audit != nil {
			payload, _ := json.Marshal(map[string]any{
				"roles":         in.Roles,
				"warehouse_ids": in.WarehouseIDs,
				"is_active":     in.IsActive,
			})
			return u.audit.InsertAuditLog(ctx, in.ActorID, "update", "user", in.ID, payload)
		}
		return nil
	})
	if err != nil {
		return err
	}
	return nil
}

// CreateRole stores a role and its permission set atomically.
func (u *AdminUsecase) CreateRole(ctx context.Context, in CreateRoleInput) (int64, error) {
	if in.Code == "" || in.Name == "" {
		return 0, apperr.New("ERR_VALIDATION", "code and name are required")
	}

	var roleID int64
	err := u.txRunner.RunInTx(ctx, func(ctx context.Context) error {
		id, err := u.repo.CreateRole(ctx, in.Code, in.Name, in.Description)
		if err != nil {
			return err
		}
		roleID = id
		if err := u.assignPermissions(ctx, id, in.Permissions); err != nil {
			return err
		}
		if u.audit != nil {
			payload, _ := json.Marshal(map[string]any{
				"code":        in.Code,
				"name":        in.Name,
				"permissions": in.Permissions,
			})
			return u.audit.InsertAuditLog(ctx, in.ActorID, "create", "role", id, payload)
		}
		return nil
	})
	if err != nil {
		if pgErrIsUniqueViolation(err) {
			return 0, apperr.New("ERR_DUPLICATE_KEY", "role code already exists")
		}
		return 0, err
	}
	return roleID, nil
}

// UpdateRole applies role fields and permission set atomically.
func (u *AdminUsecase) UpdateRole(ctx context.Context, in UpdateRoleInput) error {
	if in.Code == "" || in.Name == "" {
		return apperr.New("ERR_VALIDATION", "code and name are required")
	}

	err := u.txRunner.RunInTx(ctx, func(ctx context.Context) error {
		if err := u.repo.UpdateRole(ctx, in.ID, in.Code, in.Name, in.Description); err != nil {
			return err
		}
		if err := u.repo.DeleteRolePermissions(ctx, in.ID); err != nil {
			return err
		}
		if err := u.assignPermissions(ctx, in.ID, in.Permissions); err != nil {
			return err
		}
		if u.audit != nil {
			payload, _ := json.Marshal(map[string]any{
				"code":        in.Code,
				"name":        in.Name,
				"permissions": in.Permissions,
			})
			return u.audit.InsertAuditLog(ctx, in.ActorID, "update", "role", in.ID, payload)
		}
		return nil
	})
	return err
}

// GetSettings returns all stored system settings as a flat JSON object.
func (u *AdminUsecase) GetSettings(ctx context.Context) (map[string]json.RawMessage, error) {
	rows, err := u.repo.ListSettings(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]json.RawMessage, len(rows))
	for _, s := range rows {
		if len(s.Value) > 0 {
			out[s.Key] = json.RawMessage(s.Value)
		}
	}
	return out, nil
}

// UpdateSettings upserts every key of the flat JSON object.
func (u *AdminUsecase) UpdateSettings(ctx context.Context, settings map[string]json.RawMessage, actorID int64) error {
	if len(settings) == 0 {
		return apperr.New("ERR_VALIDATION", "no settings provided")
	}

	return u.txRunner.RunInTx(ctx, func(ctx context.Context) error {
		for key, value := range settings {
			if err := u.repo.UpsertSetting(ctx, key, value, actorID); err != nil {
				return err
			}
		}
		if u.audit != nil {
			payload, _ := json.Marshal(settings)
			return u.audit.InsertAuditLog(ctx, actorID, "update", "settings", 0, payload)
		}
		return nil
	})
}

// resolveRoles converts role codes to their ids, preserving order.
func (u *AdminUsecase) resolveRoles(ctx context.Context, codes []string) ([]int64, error) {
	if len(codes) == 0 {
		return nil, nil
	}
	ids := make([]int64, 0, len(codes))
	for _, code := range codes {
		role, err := u.repo.GetRoleByCode(ctx, code)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, apperr.New("ERR_VALIDATION", "unknown role: "+code)
			}
			return nil, err
		}
		ids = append(ids, role.ID)
	}
	return ids, nil
}

// assignRoles inserts every role×warehouse pair. Roles are applied to every
// warehouse in the list (the sec.user_roles PK is role×warehouse).
func (u *AdminUsecase) assignRoles(ctx context.Context, userID int64, roleIDs, warehouseIDs []int64) error {
	if len(roleIDs) == 0 {
		return nil
	}
	for _, rid := range roleIDs {
		for _, wid := range warehouseIDs {
			if err := u.repo.AssignUserRole(ctx, userID, rid, wid); err != nil {
				return fmt.Errorf("admin: failed to assign role %d warehouse %d: %w", rid, wid, err)
			}
		}
	}
	return nil
}

// assignPermissions resolves permission codes to ids and links them to a role.
func (u *AdminUsecase) assignPermissions(ctx context.Context, roleID int64, codes []string) error {
	for _, code := range codes {
		perm, err := u.repo.GetPermissionByCode(ctx, code)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.New("ERR_VALIDATION", "unknown permission: "+code)
			}
			return err
		}
		if err := u.repo.AssignRolePermission(ctx, roleID, perm.ID); err != nil {
			return err
		}
	}
	return nil
}

func pgErrIsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
