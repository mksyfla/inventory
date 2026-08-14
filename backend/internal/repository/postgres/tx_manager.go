package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TxManager handles safe transaction execution boundaries.
type TxManager interface {
	RunInTx(ctx context.Context, fn func(q Querier) error) error
}

type pgxTxManager struct {
	pool *pgxpool.Pool
}

// NewTxManager creates a new TxManager wrapper around a pgx pool.
func NewTxManager(pool *pgxpool.Pool) TxManager {
	return &pgxTxManager{pool: pool}
}

func (tm *pgxTxManager) RunInTx(ctx context.Context, fn func(q Querier) error) error {
	tx, err := tm.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("tx_manager: failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
	}()

	// sqlc generated New(DBTX) can wrap pgx.Tx directly as it satisfies DBTX.
	q := New(tx)
	if err := fn(q); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("tx_manager: failed to commit transaction: %w", err)
	}

	return nil
}

// ─── Mock TxManager for Unit Testing ─────────────────────────────────────────

type mockTxManager struct {
	q Querier
}

// NewMockTxManager creates a mock TxManager that executes callbacks instantly
// against a mock Querier, without opening real transactions.
func NewMockTxManager(q Querier) TxManager {
	return &mockTxManager{q: q}
}

func (m *mockTxManager) RunInTx(ctx context.Context, fn func(q Querier) error) error {
	return fn(m.q)
}
