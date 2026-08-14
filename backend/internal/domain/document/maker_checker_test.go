package document

import (
	"testing"

	"inventory/internal/pkg/apperr"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateApprover_DifferentUsers(t *testing.T) {
	assert.NoError(t, ValidateApprover(1, 2), "approver must differ from creator")
}

func TestValidateApprover_SelfApproval(t *testing.T) {
	// BR-05: the same user must not both create and approve a document.
	err := ValidateApprover(7, 7)
	require.Error(t, err)

	appErr, ok := err.(*apperr.AppError)
	require.True(t, ok)
	assert.Equal(t, "ERR_SELF_APPROVAL", appErr.Code)
	assert.Contains(t, appErr.Message, "7")
}

func TestValidateApprover_ZeroValues(t *testing.T) {
	// Zero approved_by means "not yet approved" — must not be treated as self-approval.
	assert.NoError(t, ValidateApprover(1, 0))
}
