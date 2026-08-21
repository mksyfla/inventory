package outbound

import (
	"context"
	"time"

	"inventory/internal/domain/document"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/authz"
)

// PodInput carries the proof-of-delivery data (FR-4.6). File URLs are captured
// from the request (the client uploads the photo/signature first).
type PodInput struct {
	ReceivedBy   string
	ReceivedAt   *time.Time
	PodFileURL   string
	SignatureURL string
}

// Pod records the hand-over evidence and closes the DO as completed (Fase 7.7).
func (u *OutboundUsecase) Pod(ctx context.Context, id int64, in PodInput) (document.Status, error) {
	doc, _, err := u.docs.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	// C-02: the caller's warehouse must own the document before closing the DO.
	if err := authz.AssertDocInWarehouse(ctx, doc.WarehouseID); err != nil {
		return "", err
	}
	if doc.DocType != document.DocTypeDO {
		return "", apperr.New("ERR_NOT_FOUND", "delivery order not found")
	}
	if doc.Status != document.StatusInProgress {
		return "", apperr.New("ERR_INVALID_STATE", "POD requires a shipped (in_progress) delivery order")
	}
	if in.ReceivedBy == "" {
		return "", validationErr("received_by", "is required")
	}

	next, err := doc.Status.Transition(document.StatusCompleted)
	if err != nil {
		return "", err
	}

	receivedAt := u.now()
	if in.ReceivedAt != nil {
		receivedAt = *in.ReceivedAt
	}

	err = u.txRunner.RunInTx(ctx, func(txCtx context.Context) error {
		if err := u.docs.UpsertDelivery(txCtx, &document.Delivery{
			DocumentID:   id,
			ReceivedBy:   strPtr(in.ReceivedBy),
			ReceivedAt:   &receivedAt,
			PodFileURL:   strPtr(in.PodFileURL),
			SignatureURL: strPtr(in.SignatureURL),
		}); err != nil {
			return err
		}
		return u.docs.UpdateStatus(txCtx, id, next, nil)
	})
	return next, err
}
