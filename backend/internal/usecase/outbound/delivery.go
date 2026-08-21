package outbound

import (
	"context"
	"errors"

	"inventory/internal/domain/document"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"

	"github.com/jackc/pgx/v5"
)

// CreateDeliveryInput is the payload of POST /deliveries (Fase 7.1). The DO is
// created from an approved request whose lines are copied onto the DO.
type CreateDeliveryInput struct {
	WarehouseID    int64
	RequestID      int64
	PartnerID      *int64
	IdempotencyKey string
	Notes          string
	CreatedBy      int64
}

// CreateDelivery opens a DO draft based on an approved request (FR-4.1):
// validates the referenced REQ, copies its lines, allocates the DO number and
// persists everything in one transaction. A repeated Idempotency-Key returns
// the existing document (FSD 4.5).
func (u *OutboundUsecase) CreateDelivery(ctx context.Context, in CreateDeliveryInput) (*document.Document, []*document.DocumentLine, error) {
	if in.IdempotencyKey != "" {
		existing, err := u.docs.GetByIDempotencyKey(ctx, in.IdempotencyKey)
		if err == nil {
			return existing, nil, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, err
		}
	}

	req, reqLines, err := u.docs.GetByID(ctx, in.RequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, apperr.New("ERR_NOT_FOUND", "request not found")
		}
		return nil, nil, err
	}
	if req.DocType != document.DocTypeRequest {
		return nil, nil, validationErr("request_id", "referenced document is not a request")
	}
	if req.Status != document.StatusApproved {
		return nil, nil, validationErr("request_id", "request must be approved before a delivery order can be created")
	}
	if len(reqLines) == 0 {
		return nil, nil, validationErr("request_id", "request has no lines")
	}

	wh, err := u.wh.GetWarehouseByID(ctx, in.WarehouseID)
	if err != nil {
		return nil, nil, err
	}
	if !wh.IsActive {
		return nil, nil, validationErr("warehouse_id", "warehouse is inactive")
	}

	// Copy the request lines: the DO is the shipping document of the same goods.
	lines := make([]*document.DocumentLine, 0, len(reqLines))
	for i, ln := range reqLines {
		lines = append(lines, &document.DocumentLine{
			LineNo:     i + 1,
			ItemID:     ln.ItemID,
			Uom:        ln.Uom,
			ConvFactor: ln.ConvFactor,
			QtyRequest: ln.QtyRequest,
			Status:     "available",
		})
	}

	now := u.now()
	var doc *document.Document
	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		docNo, err := u.gen.Next(txCtx, document.DocTypeDO.String(), wh.Code, now)
		if err != nil {
			return err
		}
		doc = &document.Document{
			DocNo:          docNo,
			DocType:        document.DocTypeDO,
			DocDate:        now,
			Status:         document.StatusDraft,
			WarehouseID:    wh.ID,
			RefDocID:       &in.RequestID,
			PartnerID:      in.PartnerID,
			IdempotencyKey: strPtr(in.IdempotencyKey),
			Notes:          strPtr(in.Notes),
			CreatedBy:      in.CreatedBy,
		}
		return u.docs.Create(txCtx, doc, lines)
	})
	if err != nil {
		return nil, nil, err
	}
	return doc, lines, nil
}

// SubmitDelivery moves a draft DO to submitted (FSD 4.4).
func (u *OutboundUsecase) SubmitDelivery(ctx context.Context, id int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	// C-02: the caller's warehouse must own the document before any state change.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return err
	}
	if doc.DocType != document.DocTypeDO {
		return apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	next, err := doc.Status.Transition(document.StatusSubmitted)
	if err != nil {
		return err
	}
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
}

// ApproveDelivery approves a submitted DO (maker-checker BR-05).
func (u *OutboundUsecase) ApproveDelivery(ctx context.Context, id, approverID int64) error {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return err
	}
	// C-02: the caller's warehouse must own the document before any state change.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return err
	}
	if doc.DocType != document.DocTypeDO {
		return apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if err := document.ValidateApprover(doc.CreatedBy, approverID); err != nil {
		return err
	}
	next, err := doc.Status.Transition(document.StatusApproved)
	if err != nil {
		return err
	}
	return u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		return u.docs.UpdateStatus(txCtx, id, next, &approverID)
	})
}
