package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"inventory/internal/domain/query"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// QueryRepository implements query.Repository over the sqlc *Queries. It is
// strictly read-only: every method maps a generated query row into the domain
// models and normalizes pgtype scalars to Go types for the JSON envelope.
type QueryRepository struct {
	queries *Queries
}

// NewQueryRepository wires the read repository on the sqlc Queries.
func NewQueryRepository(q *Queries) *QueryRepository {
	return &QueryRepository{queries: q}
}

// ─── documents ─────────────────────────────────────────────────────────────

func (r *QueryRepository) ListDocuments(ctx context.Context, f query.DocumentFilter) ([]query.DocumentSummary, error) {
	rows, err := r.queries.ListDocuments(ctx, ListDocumentsParams{
		Column1: f.DocType,
		Column2: f.Status,
		Column3: f.WarehouseID,
		Limit:   int32(f.Limit),
		Offset:  int32(f.Offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]query.DocumentSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.DocumentSummary{
			ID:                row.ID,
			PublicID:          row.PublicID.String(),
			DocNo:             row.DocNo,
			DocType:           row.DDocType,
			DocDate:           qDateString(row.DocDate),
			Status:            row.DStatus,
			WarehouseID:       row.WarehouseID,
			DestWarehouseID:   qInt8Ptr(row.DestWarehouseID),
			PartnerID:         qInt8Ptr(row.PartnerID),
			ReasonCode:        qTextString(row.ReasonCode),
			Notes:             qTextString(row.Notes),
			CreatedAt:         row.CreatedAt.Time,
			CreatedBy:         row.CreatedBy,
			SubmittedAt:       qTsPtr(row.SubmittedAt),
			ApprovedAt:        qTsPtr(row.ApprovedAt),
			ApprovedBy:        qInt8Ptr(row.ApprovedBy),
			CompletedAt:       qTsPtr(row.CompletedAt),
			ManagerApprovedBy: qInt8Ptr(row.ManagerApprovedBy),
			ManagerApprovedAt: qTsPtr(row.ManagerApprovedAt),
			WarehouseCode:     qTextString(row.WarehouseCode),
			WarehouseName:     qTextString(row.WarehouseName),
			DestWarehouseCode: qTextString(row.DestWarehouseCode),
			DestWarehouseName: qTextString(row.DestWarehouseName),
			PartnerCode:       qTextString(row.PartnerCode),
			PartnerName:       qTextString(row.PartnerName),
			RefDocNo:          qTextString(row.RefDocNo),
			LineCount:         row.LineCount,
		})
	}
	return out, nil
}

