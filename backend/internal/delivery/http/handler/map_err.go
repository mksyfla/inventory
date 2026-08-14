package handler

import (
	"errors"
	"net/http"

	"inventory/internal/delivery/http/response"
	"inventory/internal/pkg/apperr"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v4"
)

// writeUsecaseError maps usecase errors to safe response envelopes and returns
// nil (the response is already committed). It never forwards raw err.Error()
// to clients (prevents leaking DB internals).
func writeUsecaseError(c echo.Context, err error, fallbackMsg string) error {
	var appErr *apperr.AppError
	if errors.As(err, &appErr) {
		_ = response.Error(c, apperr.StatusForCode(appErr.Code), appErr.Code, appErr.Message, nil, reqID(c))
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		_ = response.Error(c, http.StatusNotFound, "ERR_NOT_FOUND", fallbackMsg, nil, reqID(c))
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
		_ = response.Error(c, http.StatusConflict, "ERR_DUPLICATE_KEY", "Duplicate key", nil, reqID(c))
		return nil
	}
	_ = response.Error(c, http.StatusInternalServerError, "ERR_INTERNAL", fallbackMsg, nil, reqID(c))
	return nil
}
