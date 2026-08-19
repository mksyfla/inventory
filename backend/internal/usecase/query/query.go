// Package query is the thin read-only usecase over the query repository.
// It exists to keep handlers free of repository wiring and to give the shared
// GET endpoints a single, testable entry point.
package query

import (
	"context"

	"inventory/internal/domain/query"
)

// ReadUsecase serves the shared read endpoints. It carries no state besides
// the repository reference.
type ReadUsecase struct {
	repo query.Repository
}

// NewReadUsecase wires the read usecase on a query.Repository implementation.
func NewReadUsecase(repo query.Repository) *ReadUsecase {
	return &ReadUsecase{repo: repo}
}

func (u *ReadUsecase) ListDocuments(ctx context.Context, f query.DocumentFilter) ([]query.DocumentSummary, error) {
	return u.repo.ListDocuments(ctx, f)
}

func (u *ReadUsecase) GetDocumentDetail(ctx context.Context, id int64) (*query.DocumentDetail, error) {
	return u.repo.GetDocumentDetail(ctx, id)
}

func (u *ReadUsecase) GetCountDocumentDetail(ctx context.Context, id int64, blind bool) (*query.CountDocumentDetail, error) {
	return u.repo.GetCountDocumentDetail(ctx, id, blind)
}

func (u *ReadUsecase) ListStockBalances(ctx context.Context, f query.StockBalanceFilter) ([]query.StockBalance, error) {
	return u.repo.ListStockBalances(ctx, f)
}

func (u *ReadUsecase) ListBatchTrace(ctx context.Context, search string) ([]query.BatchTrace, error) {
	return u.repo.ListBatchTrace(ctx, search)
}

func (u *ReadUsecase) ListStockLedger(ctx context.Context, f query.StockLedgerFilter) ([]query.StockLedgerRow, error) {
	return u.repo.ListStockLedger(ctx, f)
}

func (u *ReadUsecase) ListWarehouses(ctx context.Context) ([]query.Warehouse, error) {
	return u.repo.ListWarehouses(ctx)
}

func (u *ReadUsecase) ListUsers(ctx context.Context) ([]query.UserSummary, error) {
	return u.repo.ListUsers(ctx)
}

func (u *ReadUsecase) ListRoles(ctx context.Context) ([]query.RoleSummary, error) {
	return u.repo.ListRoles(ctx)
}

func (u *ReadUsecase) ListPermissions(ctx context.Context) ([]query.PermissionSummary, error) {
	return u.repo.ListPermissions(ctx)
}

func (u *ReadUsecase) ListAuditLogs(ctx context.Context, limit, offset int) ([]query.AuditLog, error) {
	return u.repo.ListAuditLogs(ctx, limit, offset)
}

func (u *ReadUsecase) GetFsnReport(ctx context.Context) ([]query.FsnReportRow, error) {
	return u.repo.GetFsnReport(ctx)
}

func (u *ReadUsecase) GetValuationReport(ctx context.Context) ([]query.ValuationReportRow, error) {
	return u.repo.GetValuationReport(ctx)
}

func (u *ReadUsecase) GetSpaceUtilizationReport(ctx context.Context) ([]query.SpaceUtilizationRow, error) {
	return u.repo.GetSpaceUtilizationReport(ctx)
}

func (u *ReadUsecase) GetDashboardSummary(ctx context.Context) (*query.DashboardSummary, error) {
	return u.repo.GetDashboardSummary(ctx)
}
