package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewEnforcer_Empty(t *testing.T) {
	enforcer, err := NewEnforcer("")
	require.NoError(t, err)
	assert.NotNil(t, enforcer)
}

func TestEnforce_AllowedRole(t *testing.T) {
	enforcer, err := NewEnforcer("")
	require.NoError(t, err)

	// Add domain-scoped role: warehouse_staff has grn.create in WH-JKT01
	_, err = enforcer.AddPolicy("warehouse_staff", "WH-JKT01", "receipts", "create")
	require.NoError(t, err)
	_, err = enforcer.AddGroupingPolicy("alice", "warehouse_staff", "WH-JKT01")
	require.NoError(t, err)

	ok, err := Enforce(enforcer, "alice", "WH-JKT01", "receipts", "create")
	require.NoError(t, err)
	assert.True(t, ok, "alice should be allowed to create receipts in WH-JKT01")
}

func TestEnforce_DeniedWrongDomain(t *testing.T) {
	enforcer, err := NewEnforcer("")
	require.NoError(t, err)

	// Alice only has access to WH-JKT01, not WH-SUB02
	_, err = enforcer.AddPolicy("warehouse_staff", "WH-JKT01", "receipts", "create")
	require.NoError(t, err)
	_, err = enforcer.AddGroupingPolicy("alice", "warehouse_staff", "WH-JKT01")
	require.NoError(t, err)

	ok, err := Enforce(enforcer, "alice", "WH-SUB02", "receipts", "create")
	require.NoError(t, err)
	assert.False(t, ok, "alice should NOT have access to WH-SUB02")
}

func TestEnforce_DeniedMissingPermission(t *testing.T) {
	enforcer, err := NewEnforcer("")
	require.NoError(t, err)

	// Give alice read but not approve
	_, err = enforcer.AddPolicy("warehouse_staff", "WH-JKT01", "receipts", "read")
	require.NoError(t, err)
	_, err = enforcer.AddGroupingPolicy("alice", "warehouse_staff", "WH-JKT01")
	require.NoError(t, err)

	ok, err := Enforce(enforcer, "alice", "WH-JKT01", "receipts", "approve")
	require.NoError(t, err)
	assert.False(t, ok, "alice should NOT be allowed to approve receipts")
}

func TestEnforce_MultipleRoles(t *testing.T) {
	enforcer, err := NewEnforcer("")
	require.NoError(t, err)

	// Admin has approve permission
	_, err = enforcer.AddPolicy("admin", "WH-JKT01", "receipts", "approve")
	require.NoError(t, err)
	// Bob is admin in WH-JKT01
	_, err = enforcer.AddGroupingPolicy("bob", "admin", "WH-JKT01")
	require.NoError(t, err)

	ok, err := Enforce(enforcer, "bob", "WH-JKT01", "receipts", "approve")
	require.NoError(t, err)
	assert.True(t, ok, "bob with admin role should be allowed to approve receipts")
}

func TestBuildPolicies(t *testing.T) {
	rolePerms := []RolePermission{
		{RoleCode: "staff", PermissionCode: "item.read"},
		{RoleCode: "staff", PermissionCode: "item.write"},
		{RoleCode: "manager", PermissionCode: "grn.approve"},
		{RoleCode: "bad", PermissionCode: "malformed"}, // no "." — must be skipped
	}
	warehouses := []string{"WH01", "WH02"}

	policies := BuildPolicies(rolePerms, warehouses)

	// 3 valid (role, permission) pairs × 2 warehouses = 6 policies
	assert.Len(t, policies, 6)
	assert.Contains(t, policies, []string{"staff", "WH01", "item", "read"})
	assert.Contains(t, policies, []string{"staff", "WH02", "item", "write"})
	assert.Contains(t, policies, []string{"manager", "WH01", "grn", "approve"})
	assert.Contains(t, policies, []string{"manager", "WH02", "grn", "approve"})

	// Malformed permission codes are skipped, never wildcarded
	for _, p := range policies {
		assert.NotContains(t, p[2], "*")
	}
}

func TestBuildPolicies_NoWarehouses(t *testing.T) {
	policies := BuildPolicies([]RolePermission{{RoleCode: "staff", PermissionCode: "item.read"}}, nil)
	assert.Empty(t, policies)
}