func (r *QueryRepository) GetDocumentDetail(ctx context.Context, id, warehouseID int64) (*query.DocumentDetail, error) {
	// C-03: the warehouse predicate lives in the SQL (id + source-or-dest
	// warehouse), so a caller outside the document's warehouse gets ErrNoRows
	// and the handler maps it to 404 — existence is never confirmed.
	doc, err := r.queries.GetDocumentByIDInWarehouse(ctx, GetDocumentByIDInWarehouseParams{
		ID:          id,
		WarehouseID: warehouseID,
	})
	if err != nil {
		return nil, err // pgx.ErrNoRows mapped to 404 by the handler
	}

	detail := &query.DocumentDetail{
		ID:                doc.ID,
		PublicID:          doc.PublicID.String(),
		DocNo:             doc.DocNo,
		DocType:           fmt.Sprint(doc.DocType),
		DocDate:           qDateString(doc.DocDate),
		Status:            fmt.Sprint(doc.Status),
		WarehouseID:       doc.WarehouseID,
		DestWarehouseID:   qInt8Ptr(doc.DestWarehouseID),
		PartnerID:         qInt8Ptr(doc.PartnerID),
		ReasonCode:        qTextString(doc.ReasonCode),
		Notes:             qTextString(doc.Notes),
		CreatedAt:         doc.CreatedAt.Time,
		CreatedBy:         doc.CreatedBy,
		SubmittedAt:       qTsPtr(doc.SubmittedAt),
		ApprovedAt:        qTsPtr(doc.ApprovedAt),
		ApprovedBy:        qInt8Ptr(doc.ApprovedBy),
		CompletedAt:       qTsPtr(doc.CompletedAt),
		ManagerApprovedBy: qInt8Ptr(doc.ManagerApprovedBy),
		ManagerApprovedAt: qTsPtr(doc.ManagerApprovedAt),
		Lines:             []query.DocumentLine{},
	}

	// Source warehouse (always present).
	if wh, err := r.queries.GetDocumentWarehouse(ctx, doc.WarehouseID); err == nil {
		detail.WarehouseCode = wh.Code
		detail.WarehouseName = wh.Name
		detail.SourceWarehouse = &query.WarehouseRef{
			ID:       wh.ID,
			Code:     wh.Code,
			Name:     wh.Name,
			IsActive: wh.IsActive,
		}
	}
	// Destination warehouse (transfers).
	if doc.DestWarehouseID.Valid {
		if wh, err := r.queries.GetDocumentWarehouse(ctx, doc.DestWarehouseID.Int64); err == nil {
			detail.DestWarehouseCode = wh.Code
			detail.DestWarehouseName = wh.Name
			detail.DestWarehouse = &query.WarehouseRef{
				ID:       wh.ID,
				Code:     wh.Code,
				Name:     wh.Name,
				IsActive: wh.IsActive,
			}
		}
	}
	// Referenced document (DO → its REQ), for the "Ref. Permintaan" column.
	if doc.RefDocID.Valid {
		if rd, err := r.queries.GetDocumentByID(ctx, doc.RefDocID.Int64); err == nil {
			detail.RefDocNo = rd.DocNo
		}
	}
	// Partner (receipts, requests, deliveries).
	if doc.PartnerID.Valid {
		if p, err := r.queries.GetDocumentPartner(ctx, doc.PartnerID.Int64); err == nil {
			detail.PartnerCode = p.Code
			detail.PartnerName = p.Name
			detail.Partner = &query.PartnerRef{
				ID:          p.ID,
				Code:        p.Code,
				PartnerType: p.PPartnerType,
				Name:        p.Name,
				IsActive:    p.IsActive,
			}
		}
	}

	lines, err := r.queries.GetDocumentLinesWithItem(ctx, id)
	if err != nil {
		return nil, err
	}
	detail.Lines = make([]query.DocumentLine, 0, len(lines))
	for _, row := range lines {
		line := query.DocumentLine{
			ID:           row.ID,
			DocumentID:   row.DocumentID,
			LineNo:       int(row.LineNo),
			ItemID:       row.ItemID,
			SKU:          row.Sku,
			ItemName:     row.ItemName,
			Uom:          row.Uom,
			ConvFactor:   qNumF(row.ConvFactor),
			QtyRequest:   qNumF(row.QtyRequest),
			QtyProcessed: qNumF(row.QtyProcessed),
			BatchID:      qInt8Ptr(row.BatchID),
			LocationID:   qInt8Ptr(row.LocationID),
			Status:       row.DlStatus,
			Notes:        qTextString(row.Notes),
		}
		detail.Lines = append(detail.Lines, line)
	}
	detail.LineCount = int64(len(detail.Lines))
	return detail, nil
}

