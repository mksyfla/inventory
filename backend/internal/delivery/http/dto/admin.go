package dto

// CreateUserRequest is the payload of POST /users. Roles is a list of role
// codes; WarehouseIDs is the list of warehouses each role is scoped to.
type CreateUserRequest struct {
	Username     string   `json:"username" validate:"required,min=3,max=50"`
	Email        string   `json:"email"`
	FullName     string   `json:"full_name" validate:"required"`
	Phone        string   `json:"phone"`
	Password     string   `json:"password" validate:"required,min=6"`
	IsActive     *bool    `json:"is_active"`
	Roles        []string `json:"roles"`
	WarehouseIDs []int64  `json:"warehouse_ids"`
}

// UpdateUserRequest is the payload of PATCH /users/:id. Password is optional:
// omit it to keep the existing password. Roles/WarehouseIDs are authoritative
// (empty clears the assignments).
type UpdateUserRequest struct {
	FullName     string   `json:"full_name" validate:"required"`
	Email        string   `json:"email"`
	Phone        string   `json:"phone"`
	Password     *string  `json:"password"`
	IsActive     *bool    `json:"is_active"`
	Roles        []string `json:"roles"`
	WarehouseIDs []int64  `json:"warehouse_ids"`
}

// CreateRoleRequest is the payload of POST /roles. Permissions is a list of
// permission codes.
type CreateRoleRequest struct {
	Code        string   `json:"code" validate:"required,min=2,max=40"`
	Name        string   `json:"name" validate:"required,min=2,max=100"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

// UpdateRoleRequest is the payload of PATCH /roles/:id.
type UpdateRoleRequest struct {
	Code        string   `json:"code" validate:"required,min=2,max=40"`
	Name        string   `json:"name" validate:"required,min=2,max=100"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}
