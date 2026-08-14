package document

import (
	"fmt"

	"inventory/internal/pkg/apperr"
)

// ValidateApprover enforces the maker-checker rule (BR-05, FSD 4.3):
// the user approving a document must not be the user who created it.
// The same rule is also enforced at the DB level by chk_maker_checker.
func ValidateApprover(createdBy, approvedBy int64) error {
	if createdBy == approvedBy {
		return &apperr.AppError{
			Code:    "ERR_SELF_APPROVAL",
			Message: fmt.Sprintf("approver (%d) must be different from the document creator (%d)", approvedBy, createdBy),
		}
	}
	return nil
}
