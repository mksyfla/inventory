package apperr

import "net/http"

type AppError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Details   any    `json:"details,omitempty"`
	RequestID string `json:"request_id"`
}

// ErrorDetail is the neutral field-level detail shape (FSD §5.1). The
// delivery layer maps it to response.ErrorDetail; keeping the type here lets
// usecases emit validation details without importing the http layer.
type ErrorDetail struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// New builds an AppError with the given code and message.
func New(code, message string) *AppError {
	return &AppError{Code: code, Message: message}
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
