package counting

import "inventory/internal/pkg/apperr"

func validationErr(field, msg string) error {
	return &apperr.AppError{
		Code:    "ERR_VALIDATION",
		Message: "Invalid request payload",
		Details: []apperr.ErrorDetail{{Field: field, Message: msg}},
	}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
