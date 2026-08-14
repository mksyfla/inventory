package document

import (
	"testing"

	"inventory/internal/pkg/apperr"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// allowedEdges lists every edge allowed by the FSD 4.4 state diagram.
var allowedEdges = map[Status][]Status{
	StatusDraft:      {StatusSubmitted, StatusCancelled},
	StatusSubmitted:  {StatusApproved, StatusDraft},
	StatusApproved:   {StatusInProgress, StatusCancelled},
	StatusInProgress: {StatusCompleted},
}

func TestTransition_ValidEdges(t *testing.T) {
	for from, nexts := range allowedEdges {
		for _, to := range nexts {
			got, err := from.Transition(to)
			require.NoError(t, err, "%s -> %s must be allowed", from, to)
			assert.Equal(t, to, got, "transition %s -> %s must yield %s", from, to, to)
		}
	}
}

func TestTransition_RejectsUnknownEdges(t *testing.T) {
	// Every pair not listed in the diagram must be rejected with
	// ERR_INVALID_STATE (FSD §5.4 → 409).
	all := AllStatuses()
	for _, from := range all {
		allowed := map[Status]bool{}
		for _, to := range allowedEdges[from] {
			allowed[to] = true
		}
		for _, to := range all {
			if from == to || allowed[to] {
				continue
			}
			got, err := from.Transition(to)
			require.Error(t, err, "%s -> %s must be rejected", from, to)

			appErr, ok := err.(*apperr.AppError)
			require.True(t, ok, "error must be an apperr.AppError")
			assert.Equal(t, "ERR_INVALID_STATE", appErr.Code, "%s -> %s", from, to)

			// The state machine must be unchanged by a failed transition.
			assert.Equal(t, from, got, "failed transition must not change status")
		}
	}
}

func TestCanTransitionTo(t *testing.T) {
	assert.True(t, StatusDraft.CanTransitionTo(StatusSubmitted))
	assert.True(t, StatusDraft.CanTransitionTo(StatusCancelled))
	assert.False(t, StatusDraft.CanTransitionTo(StatusApproved))
	assert.False(t, StatusDraft.CanTransitionTo(StatusInProgress))
	assert.False(t, StatusDraft.CanTransitionTo(StatusCompleted))
}

// TestCompletedIsFinal guards BR-10: a completed document must never change
// status, including cancellation — corrections go through reversing documents.
func TestCompletedIsFinal(t *testing.T) {
	for _, to := range AllStatuses() {
		if to == StatusCompleted {
			continue
		}
		_, err := StatusCompleted.Transition(to)
		require.Error(t, err, "completed -> %s must be rejected (BR-10)", to)
	}
	assert.False(t, StatusCompleted.CanTransitionTo(StatusCancelled))
}

// TestCancelledIsTerminal: a cancelled document cannot be reopened or progressed.
func TestCancelledIsTerminal(t *testing.T) {
	for _, to := range AllStatuses() {
		if to == StatusCancelled {
			continue
		}
		_, err := StatusCancelled.Transition(to)
		require.Error(t, err, "cancelled -> %s must be rejected", to)
	}
}

func TestTransition_UnknownFromStatus(t *testing.T) {
	// A status value not in the enum (e.g. corrupted data) must fail closed.
	_, err := Status("shipping").Transition(StatusCompleted)
	require.Error(t, err)
	appErr, ok := err.(*apperr.AppError)
	require.True(t, ok)
	assert.Equal(t, "ERR_INVALID_STATE", appErr.Code)
}
