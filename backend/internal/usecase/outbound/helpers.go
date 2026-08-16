package outbound

import "inventory/internal/pkg/apperr"

// ShortageDetail is the per-line shortage shape carried by
// ERR_STOCK_INSUFFICIENT (FSD §4.2). Its JSON tags line up with the delivery
// layer's ErrorDetail so details survive the error mapping.
type ShortageDetail struct {
	Field     string  `json:"field"`
	SKU       string  `json:"sku,omitempty"`
	Requested float64 `json:"requested"`
	Available float64 `json:"available"`
}

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
