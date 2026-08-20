package postgres

import (
	"context"
	"fmt"

	"inventory/internal/domain/admin"

	"github.com/jackc/pgx/v5/pgtype"
)

// PostgresAdminRepository implements admin.Repository on top of the sqlc
// Querier. Like the other write repositories it is transaction-aware: inside a
// RunInTx callback it reuses the active transaction via getQuerier.
type PostgresAdminRepository struct {
	queries *Queries
}

func NewPostgresAdminRepository(db DBTX) admin.Repository {
	return &PostgresAdminRepository{queries: New(db)}
}

func (r *PostgresAdminRepository) getQuerier(ctx context.Context) Querier {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

func text(v string) pgtype.Text {
	return pgtype.Text{String: v, Valid: v != ""}
}

func (r *PostgresAdminRepository) CreateUser(ctx context.Context, username, email, fullName, phone, passwordHash string, isActive bool) (int64, error) {
	q := r.getQuerier(ctx)
	row, err := q.CreateUserFull(ctx, CreateUserFullParams{
		Username:     username,
		Email:        text(email),
		FullName:     fullName,
		PasswordHash: passwordHash,
		Phone:        text(phone),
		IsActive:     isActive,
	})
	if err != nil {
		return 0, fmt.Errorf("postgres: failed to create user: %w", err)
	}
	return row.ID, nil
}

func (r *PostgresAdminRepository) UpdateUser(ctx context.Context, id int64, fullName, email, phone string, isActive bool) error {
	q := r.getQuerier(ctx)
	if _, err := q.UpdateUser(ctx, UpdateUserParams{
		ID:       id,
		FullName: fullName,
		Email:    text(email),
		Phone:    text(phone),
		IsActive: isActive,
	}); err != nil {
		return fmt.Errorf("postgres: failed to update user: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) UpdateUserPassword(ctx context.Context, id int64, passwordHash string) error {
	q := r.getQuerier(ctx)
	if _, err := q.UpdateUserPassword(ctx, UpdateUserPasswordParams{
		ID:           id,
		PasswordHash: passwordHash,
	}); err != nil {
		return fmt.Errorf("postgres: failed to update user password: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) DeleteUserRoles(ctx context.Context, userID int64) error {
	q := r.getQuerier(ctx)
	if err := q.DeleteUserRoles(ctx, userID); err != nil {
		return fmt.Errorf("postgres: failed to clear user roles: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) AssignUserRole(ctx context.Context, userID, roleID, warehouseID int64) error {
	q := r.getQuerier(ctx)
	if _, err := q.AssignUserRole(ctx, AssignUserRoleParams{
		UserID:      userID,
		RoleID:      roleID,
		WarehouseID: warehouseID,
	}); err != nil {
		return fmt.Errorf("postgres: failed to assign user role: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) GetRoleByCode(ctx context.Context, code string) (admin.Role, error) {
	q := r.getQuerier(ctx)
	row, err := q.GetRoleByCode(ctx, text(code))
	if err != nil {
		return admin.Role{}, fmt.Errorf("postgres: failed to find role %q: %w", code, err)
	}
	return admin.Role{
		ID:   row.ID,
		Code: qTextString(row.Code),
		Name: qTextString(row.Name),
	}, nil
}

func (r *PostgresAdminRepository) CreateRole(ctx context.Context, code, name, description string) (int64, error) {
	q := r.getQuerier(ctx)
	row, err := q.CreateRole(ctx, CreateRoleParams{
		Code:        text(code),
		Name:        text(name),
		Description: text(description),
	})
	if err != nil {
		return 0, fmt.Errorf("postgres: failed to create role: %w", err)
	}
	return row.ID, nil
}

func (r *PostgresAdminRepository) UpdateRole(ctx context.Context, id int64, code, name, description string) error {
	q := r.getQuerier(ctx)
	if _, err := q.UpdateRole(ctx, UpdateRoleParams{
		ID:          id,
		Code:        text(code),
		Name:        text(name),
		Description: text(description),
	}); err != nil {
		return fmt.Errorf("postgres: failed to update role: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) DeleteRolePermissions(ctx context.Context, roleID int64) error {
	q := r.getQuerier(ctx)
	if err := q.DeleteRolePermissions(ctx, roleID); err != nil {
		return fmt.Errorf("postgres: failed to clear role permissions: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) AssignRolePermission(ctx context.Context, roleID, permissionID int64) error {
	q := r.getQuerier(ctx)
	if _, err := q.AssignRolePermission(ctx, AssignRolePermissionParams{
		RoleID:       roleID,
		PermissionID: permissionID,
	}); err != nil {
		return fmt.Errorf("postgres: failed to assign role permission: %w", err)
	}
	return nil
}

func (r *PostgresAdminRepository) GetPermissionByCode(ctx context.Context, code string) (admin.Permission, error) {
	q := r.getQuerier(ctx)
	row, err := q.GetPermissionByCode(ctx, text(code))
	if err != nil {
		return admin.Permission{}, fmt.Errorf("postgres: failed to find permission %q: %w", code, err)
	}
	return admin.Permission{ID: row.ID, Code: qTextString(row.Code)}, nil
}

func (r *PostgresAdminRepository) ListSettings(ctx context.Context) ([]admin.Setting, error) {
	q := r.getQuerier(ctx)
	rows, err := q.ListSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to list settings: %w", err)
	}
	out := make([]admin.Setting, 0, len(rows))
	for _, row := range rows {
		out = append(out, admin.Setting{Key: row.Key, Value: row.Value})
	}
	return out, nil
}

func (r *PostgresAdminRepository) UpsertSetting(ctx context.Context, key string, value []byte, updatedBy int64) error {
	q := r.getQuerier(ctx)
	var by pgtype.Int8
	if updatedBy > 0 {
		by = pgtype.Int8{Int64: updatedBy, Valid: true}
	}
	if _, err := q.UpsertSetting(ctx, UpsertSettingParams{
		Key:       key,
		Value:     value,
		UpdatedBy: by,
	}); err != nil {
		return fmt.Errorf("postgres: failed to upsert setting %q: %w", key, err)
	}
	return nil
}
