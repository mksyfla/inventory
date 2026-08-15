package postgres

import (
	"context"
	"fmt"

	"inventory/internal/domain/stock"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type txKey struct{}

// docLineIDParam builds a pgtype.Int8 parameter for stock_movements.doc_line_id.
// 0 means "no document line" (adjustment/count movements, Fase 8.4/8.5) and is
// stored as NULL since the column is nullable.
func docLineIDParam(id int64) pgtype.Int8 {
	if id <= 0 {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: id, Valid: true}
}

// docLineIDValue converts a nullable doc_line_id result back into the domain
// int64 (0 = no line).
func docLineIDValue(v pgtype.Int8) int64 {
	if !v.Valid {
		return 0
	}
	return v.Int64
}

// GetTx extracts the active pgx transaction from the context if present.
func GetTx(ctx context.Context) pgx.Tx {
	tx, _ := ctx.Value(txKey{}).(pgx.Tx)
	return tx
}

type PostgresTxRunner struct {
	pool *pgxpool.Pool
}

func NewPostgresTxRunner(pool *pgxpool.Pool) stock.TxRunner {
	return &PostgresTxRunner{pool: pool}
}

func (r *PostgresTxRunner) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("postgres: failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
	}()

	txCtx := context.WithValue(ctx, txKey{}, tx)
	if err := fn(txCtx); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("postgres: failed to commit transaction: %w", err)
	}

	return nil
}

// ─── StockRepository Implementation ──────────────────────────────────────────

type PostgresStockRepository struct {
	queries *Queries
}

func NewPostgresStockRepository(db DBTX) stock.StockRepository {
	return &PostgresStockRepository{
		queries: New(db),
	}
}

func (r *PostgresStockRepository) getQuerier(ctx context.Context) Querier {
	if tx := GetTx(ctx); tx != nil {
		return r.queries.WithTx(tx)
	}
	return r.queries
}

func (r *PostgresStockRepository) GetBalancesForUpdate(ctx context.Context, keys []stock.BalanceKey) ([]*stock.StockBalance, error) {
	q := r.getQuerier(ctx)
	var list []*stock.StockBalance

	for _, k := range keys {
		var batchID pgtype.Int8
		if k.BatchID != nil {
			batchID = pgtype.Int8{Int64: *k.BatchID, Valid: true}
		}

		// Materialize a zeroed row when the balance does not exist yet, so the
		// FOR UPDATE below really locks it. Otherwise concurrent postings for
		// a brand-new balance all read "0" and later overwrite each other
		// (lost update — see integration test TestConcurrency_50GoroutinesSameSKU).
		if err := q.EnsureBalanceExists(ctx, EnsureBalanceExistsParams{
			ItemID:     k.ItemID,
			LocationID: k.LocationID,
			BatchID:    batchID,
			Status:     k.Status,
		}); err != nil {
			return nil, fmt.Errorf("postgres: failed to materialize balance: %w", err)
		}

		row, err := q.GetStockBalanceForUpdate(ctx, GetStockBalanceForUpdateParams{
			ItemID:     k.ItemID,
			LocationID: k.LocationID,
			BatchID:    batchID,
			Status:     k.Status, // interface{} type in SQLC
		})
		if err != nil {
			if err == pgx.ErrNoRows {
				continue // not found balance is fine, usecase will initialize it to 0
			}
			return nil, fmt.Errorf("postgres: failed to lock balance: %w", err)
		}

		qty, _ := row.QtyOnhand.Float64Value()
		resQty, _ := row.QtyReserved.Float64Value()

		var bID *int64
		if row.BatchID.Valid {
			bID = &row.BatchID.Int64
		}

		statusStr := ""
		if s, ok := row.Status.(string); ok {
			statusStr = s
		} else if b, ok := row.Status.([]byte); ok {
			statusStr = string(b)
		}

		list = append(list, &stock.StockBalance{
			ID:          row.ID,
			ItemID:      row.ItemID,
			LocationID:  row.LocationID,
			BatchID:     bID,
			Status:      stock.StockStatus(statusStr),
			QtyOnhand:   qty.Float64,
			QtyReserved: resQty.Float64,
			UpdatedAt:   row.UpdatedAt.Time,
		})
	}

	return list, nil
}

