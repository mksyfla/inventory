package auth

import (
	"fmt"
	"strings"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/casbin/casbin/v2/persist/file-adapter"
)

// RBACModel is the Casbin domain-scoped RBAC model text as per FSD (sub, dom, obj, act).
const RBACModel = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && r.act == p.act
`

// NewEnforcer creates a Casbin enforcer with in-memory model and optional policy file path.
// If policyPath is empty, an empty policy is loaded (useful for testing with AddPolicy).
func NewEnforcer(policyPath string) (*casbin.Enforcer, error) {
	m, err := model.NewModelFromString(RBACModel)
	if err != nil {
		return nil, fmt.Errorf("casbin: failed to parse model: %w", err)
	}

	var enforcer *casbin.Enforcer
	if policyPath != "" {
		a := fileadapter.NewAdapter(policyPath)
		enforcer, err = casbin.NewEnforcer(m, a)
	} else {
		enforcer, err = casbin.NewEnforcer(m)
	}
	if err != nil {
		return nil, fmt.Errorf("casbin: failed to create enforcer: %w", err)
	}

	return enforcer, nil
}

// Enforce checks whether role `sub` can perform `act` on `obj` within domain `dom` (warehouse).
func Enforce(enforcer *casbin.Enforcer, sub, dom, obj, act string) (bool, error) {
	ok, err := enforcer.Enforce(sub, dom, obj, act)
	if err != nil {
		return false, fmt.Errorf("casbin: enforcement error: %w", err)
	}
	return ok, nil
}

// RolePermission pairs a role code with a permission code ("item.read").
type RolePermission struct {
	RoleCode       string
	PermissionCode string
}

// BuildPolicies expands (role, permission) rows across the active warehouses into
// Casbin policies of the form [role, warehouseCode, resource, action], matching the
// domain-scoped model (sub, dom, obj, act). Permission codes use the "resource.action"
// convention; codes without a "." are skipped (seed data must be concrete per FSD §5.2).
func BuildPolicies(rolePerms []RolePermission, warehouses []string) [][]string {
	var out [][]string
	for _, rp := range rolePerms {
		obj, act, ok := strings.Cut(rp.PermissionCode, ".")
		if !ok || obj == "" || act == "" {
			continue
		}
		for _, wh := range warehouses {
			out = append(out, []string{rp.RoleCode, wh, obj, act})
		}
	}
	return out
}
