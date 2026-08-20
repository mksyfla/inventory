// Package admin defines the write-side models and repository interface for the
// RBAC administration endpoints (users / roles / system settings). It is the
// mirror of the read-only `query` package: reads stay there, mutations here.
package admin

import "context"

// User is a sec.users row with its role codes and warehouse assignments.
type User struct {
	ID           int64
	Username     string
	Email        string
	FullName     string
	Phone        string
	IsActive     bool
	Roles        []string
	Warehouses   []string
	WarehouseIDs []int64
}

// Role is a sec.roles row with its permission codes.
type Role struct {
	ID          int64
	Code        string
	Name        string
	Description string
	Permissions []string
}

// Permission is one sec.permissions row.
type Permission struct {
	ID   int64
	Code string
}

// Setting is one sec.settings row; Value holds the raw JSON payload.
type Setting struct {
	Key   string
	Value []byte
}

// Repository is the write-side store behind the admin endpoints. Every method
// is transaction-aware: when called inside a RunInTx callback it reuses the
// active transaction, otherwise it runs on the pool.
type Repository interface {
	CreateUser(ctx context.Context, username, email, fullName, phone, passwordHash string, isActive bool) (int64, error)
	UpdateUser(ctx context.Context, id int64, fullName, email, phone string, isActive bool) error
	UpdateUserPassword(ctx context.Context, id int64, passwordHash string) error
	DeleteUserRoles(ctx context.Context, userID int64) error
	AssignUserRole(ctx context.Context, userID, roleID, warehouseID int64) error
	GetRoleByCode(ctx context.Context, code string) (Role, error)
	CreateRole(ctx context.Context, code, name, description string) (int64, error)
	UpdateRole(ctx context.Context, id int64, code, name, description string) error
	DeleteRolePermissions(ctx context.Context, roleID int64) error
	AssignRolePermission(ctx context.Context, roleID, permissionID int64) error
	GetPermissionByCode(ctx context.Context, code string) (Permission, error)
	ListSettings(ctx context.Context) ([]Setting, error)
	UpsertSetting(ctx context.Context, key string, value []byte, updatedBy int64) error
}

// TxRunner runs a whole admin mutation in one transaction.
type TxRunner interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}
