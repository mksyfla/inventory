package response

import (
	"errors"
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

type Meta struct {
	PageSize   int    `json:"page_size,omitempty"`
	NextCursor string `json:"next_cursor,omitempty"`
}

type ErrorDetail struct {
	Field     string `json:"field,omitempty"`
	Message   string `json:"message,omitempty"`
	SKU       string `json:"sku,omitempty"`
	Requested any    `json:"requested,omitempty"`
	Available any    `json:"available,omitempty"`
}

type ErrorPayload struct {
	Code      string        `json:"code"`
	Message   string        `json:"message"`
	Details   []ErrorDetail `json:"details,omitempty"`
	RequestID string        `json:"request_id,omitempty"`
}

type Response struct {
	Success bool          `json:"success"`
	Data    any           `json:"data"`
	Meta    *Meta         `json:"meta,omitempty"`
	Error   *ErrorPayload `json:"error"`
}

func Success(c echo.Context, status int, data any, meta *Meta) error {
	return c.JSON(status, Response{
		Success: true,
		Data:    data,
		Meta:    meta,
		Error:   nil,
	})
}

func Error(c echo.Context, status int, code string, message string, details []ErrorDetail, reqID string) error {
	return c.JSON(status, Response{
		Success: false,
		Data:    nil,
		Meta:    nil,
		Error: &ErrorPayload{
			Code:      code,
			Message:   message,
			Details:   details,
			RequestID: reqID,
		},
	})
}

// ValidationDetails translates validator.ValidationErrors into ErrorDetail entries
// with safe client-facing messages. Field names are JSON names (see pkg/validation).
func ValidationDetails(err error) []ErrorDetail {
	var vErrs validator.ValidationErrors
	if !errors.As(err, &vErrs) {
		// Not a validator error — keep the client message generic (no leak).
		return []ErrorDetail{{Field: "body", Message: "invalid value"}}
	}
	details := make([]ErrorDetail, 0, len(vErrs))
	for _, fe := range vErrs {
		details = append(details, ErrorDetail{Field: fe.Field(), Message: validationMessage(fe)})
	}
	return details
}

// validationMessage maps a failed validation tag to a short client-safe message.
func validationMessage(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "is required"
	case "email":
		return "must be a valid email address"
	case "min":
		return fmt.Sprintf("must be at least %s characters long", fe.Param())
	case "max":
		return fmt.Sprintf("must be at most %s characters long", fe.Param())
	case "len":
		return fmt.Sprintf("must be exactly %s characters long", fe.Param())
	case "oneof":
		return fmt.Sprintf("must be one of [%s]", fe.Param())
	case "gt":
		return fmt.Sprintf("must be greater than %s", fe.Param())
	case "gte":
		return fmt.Sprintf("must be greater than or equal to %s", fe.Param())
	case "lt":
		return fmt.Sprintf("must be less than %s", fe.Param())
	case "lte":
		return fmt.Sprintf("must be less than or equal to %s", fe.Param())
	case "gtefield":
		return fmt.Sprintf("must be greater than or equal to %s", fe.Param())
	case "ltefield":
		return fmt.Sprintf("must be less than or equal to %s", fe.Param())
	case "dive":
		// The actual failing tag is on the nested struct element; dive itself
		// rarely surfaces as the reported tag, keep a generic fallback.
		return "contains an invalid value"
	case "uuid":
		return "must be a valid UUID"
	case "numeric":
		return "must be numeric"
	case "alphanum":
		return "must contain only letters and numbers"
	default:
		return "invalid value (" + strings.ToLower(fe.Tag()) + ")"
	}
}