// GetCountDocumentDetail returns a CNT document header + its snapshot/result
// lines joined with item/location/batch. Non-CNT documents answer pgx.ErrNoRows
// so the handler maps them to 404. Scoped to the caller's warehouse (C-03):
// a CNT in another warehouse answers ErrNoRows, never a row.
func (r *QueryRepository) GetCountDocumentDetail(ctx context.Context, id, warehouseID int64, blind bool) (*query.CountDocumentDetail, error) {
	doc, err := r.queries.GetDocumentByIDInWarehouse(ctx, GetDocumentByIDInWarehouseParams{
		ID:          id,
		WarehouseID: warehouseID,
	})
	if err != nil {
		return nil, err
	}
	if fmt.Sprint(doc.DocType) != "CNT" {
		return nil, pgx.ErrNoRows
	}

	detail := &query.CountDocumentDetail{
		ID:          doc.ID,
		PublicID:    doc.PublicID.String(),
		DocNo:       doc.DocNo,
		DocType:     fmt.Sprint(doc.DocType),
		DocDate:     qDateString(doc.DocDate),
		Status:      fmt.Sprint(doc.Status),
		WarehouseID: doc.WarehouseID,
		Notes:       qTextString(doc.Notes),
		CreatedAt:   doc.CreatedAt.Time,
		CreatedBy:   doc.CreatedBy,
		Lines:       []query.CountLineDetail{},
	}

	if wh, err := r.queries.GetDocumentWarehouse(ctx, doc.WarehouseID); err == nil {
		detail.WarehouseCode = wh.Code
		detail.WarehouseName = wh.Name
	}

	rows, err := r.queries.GetCountLinesWithItem(ctx, id)
	if err != nil {
		return nil, err
	}
	detail.Lines = make([]query.CountLineDetail, 0, len(rows))
	for _, row := range rows {
		line := query.CountLineDetail{
			ID:           row.ID,
			ItemID:       row.ItemID,
			SKU:          row.Sku,
			ItemName:     row.ItemName,
			Uom:          row.BaseUom,
			LocationID:   row.LocationID,
			LocationCode: qTextString(row.LocationCode),
			BatchID:      qInt8Ptr(row.BatchID),
			BatchNo:      qTextString(row.BatchNo),
			ExpiryDate:   qDateString(row.ExpiryDate),
			QtyCounted:   qNumPtr(row.QtyCounted),
			Variance:     qNumPtr(row.Variance),
			ReasonCode:   qTextString(row.ReasonCode),
			CountedBy:    qInt8Ptr(row.CountedBy),
			CountedAt:    qTsPtr(row.CountedAt),
		}
		// Blind Count (FR-6.1): the system quantity is only sent to the
		// supervisor reconciliation view, never to the field device.
		if !blind {
			line.QtySystem = qNumPtr(row.QtySystem)
		}
		detail.Lines = append(detail.Lines, line)
	}
	return detail, nil
}

// ─── stock ─────────────────────────────────────────────────────────────────

func (r *QueryRepository) ListStockBalances(ctx context.Context, f query.StockBalanceFilter) ([]query.StockBalance, error) {
	rows, err := r.queries.ListStockBalances(ctx, ListStockBalancesParams{
		Column1: f.WarehouseCode,
		Column2: f.Status,
		Column3: f.Search,
		Column4: f.CategoryID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]query.StockBalance, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.StockBalance{
			BalanceID:     row.BalanceID,
			ItemID:        row.ItemID,
			SKU:           row.Sku,
			ItemName:      row.ItemName,
			BaseUom:       row.BaseUom,
			CategoryName:  row.CategoryName,
			WarehouseID:   row.WarehouseID,
			WarehouseName: row.WarehouseName,
			LocationID:    row.LocationID,
			LocationCode:  row.LocationCode,
			Zone:          qTextString(row.Zone),
			Rack:          qTextString(row.Rack),
			Level:         qTextString(row.Level),
			BatchID:       qInt8Ptr(row.BatchID),
			BatchNo:       qTextString(row.BatchNo),
			ExpiryDate:    qDateString(row.ExpiryDate),
			Status:        row.BStatus,
			QtyOnhand:     qNumF(row.QtyOnhand),
			QtyReserved:   qNumF(row.QtyReserved),
			UpdatedAt:     row.UpdatedAt.Time,
		})
	}
	return out, nil
}