func (r *PostgresStockRepository) UpsertBalance(ctx context.Context, b *stock.StockBalance) error {
	q := r.getQuerier(ctx)

	var batchID pgtype.Int8
	if b.BatchID != nil {
		batchID = pgtype.Int8{Int64: *b.BatchID, Valid: true}
	}

	var qty, resQty pgtype.Numeric
	_ = qty.Scan(fmt.Sprintf("%f", b.QtyOnhand))
	_ = resQty.Scan(fmt.Sprintf("%f", b.QtyReserved))

	err := q.UpsertStockBalanceFull(ctx, UpsertStockBalanceFullParams{
		ItemID:      b.ItemID,
		LocationID:  b.LocationID,
		BatchID:     batchID,
		Status:      b.Status, // interface{}
		QtyOnhand:   qty,
		QtyReserved: resQty,
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to upsert balance: %w", err)
	}

	return nil
}

func (r *PostgresStockRepository) InsertMovement(ctx context.Context, m *stock.StockMovement) error {
	q := r.getQuerier(ctx)

	var batchID pgtype.Int8
	if m.BatchID != nil {
		batchID = pgtype.Int8{Int64: *m.BatchID, Valid: true}
	}

	var qty, qtyAfter pgtype.Numeric
	_ = qty.Scan(fmt.Sprintf("%f", m.Qty))
	_ = qtyAfter.Scan(fmt.Sprintf("%f", m.QtyAfter))

	err := q.InsertStockMovement(ctx, InsertStockMovementParams{
		ItemID:       m.ItemID,
		LocationID:   m.LocationID,
		BatchID:      batchID,
		Status:       m.Status,       // interface{}
		MovementType: m.MovementType, // interface{}
		Qty:          qty,
		QtyAfter:     qtyAfter,
		DocLineID:    docLineIDParam(m.DocLineID),
		DocNo:        m.DocNo,
		CreatedBy:    m.CreatedBy,
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to insert movement: %w", err)
	}

	return nil
}

func (r *PostgresStockRepository) UpdateBalanceReserved(ctx context.Context, id int64, delta float64) error {
	q := r.getQuerier(ctx)
	var d pgtype.Numeric
	_ = d.Scan(fmt.Sprintf("%f", delta))

	err := q.UpdateBalanceReserved(ctx, UpdateBalanceReservedParams{
		ID:          id,
		QtyReserved: d,
	})
	if err != nil {
		return fmt.Errorf("postgres: failed to update balance reserved: %w", err)
	}
	return nil
}

func (r *PostgresStockRepository) GetMovements(ctx context.Context, f stock.MovementFilter) ([]*stock.StockMovement, error) {
	q := r.getQuerier(ctx)

	var hasCursor bool
	var cursorTime pgtype.Timestamptz
	var cursorID int64

	if f.CursorTime != nil && f.CursorID != nil {
		hasCursor = true
		cursorTime = pgtype.Timestamptz{Time: *f.CursorTime, Valid: true}
		cursorID = *f.CursorID
	}

	rows, err := q.ListStockMovementsKeyset(ctx, ListStockMovementsKeysetParams{
		MovedAt:   pgtype.Timestamptz{Time: f.StartDate, Valid: true},
		MovedAt_2: pgtype.Timestamptz{Time: f.EndDate, Valid: true},
		Column3:   f.ItemID,
		Column4:   0,
		Column5:   hasCursor,
		Column6:   cursorTime,
		Column7:   cursorID,
		Limit:     int32(f.Limit),
	})
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to retrieve movements: %w", err)
	}

	var result []*stock.StockMovement
	for _, row := range rows {
		qty, _ := row.Qty.Float64Value()
		qtyAfter, _ := row.QtyAfter.Float64Value()

		var bID *int64
		if row.BatchID.Valid {
			bID = &row.BatchID.Int64
		}

		statusStr := ""
		if s, ok := row.Status.(string); ok {
			statusStr = s
		} else if b, ok := row.Status.([]byte); ok {
			statusStr = string(b)
		}

		moveStr := ""
		if s, ok := row.MovementType.(string); ok {
			moveStr = s
		} else if b, ok := row.MovementType.([]byte); ok {
			moveStr = string(b)
		}

		var unitCost *float64

		result = append(result, &stock.StockMovement{
			ID:           row.ID,
			MovedAt:      row.MovedAt.Time,
			ItemID:       row.ItemID,
			LocationID:   row.LocationID,
			BatchID:      bID,
			Status:       stock.StockStatus(statusStr),
			MovementType: stock.MovementType(moveStr),
			Qty:          qty.Float64,
			QtyAfter:     qtyAfter.Float64,
			UnitCost:     unitCost,
			DocLineID:    docLineIDValue(row.DocLineID),
			DocNo:        row.DocNo,
			CreatedBy:    row.CreatedBy,
		})
	}

	return result, nil
}
