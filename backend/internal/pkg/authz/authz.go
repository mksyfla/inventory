// Package authz carries the authenticated warehouse scope through the request
// context and enforces it against the documents a usecase is about to mutate.
//
// The RBAC middleware resolves the X-Warehouse-Id header into a numeric
// warehouse ID and stores it here (WithWarehouseID). Every state-transition
// usecase guards the document it loaded with AssertDocInWarehouse so a caller
// cannot approve, post or ship a document belonging to another warehouse —
// even when a handler or future code path forgets to compare explicitly.
// See BACKEND-AUDIT.md finding C-02.
package authz

import (
	"context"

	"inventory/internal/pkg/apperr"
)

// ctxKey is a private type so no other package can collide with our context
// value by accident.
type ctxKey string

const warehouseIDKey ctxKey = "authz.warehouse_id"

// WithWarehouseID returns a copy of ctx that carries the caller's resolved
// numeric warehouse ID. This is the authoritative warehouse scope for the data
// layer; it is set by RBACMiddleware after Casbin authorization.
func WithWarehouseID(ctx context.Context, warehouseID int64) context.Context {
	return context.WithValue(ctx, warehouseIDKey, warehouseID)
}

// WarehouseIDFromContext returns the caller's warehouse ID and whether the
// context carries one. ok is false for requests that never went through the
// RBAC middleware (or that bypass it in tests).
func WarehouseIDFromContext(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(warehouseIDKey).(int64)
	return id, ok
}

// AssertDocInWarehouse fails-closed before any state transition: when the
// caller has no warehouse scope, or the scope differs from the document's
// warehouse, it returns a 403 ERR_FORBIDDEN. The check runs immediately after
// the document is loaded and before anything is validated, transitioned or
// persisted, so cross-warehouse callers can neither mutate another warehouse's
// documents nor probe their state.
//
// For transfers the caller scope is the document's SOURCE warehouse on
// submit/approve/send and its DESTINATION warehouse on receive; the receive
// path therefore asserts against *doc.DestWarehouseID instead.
func AssertDocInWarehouse(ctx context.Context, docWarehouseID int64) error {
	callerID, ok := WarehouseIDFromContext(ctx)
	if !ok {
		return apperr.New("ERR_FORBIDDEN", "warehouse scope is required to act on this document")
	}
	if callerID != docWarehouseID {
		return apperr.New("ERR_FORBIDDEN", "document belongs to another warehouse")
	}
	return nil
}