func (r *QueryRepository) ListBatchTrace(ctx context.Context, search string) ([]query.BatchTrace, error) {
	rows, err := r.queries.ListBatchTrace(ctx, search)
	if err != nil {
		return nil, err
	}
	out := make([]query.BatchTrace, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.BatchTrace{
			BatchID:      row.BatchID,
			BatchNo:      row.BatchNo,
			ItemID:       row.ItemID,
			SKU:          row.Sku,
			ItemName:     row.ItemName,
			BaseUom:      row.BaseUom,
			MfgDate:      qDateString(row.MfgDate),
			ExpiryDate:   qDateString(row.ExpiryDate),
			BalanceID:    qInt8Ptr(row.BalanceID),
			LocationID:   qInt8Ptr(row.LocationID),
			LocationCode: qTextString(row.LocationCode),
			Status:       row.SbStatus,
			QtyOnhand:    qNumF(row.QtyOnhand),
			QtyReserved:  qNumF(row.QtyReserved),
			GrnNo:        row.GrnNo,
			GrnDate:      qDateString(row.GrnDate),
			SupplierName: qTextString(row.SupplierName),
		})
	}
	return out, nil
}

func (r *QueryRepository) ListStockLedger(ctx context.Context, f query.StockLedgerFilter) ([]query.StockLedgerRow, error) {
	rows, err := r.queries.ListStockLedger(ctx, ListStockLedgerParams{
		Column1: f.ItemID,
		Column2: pgtype.Timestamptz{Time: f.From, Valid: true},
		Column3: pgtype.Timestamptz{Time: f.To, Valid: true},
		Limit:   int32(f.Limit),
		Offset:  int32(f.Offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]query.StockLedgerRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.StockLedgerRow{
			ID:           row.ID,
			MovedAt:      row.MovedAt.Time,
			ItemID:       row.ItemID,
			SKU:          row.Sku,
			ItemName:     row.ItemName,
			BaseUom:      row.BaseUom,
			LocationID:   row.LocationID,
			LocationCode: qTextString(row.LocationCode),
			BatchID:      qInt8Ptr(row.BatchID),
			BatchNo:      qTextString(row.BatchNo),
			Status:       row.MStatus,
			MovementType: row.MMovementType,
			Qty:          qNumF(row.Qty),
			QtyAfter:     qNumF(row.QtyAfter),
			DocNo:        row.DocNo,
			CreatedBy:    row.CreatedBy,
			OperatorName: row.OperatorName,
		})
	}
	return out, nil
}

// ─── warehouse / admin ─────────────────────────────────────────────────────

func (r *QueryRepository) ListWarehouses(ctx context.Context) ([]query.Warehouse, error) {
	rows, err := r.queries.ListWarehouses(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.Warehouse, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.Warehouse{
			ID:       row.ID,
			Code:     row.Code,
			Name:     row.Name,
			Address:  qTextString(row.Address),
			IsActive: row.IsActive,
		})
	}
	return out, nil
}

func (r *QueryRepository) ListUsers(ctx context.Context) ([]query.UserSummary, error) {
	rows, err := r.queries.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.UserSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.UserSummary{
			ID:           row.ID,
			Username:     row.Username,
			Email:        qTextString(row.Email),
			FullName:     row.FullName,
			Phone:        qTextString(row.Phone),
			IsActive:     row.IsActive,
			LastLoginAt:  qTsPtr(row.LastLoginAt),
			Roles:        row.Roles,
			Warehouses:   row.Warehouses,
			WarehouseIDs: row.WarehouseIds,
		})
	}
	return out, nil
}

func (r *QueryRepository) ListRoles(ctx context.Context) ([]query.RoleSummary, error) {
	rows, err := r.queries.ListRoles(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.RoleSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.RoleSummary{
			ID:          row.ID,
			Code:        qTextString(row.Code),
			Name:        qTextString(row.Name),
			Description: qTextString(row.Description),
			Permissions: row.Permissions,
		})
	}
	return out, nil
}

func (r *QueryRepository) ListPermissions(ctx context.Context) ([]query.PermissionSummary, error) {
	rows, err := r.queries.ListPermissions(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.PermissionSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.PermissionSummary{ID: row.ID, Code: qTextString(row.Code)})
	}
	return out, nil
}

