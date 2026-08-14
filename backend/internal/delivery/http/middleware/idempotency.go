package middleware

import (
	"net/http"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/idempotency"

	"github.com/labstack/echo/v4"
)

// IdempotencyFilter validates the Idempotency-Key header on POST requests
// (FSD 4.5): when present it must be a UUIDv4. Invalid keys are rejected
// with 422 ERR_VALIDATION before the handler runs, so a malformed key can
// never silently create a second document. The key is stored on
// doc.documents.idempotency_key (UNIQUE) by document usecases.
func IdempotencyFilter() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if c.Request().Method != http.MethodPost {
				return next(c)
			}

			key := c.Request().Header.Get("Idempotency-Key")
			if key != "" && !idempotency.IsValidKey(key) {
				reqID, _ := c.Get("request_id").(string)
				return response.Error(c, http.StatusUnprocessableEntity,
					"ERR_VALIDATION", "Invalid request payload",
					[]response.ErrorDetail{
						{Field: "Idempotency-Key", Message: "must be a valid UUID v4"},
					},
					reqID)
			}
			return next(c)
		}
	}
}
