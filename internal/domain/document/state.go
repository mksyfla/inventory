// Package document defines the document entities and repository interfaces.
package document

import (
	"fmt"

	"inventory/internal/pkg/apperr"
)

// Status represents the document lifecycle state (doc.doc_status enum).
type Status string

const (
	StatusDraft      Status = "draft"
	StatusSubmitted  Status = "submitted"
	StatusApproved   Status = "approved"
	StatusInProgress Status = "in_progress"
	StatusCompleted  Status = "completed"
	StatusCancelled  Status = "cancelled"
)

// validTransitions encodes the FSD 4.4 state diagram:
//
//	Draft ------> Submitted : submit()
//	Draft ------> Cancelled : cancel(reason)
//	Submitted --> Approved  : approve() [maker != checker]
//	Submitted --> Draft     : reject(reason)
//	Approved ---> InProgress: start()
//	InProgress -> Completed : post() [stock posted]
//	Approved ---> Cancelled : cancel(reason)
//	Completed is final (BR-10) and Cancelled is terminal: no outgoing edges.
var validTransitions = map[Status]map[Status]bool{
	StatusDraft: {
		StatusSubmitted: true,
		StatusCancelled: true,
	},
	StatusSubmitted: {
		StatusApproved: true,
		StatusDraft:    true,
	},
	StatusApproved: {
		StatusInProgress: true,
		StatusCancelled:  true,
	},
	StatusInProgress: {
		StatusCompleted: true,
	},
	StatusCompleted: {}, // final — cannot be changed or cancelled (BR-10)
	StatusCancelled: {}, // terminal — documents are recreated, not reopened
}

// CanTransitionTo reports whether the state machine allows moving from s to next.
func (s Status) CanTransitionTo(next Status) bool {
	allowed, ok := validTransitions[s]
	return ok && allowed[next]
}

// Transition moves the state machine from s to next.
// Transitions outside the diagram return ERR_INVALID_STATE (FSD §5.4 → 409).
func (s Status) Transition(next Status) (Status, error) {
	if !s.CanTransitionTo(next) {
		return s, &apperr.AppError{
			Code:    "ERR_INVALID_STATE",
			Message: fmt.Sprintf("transition %s -> %s is not allowed", s, next),
		}
	}
	return next, nil
}

// AllStatuses lists every supported status in lifecycle order.
func AllStatuses() []Status {
	return []Status{
		StatusDraft, StatusSubmitted, StatusApproved,
		StatusInProgress, StatusCompleted, StatusCancelled,
	}
}
