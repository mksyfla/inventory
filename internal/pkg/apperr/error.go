package apperr

import "net/http"

type AppError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Details   any    `json:"details,omitempty"`
	RequestID string `json:"request_id"`
}

func (e *AppError) Error() string {
	return e.Message
}

// StatusForCode maps an error code to its HTTP status per FSD §5.4.
func StatusForCode(code string) int {
	switch code {
	case "ERR_VALIDATION", "ERR_INVALID_INPUT":
		return http.StatusUnprocessableEntity
	case "ERR_UNAUTHORIZED":
		return http.StatusUnauthorized
	case "ERR_FORBIDDEN", "ERR_SELF_APPROVAL":
		return http.StatusForbidden
	case "ERR_NOT_FOUND":
		return http.StatusNotFound
	case "ERR_STOCK_INSUFFICIENT", "ERR_INVALID_STATE", "ERR_DUPLICATE_KEY", "ERR_CONFLICT":
		return http.StatusConflict
	case "ERR_INTERNAL":
		return http.StatusInternalServerError
	default:
		return http.StatusBadRequest
	}
}
