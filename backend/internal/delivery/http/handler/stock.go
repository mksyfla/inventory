package handler

import (
	"net/http"
	"strconv"
	"time"

	"inventory/internal/delivery/http/dto"
	"inventory/internal/delivery/http/response"
	"inventory/internal/domain/stock"
	"inventory/internal/pkg/pagination"
	stockuc "inventory/internal/usecase/stock"

	"github.com/labstack/echo/v4"
)

const (
	stockMovementsDefaultLimit = 50
	stockMovementsMaxLimit     = 100
)

type StockHandler struct {
	uc *stockuc.PostingUsecase
}

func NewStockHandler(uc *stockuc.PostingUsecase) *StockHandler {
	return &StockHandler{uc: uc}
}

// ListMovements handles GET /api/v1/stock/movements.
func (h *StockHandler) ListMovements(c echo.Context) error {
	startTimeStr := c.QueryParam("start_time")
	endTimeStr := c.QueryParam("end_time")

	if startTimeStr == "" || endTimeStr == "" {
		return queryValidationError(c, "start_time/end_time",
			"both start_time and end_time are required (RFC3339)")
	}

	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		return queryValidationError(c, "start_time", "must be RFC3339, e.g. 2026-08-01T00:00:00Z")
	}

	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		return queryValidationError(c, "end_time", "must be RFC3339, e.g. 2026-08-01T00:00:00Z")
	}

	if endTime.Before(startTime) {
		return queryValidationError(c, "end_time", "must be greater than or equal to start_time")
	}

	filter := stock.MovementFilter{
		StartDate: startTime,
		EndDate:   endTime,
		Limit:     stockMovementsDefaultLimit,
	}

	if itemStr := c.QueryParam("item_id"); itemStr != "" {
		id, err := strconv.ParseInt(itemStr, 10, 64)
		if err != nil || id <= 0 {
			return queryValidationError(c, "item_id", "must be a positive integer")
		}
		filter.ItemID = id
	}

	if limitStr := c.QueryParam("limit"); limitStr != "" {
		limit, err := strconv.ParseInt(limitStr, 10, 32)
		if err != nil || limit < 1 || limit > stockMovementsMaxLimit {
			return queryValidationError(c, "limit", "must be an integer between 1 and 100")
		}
		filter.Limit = int(limit)
	}

	if cursorStr := c.QueryParam("cursor"); cursorStr != "" {
		dec, err := pagination.DecodeCursor(cursorStr)
		if err != nil || dec == nil {
			return queryValidationError(c, "cursor", "is not a valid pagination cursor")
		}
		filter.CursorTime = &dec.MovedAt
		filter.CursorID = &dec.ID
	}

	rows, err := h.uc.ListMovements(c.Request().Context(), filter)
	if err != nil {
		return writeUsecaseError(c, err, "Failed to retrieve stock movements")
	}

	var list []dto.StockMovementResponse
	for _, row := range rows {
		var batchID *int64
		if row.BatchID != nil {
			batchID = row.BatchID
		}

		list = append(list, dto.StockMovementResponse{
			ID:           row.ID,
			MovedAt:      row.MovedAt,
			ItemID:       row.ItemID,
			LocationID:   row.LocationID,
			BatchID:      batchID,
			Status:       string(row.Status),
			MovementType: string(row.MovementType),
			Qty:          row.Qty,
			QtyAfter:     row.QtyAfter,
			DocNo:        row.DocNo,
		})
	}

	var nextCursor string
	if len(list) > 0 && len(list) == filter.Limit {
		last := list[len(list)-1]
		nextCursor = pagination.EncodeCursor(last.MovedAt, last.ID)
	}

	return response.Success(c, http.StatusOK, dto.StockMovementListResponse{
		Data:       list,
		NextCursor: nextCursor,
	}, nil)
}
