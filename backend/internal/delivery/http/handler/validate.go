package handler

import (
	"errors"
	"net/http"
	"strconv"

	"inventory/internal/delivery/http/response"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// bindAndValidate binds a JSON body and validates it. On failure it writes a
// 422 ERR_VALIDATION envelope with per-field details and returns false, so the
// caller can `return nil` (the response is already committed).
func bindAndValidate(c echo.Context, out any) bool {
	if err := c.Bind(out); err != nil {
		var vErrs validator.ValidationErrors
		var httpErr *echo.HTTPError
		if errors.As(err, &httpErr) && errors.As(httpErr.Internal, &vErrs) {
			// Echo's default binder validates automatically when e.Validator is set.
			_ = response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
				"Invalid request payload", response.ValidationDetails(vErrs), reqID(c))
			return false
		}
		_ = response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
			"Invalid request payload", []response.ErrorDetail{{Field: "body", Message: "malformed JSON body"}}, reqID(c))
		return false
	}
	// Explicit validation as defense-in-depth. Echo v4.15 returns an error when
	// no validator is registered, so only validate when one is configured.
	if c.Echo().Validator != nil {
		if err := c.Validate(out); err != nil {
			_ = response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION",
				"Invalid request payload", response.ValidationDetails(err), reqID(c))
			return false
		}
	}
	return true
}

// queryValidationError writes a single-field 422 ERR_VALIDATION error for a
// query/path param and returns nil (response already committed).
func queryValidationError(c echo.Context, field, message string) error {
	_ = response.Error(c, http.StatusUnprocessableEntity, "ERR_VALIDATION", "Invalid request parameters",
		[]response.ErrorDetail{{Field: field, Message: message}}, reqID(c))
	return nil
}

// pathIDParam parses a positive int64 path param, writing 422 ERR_VALIDATION
// and returning ok=false on failure.
func pathIDParam(c echo.Context, name string) (int64, bool) {
	id, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || id <= 0 {
		_ = queryValidationError(c, name, "must be a positive integer")
		return 0, false
	}
	return id, true
}
