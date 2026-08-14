package middleware

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/apperr"
	stockuc "inventory/internal/usecase/stock"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// mapErrorCodeToStatus maps custom business error codes to HTTP status codes (FSD §5.4).
func mapErrorCodeToStatus(code string) int {
	return apperr.StatusForCode(code)
}

// shortageDetails converts stock-shortage details into the envelope format so
// they reach clients instead of being dropped by the type assertion below.
func shortageDetails(appErr *apperr.AppError) []response.ErrorDetail {
	dd, ok := appErr.Details.([]stockuc.ShortageDetail)
	if !ok {
		return nil
	}
	details := make([]response.ErrorDetail, 0, len(dd))
	for _, d := range dd {
		details = append(details, response.ErrorDetail{
			Field:     d.Field,
			SKU:       d.SKU,
			Requested: d.Requested,
			Available: d.Available,
			Message:   fmt.Sprintf("insufficient stock: requested %v, available %v", d.Requested, d.Available),
		})
	}
	return details
}

// HTTPErrorHandler maps all application and framework errors to standard JSON response envelopes.
func HTTPErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	// Retrieve request ID from Echo context
	reqID, _ := c.Get("request_id").(string)

	var appErr *apperr.AppError
	var echoErr *echo.HTTPError
	var valErrs validator.ValidationErrors

	var status = http.StatusInternalServerError
	var code = "ERR_INTERNAL_SERVER"
	var message = "Internal server error"
	var details []response.ErrorDetail

	switch {
	case errors.As(err, &appErr):
		status = mapErrorCodeToStatus(appErr.Code)
		code = appErr.Code
		message = appErr.Message
		if appErr.Details != nil {
			if d, ok := appErr.Details.([]response.ErrorDetail); ok {
				details = d
			} else {
				details = shortageDetails(appErr)
			}
		}
		if appErr.RequestID != "" {
			reqID = appErr.RequestID
		}
	case errors.As(err, &valErrs):
		// Defense-in-depth: a bare validation error returned from a handler.
		status = http.StatusUnprocessableEntity
		code = "ERR_VALIDATION"
		message = "Invalid request payload"
		details = response.ValidationDetails(valErrs)
	case errors.As(err, &echoErr):
		status = echoErr.Code
		message = fmt.Sprintf("%v", echoErr.Message)
		switch status {
		case http.StatusNotFound:
			code = "ERR_ROUTE_NOT_FOUND"
		case http.StatusMethodNotAllowed:
			code = "ERR_METHOD_NOT_ALLOWED"
		default:
			code = "ERR_HTTP"
		}
	default:
		// Log internal unexpected error
		slog.ErrorContext(c.Request().Context(), "unexpected HTTP handler error", slog.Any("error", err))
	}

	// Write response
	_ = response.Error(c, status, code, message, details, reqID)
}