func (r *QueryRepository) ListAuditLogs(ctx context.Context, limit, offset int) ([]query.AuditLog, error) {
	rows, err := r.queries.ListAuditLogs(ctx, ListAuditLogsParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]query.AuditLog, 0, len(rows))
	for _, row := range rows {
		log := query.AuditLog{
			ID:            row.ID,
			OccurredAt:    row.OccurredAt.Time,
			UserID:        qInt8Ptr(row.UserID),
			ActorUsername: qTextString(row.ActorUsername),
			Action:        row.Action,
			Entity:        row.Entity,
			EntityID:      qInt8Ptr(row.EntityID),
			OldValue:      json.RawMessage(row.OldValue),
			NewValue:      json.RawMessage(row.NewValue),
			IPAddress:     row.AlIpAddress,
			RequestID:     qUUIDString(row.RequestID),
		}
		out = append(out, log)
	}
	return out, nil
}

// ─── reports / dashboard ───────────────────────────────────────────────────

func (r *QueryRepository) GetFsnReport(ctx context.Context) ([]query.FsnReportRow, error) {
	rows, err := r.queries.GetFsnReport(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.FsnReportRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.FsnReportRow{
			ID:               row.ID,
			SKU:              row.Sku,
			ItemName:         row.ItemName,
			CategoryName:     row.CategoryName,
			BaseUom:          row.BaseUom,
			LastMovementDate: row.LastMovementDate.Time,
			FsnCategory:      row.FsnCategory,
			TurnoverRatio:    int(row.TurnoverRatio),
			CurrentQty:       row.CurrentQty,
			TotalValuation:   row.TotalValuation,
		})
	}
	return out, nil
}

func (r *QueryRepository) GetValuationReport(ctx context.Context) ([]query.ValuationReportRow, error) {
	rows, err := r.queries.GetValuationReport(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.ValuationReportRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.ValuationReportRow{
			ID:            row.ID,
			SKU:           row.Sku,
			ItemName:      row.ItemName,
			CategoryName:  row.CategoryName,
			Uom:           row.Uom,
			UnitPrice:     row.UnitPrice,
			EndingQty:     row.EndingQty,
			EndingValue:   row.EndingValue,
			InboundQty:    row.InboundQty,
			InboundValue:  row.InboundValue,
			OutboundQty:   row.OutboundQty,
			OutboundValue: row.OutboundValue,
		})
	}
	return out, nil
}

func (r *QueryRepository) GetSpaceUtilizationReport(ctx context.Context) ([]query.SpaceUtilizationRow, error) {
	rows, err := r.queries.GetSpaceUtilizationReport(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]query.SpaceUtilizationRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, query.SpaceUtilizationRow{
			WarehouseID:      row.WarehouseID,
			WarehouseCode:    row.WarehouseCode,
			WarehouseName:    row.WarehouseName,
			LocationID:       row.LocationID,
			LocationCode:     row.LocationCode,
			ZoneName:         row.ZoneName,
			LocType:          row.LocType,
			CapacityVolumeM3: row.CapacityVolumeM3,
			UsedVolumeM3:     row.UsedVolumeM3,
		})
	}
	return out, nil
}

func (r *QueryRepository) GetDashboardSummary(ctx context.Context) (*query.DashboardSummary, error) {
	row, err := r.queries.GetDashboardSummary(ctx)
	if err != nil {
		return nil, err
	}
	return &query.DashboardSummary{
		GrnToday:       row.GrnToday,
		DoToday:        row.DoToday,
		ReqOpen:        row.ReqOpen,
		DoOpen:         row.DoOpen,
		BelowMinItems:  row.BelowMinItems,
		TotalValuation: row.TotalValuation,
	}, nil
}

// ─── pgtype normalizers (query.go) ──────────────────────────────────────────

func qTextString(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

func qDateString(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format("2006-01-02")
}

func qTsPtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func qInt8Ptr(i pgtype.Int8) *int64 {
	if !i.Valid {
		return nil
	}
	v := i.Int64
	return &v
}

func qUUIDString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return u.String()
}

func qNumF(n pgtype.Numeric) float64 {
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}

func qNumPtr(n pgtype.Numeric) *float64 {
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return nil
	}
	v := f.Float64
	return &v
}
