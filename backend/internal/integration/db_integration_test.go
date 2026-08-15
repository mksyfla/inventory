// Package integration_test runs Fase 10.2 (database integration) and
// Fase 10.3 (concurrency) tests against a real PostgreSQL instance spun up
// with testcontainers. Every migration in db/migrations is applied in order
// via psql inside the container, so the tests exercise the exact production
// schema — constraints, append-only rules and seeded master data included.
//
// These tests require a running Docker daemon. When Docker is unavailable
// they are skipped instead of failing the unit suite.
package integration_test

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"inventory/internal/domain/stock"
	"inventory/internal/pkg/apperr"
	"inventory/internal/pkg/docnum"
	"inventory/internal/repository/postgres"
	inbounduc "inventory/internal/usecase/inbound"
	stockuc "inventory/internal/usecase/stock"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const (
	testDB   = "simbar_test"
	testUser = "postgres"
	testPass = "postgres"
)

type fixture struct {
	t    *testing.T
	pool *pgxpool.Pool
	ctx  context.Context
}

// startDB boots a disposable PostgreSQL container, copies the migrations and
// applies them in order with psql (ON_ERROR_STOP so a broken migration fails
// the test). Returns a ready pool.
func startDB(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()

	container, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase(testDB),
		tcpostgres.WithUsername(testUser),
		tcpostgres.WithPassword(testPass),
	)
	if err != nil {
		t.Skipf("Docker unavailable, skipping DB integration test: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(ctx) })

	// 1. Copy every .up.sql migration into /migrations of the container.
	migs, err := filepath.Glob("../../db/migrations/*.up.sql")
	require.NoError(t, err)
	require.NotEmpty(t, migs, "expected migrations under db/migrations")
	for _, f := range migs {
		dest := "/migrations/" + filepath.Base(f)
		require.NoError(t, container.CopyFileToContainer(ctx, f, dest, 0o644),
			"copy %s", dest)
	}

	// 2. Wait until PostgreSQL actually accepts TCP connections. The
	// testcontainers readiness check can pass slightly before the server is
	// accepting connections on Docker Desktop, so poll pg_isready.
	readyCmd := fmt.Sprintf("PGPASSWORD=%s pg_isready -h localhost -U %s -d %s -t 2",
		testPass, testUser, testDB)
	deadline := time.Now().Add(60 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		code, _, err := container.Exec(ctx, []string{"sh", "-c", readyCmd})
		if err == nil && code == 0 {
			ready = true
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	require.True(t, ready, "postgres did not become ready within 60s")

	// 3. Apply in numeric order. psql (not pgx) runs each file so DO blocks
	// and multi-statement files are handled exactly as the migrate CLI does.
	for _, f := range migs {
		base := filepath.Base(f)
		cmd := fmt.Sprintf("PGPASSWORD=%s psql -h localhost -v ON_ERROR_STOP=1 -U %s -d %s -f /migrations/%s",
			testPass, testUser, testDB, base)
		code, out, err := container.Exec(ctx, []string{"sh", "-c", cmd})
		require.NoError(t, err, "psql exec failed for %s", base)
		require.Equal(t, 0, code, "migration %s failed:\n%s", base, execOutput(t, out))
	}

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	pool, err := pgxpool.New(ctx, connStr)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))

	return &fixture{t: t, pool: pool, ctx: ctx}
}

// execOutput drains an Exec stdout/stderr reader for error messages.
func execOutput(t *testing.T, r io.Reader) string {
	t.Helper()
	b, err := io.ReadAll(r)
	require.NoError(t, err)
	return string(b)
}

// ─── seed helpers ─────────────────────────────────────────────────────────

// id returns the id for a simple lookup query, failing the test on error.
func (f *fixture) id(sql string, args ...any) int64 {
	f.t.Helper()
	var id int64
	require.NoError(f.t, f.pool.QueryRow(f.ctx, sql, args...).Scan(&id))
	return id
}

func (f *fixture) itemID(sku string) int64 {
	return f.id(`SELECT id FROM master.items WHERE sku = $1`, sku)
}

func (f *fixture) whID(code string) int64 {
	return f.id(`SELECT id FROM master.warehouses WHERE code = $1`, code)
}

// locationID returns the first location of the given type in a warehouse.
func (f *fixture) locationID(whID int64, locType string) int64 {
	return f.id(`SELECT l.id FROM master.locations l
		WHERE l.warehouse_id = $1 AND l.loc_type = $2::inv.location_type
		ORDER BY l.id LIMIT 1`, whID, locType)
}

// seedDocumentAndLine inserts an approved GRN header plus one receipt line
// (10 units, base uom) — enough for stock-movement tests.
func (f *fixture) seedDocumentAndLine(docNo string, itemID, whID int64) (int64, int64) {
	f.t.Helper()
	var docID, lineID int64
	require.NoError(f.t, f.pool.QueryRow(f.ctx, `
		INSERT INTO doc.documents (doc_no, doc_type, doc_date, status, warehouse_id, created_by)
		VALUES ($1, 'GRN', CURRENT_DATE, 'approved', $2, 1)
		RETURNING id`, docNo, whID).Scan(&docID))
	require.NoError(f.t, f.pool.QueryRow(f.ctx, `
		INSERT INTO doc.document_lines (document_id, line_no, item_id, uom, conv_factor, qty_request, qty_processed, status)
		VALUES ($1, 1, $2, 'PCS', 1, 10, 10, 'available')
		RETURNING id`, docID, itemID).Scan(&lineID))
	return docID, lineID
}

// ─── 10.2 Uji Integrasi Database ──────────────────────────────────────────

func TestMigrations_AllAppliedAndSeeded(t *testing.T) {
	f := startDB(t)

	// Schema objects from 000001 exist.
	for _, q := range []string{
		`SELECT to_regclass('master.items')`,
		`SELECT to_regclass('inv.stock_balances')`,
		`SELECT to_regclass('inv.stock_movements')`,
		`SELECT to_regclass('doc.documents')`,
		`SELECT to_regclass('sec.users')`,
		`SELECT to_regclass('aud.audit_logs')`,
	} {
		var rel any
		require.NoError(t, f.pool.QueryRow(f.ctx, q).Scan(&rel), "missing relation: %s", q)
		assert.NotNil(t, rel, "relation missing: %s", q)
	}

	// Seeded demo data from 000002/000003 is queryable.
	var wh, items, locs int
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`SELECT count(*) FROM master.warehouses`).Scan(&wh))
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`SELECT count(*) FROM master.items`).Scan(&items))
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`SELECT count(*) FROM master.locations`).Scan(&locs))
	assert.GreaterOrEqual(t, wh, 2)
	assert.GreaterOrEqual(t, items, 10)
	assert.GreaterOrEqual(t, locs, 12)
}

func TestConstraint_ExpiryRequiresBatch(t *testing.T) {
	f := startDB(t)

	// is_expiry=true but is_batch=false → chk_expiry_needs_batch (FSD 4.2).
	_, err := f.pool.Exec(f.ctx, `
		INSERT INTO master.items (sku, name, base_uom, is_batch, is_expiry, created_by)
		VALUES ('IT-X1', 'Invalid expiry item', 'PCS', FALSE, TRUE, 1)`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "chk_expiry_needs_batch")
}

func TestConstraint_OnhandNonNegative(t *testing.T) {
	f := startDB(t)
	itemID := f.itemID("SKU-004") // non-batch item
	locID := f.locationID(f.whID("WH01"), "pick")

	_, err := f.pool.Exec(f.ctx, `
		INSERT INTO inv.stock_balances (item_id, location_id, status, qty_onhand, qty_reserved)
		VALUES ($1, $2, 'available', -1, 0)`, itemID, locID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "chk_onhand_nonneg")
}

func TestConstraint_ReservedWithinOnhand(t *testing.T) {
	f := startDB(t)
	itemID := f.itemID("SKU-004")
	locID := f.locationID(f.whID("WH01"), "pick")

	_, err := f.pool.Exec(f.ctx, `
		INSERT INTO inv.stock_balances (item_id, location_id, status, qty_onhand, qty_reserved)
		VALUES ($1, $2, 'available', 1, 5)`, itemID, locID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "chk_reserved_valid")
}

func TestConstraint_UniqueBalanceKey(t *testing.T) {
	f := startDB(t)
	itemID := f.itemID("SKU-004")
	locID := f.locationID(f.whID("WH01"), "pick")

	// First insert is fine.
	_, err := f.pool.Exec(f.ctx, `
		INSERT INTO inv.stock_balances (item_id, location_id, status, qty_onhand, qty_reserved)
		VALUES ($1, $2, 'available', 10, 0)`, itemID, locID)
	require.NoError(t, err)

	// Second insert with the same (item, location, batch, status) → 23505.
	_, err = f.pool.Exec(f.ctx, `
		INSERT INTO inv.stock_balances (item_id, location_id, status, qty_onhand, qty_reserved)
		VALUES ($1, $2, 'available', 20, 0)`, itemID, locID)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "uq_balance_key")
}

func TestLedger_AppendOnlyRules(t *testing.T) {
	f := startDB(t)
	itemID := f.itemID("SKU-004")
	whID := f.whID("WH01")
	locID := f.locationID(whID, "pick")

	docID, lineID := f.seedDocumentAndLine("IT/LEDGER-1", itemID, whID)
	_, err := f.pool.Exec(f.ctx, `
		INSERT INTO inv.stock_movements (item_id, location_id, status, movement_type, qty, qty_after, doc_line_id, doc_no, created_by)
		VALUES ($1, $2, 'available', 'receipt', 10, 10, $3, $4, 1)`,
		itemID, locID, lineID, "IT/LEDGER-1")
	require.NoError(t, err)

	// UPDATE is swallowed by no_update_movements (INSTEAD NOTHING): no rows
	// affected, no error — the ledger is append-only (FSD 4.1).
	tag, err := f.pool.Exec(f.ctx,
		`UPDATE inv.stock_movements SET qty = 99 WHERE doc_line_id = $1`, lineID)
	require.NoError(t, err)
	assert.Zero(t, tag.RowsAffected(), "UPDATE on movements must be a no-op")

	// DELETE is swallowed by no_delete_movements.
	tag, err = f.pool.Exec(f.ctx,
		`DELETE FROM inv.stock_movements WHERE doc_line_id = $1`, lineID)
	require.NoError(t, err)
	assert.Zero(t, tag.RowsAffected(), "DELETE on movements must be a no-op")

	// The row is still there with its original value.
	var qty, qtyAfter float64
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`SELECT qty, qty_after FROM inv.stock_movements WHERE doc_line_id = $1`, lineID).Scan(&qty, &qtyAfter))
	assert.Equal(t, 10.0, qty)
	assert.Equal(t, 10.0, qtyAfter)
	assert.NotZero(t, docID) // document seeded alongside

	// A second movement is still allowed (inserts are not blocked).
	_, err = f.pool.Exec(f.ctx, `
		INSERT INTO inv.stock_movements (item_id, location_id, status, movement_type, qty, qty_after, doc_line_id, doc_no, created_by)
		VALUES ($1, $2, 'available', 'receipt', 5, 15, $3, $4, 1)`,
		itemID, locID, lineID, "IT/LEDGER-2")
	require.NoError(t, err)
}

func TestMakerChecker_DBConstraint(t *testing.T) {
	f := startDB(t)
	whID := f.whID("WH01")

	_, err := f.pool.Exec(f.ctx, `
		INSERT INTO doc.documents (doc_no, doc_type, doc_date, status, warehouse_id, created_by)
		VALUES ('IT/MC-1', 'GRN', CURRENT_DATE, 'approved', $1, 1)`, whID)
	require.NoError(t, err)

	// Setting approved_by equal to created_by violates chk_maker_checker
	// (BR-05 / FSD 4.3) even when the usecase layer is bypassed.
	_, err = f.pool.Exec(f.ctx,
		`UPDATE doc.documents SET approved_by = created_by WHERE doc_no = 'IT/MC-1'`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "chk_maker_checker")
}

// TestMakerChecker_ReceiptFlowUsecase drives the full GRN lifecycle through
// the real usecase + repository stack: create (maker) → submit →
// approve-by-creator must fail, approve-by-another-user succeeds and posts
// the receipt to the staging balance.
func TestMakerChecker_ReceiptFlowUsecase(t *testing.T) {
	f := startDB(t)
	whID := f.whID("WH01")
	itemID := f.itemID("SKU-001") // batch + expiry managed

	queries := postgres.New(f.pool)
	txRunner := postgres.NewPostgresTxRunner(f.pool)
	stockUC := stockuc.NewPostingUsecase(
		postgres.NewPostgresStockRepository(f.pool), txRunner)
	lookup := postgres.NewInboundLookup(queries)
	docRepo := postgres.NewPostgresDocumentRepository(queries)
	receiptUC := inbounduc.NewReceiptUsecase(
		docRepo, lookup, lookup, lookup, lookup,
		stockUC, txRunner, docnum.NewGenerator(docRepo))

	expiry := time.Now().AddDate(1, 0, 0)
	doc, _, err := receiptUC.Create(f.ctx, inbounduc.CreateInput{
		WarehouseID: whID,
		CreatedBy:   1, // maker
		Lines: []inbounduc.CreateLineInput{{
			ItemID:     itemID,
			Qty:        10,
			Uom:        "PCS",
			BatchNo:    "B-INTEG-01",
			ExpiryDate: &expiry,
			Status:     "available",
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "draft", string(doc.Status))

	require.NoError(t, receiptUC.Submit(f.ctx, doc.ID))

	// Re-read the document from the DB — the in-memory object is the draft.
	var dbStatus string
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`SELECT status::text FROM doc.documents WHERE id = $1`, doc.ID).Scan(&dbStatus))
	assert.Equal(t, "submitted", dbStatus)

	// Maker must not approve their own document (BR-05).
	err = receiptUC.Approve(f.ctx, doc.ID, 1)
	var ap *apperr.AppError
	require.ErrorAs(t, err, &ap)
	assert.Equal(t, "ERR_SELF_APPROVAL", ap.Code)

	// A different user approves → document approved and stock posted.
	require.NoError(t, receiptUC.Approve(f.ctx, doc.ID, 2))

	var onhand float64
	require.NoError(t, f.pool.QueryRow(f.ctx, `
		SELECT b.qty_onhand
		FROM inv.stock_balances b
		JOIN master.locations l ON l.id = b.location_id
		WHERE b.item_id = $1 AND l.loc_type = 'staging'`, itemID).Scan(&onhand))
	assert.Equal(t, 10.0, onhand)

	// The ledger carries exactly one movement for this GRN line.
	var moves int
	require.NoError(t, f.pool.QueryRow(f.ctx, `
		SELECT count(*) FROM inv.stock_movements m
		JOIN doc.document_lines dl ON dl.id = m.doc_line_id
		JOIN doc.documents d ON d.id = dl.document_id
		WHERE d.id = $1`, doc.ID).Scan(&moves))
	assert.Equal(t, 1, moves)
}

// ─── 10.3 Uji Konkurensi ──────────────────────────────────────────────────

// TestConcurrency_50GoroutinesSameSKU posts 50 concurrent movements for the
// same (item, location, status) balance. Each goroutine opens its own
// transaction; PostgreSQL row locks serialize them so the final balance and
// movement count must be exact — no lost updates, no deadlocks.
func TestConcurrency_50GoroutinesSameSKU(t *testing.T) {
	f := startDB(t)
	itemID := f.itemID("SKU-004")
	whID := f.whID("WH01")
	locID := f.locationID(whID, "pick")

	_, lineID := f.seedDocumentAndLine("IT/CNC", itemID, whID)

	txRunner := postgres.NewPostgresTxRunner(f.pool)
	stockUC := stockuc.NewPostingUsecase(
		postgres.NewPostgresStockRepository(f.pool),
		txRunner,
	)

	const n = 50
	var wg sync.WaitGroup
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			// PostStockMovementInTx expects an already-open transaction
			// ("caller owns commit/rollback") — exactly how the production
			// GRN approve flow calls it inside its document transaction.
			err := txRunner.RunInTx(f.ctx, func(ctx context.Context) error {
				return stockUC.PostStockMovementInTx(ctx,
					fmt.Sprintf("IT/CNC/%04d", i),
					[]stock.StockMovementInput{{
						ItemID:       itemID,
						LocationID:   locID,
						Status:       "available",
						MovementType: "receipt",
						Qty:          1,
						DocLineID:    lineID,
						CreatedBy:    1,
					}})
			})
			if err != nil {
				errs <- fmt.Errorf("goroutine %d: %w", i, err)
			}
		}(i)
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Error(err)
	}

	// Exact final balance: no lost update despite 50 concurrent posts.
	var onhand float64
	require.NoError(t, f.pool.QueryRow(f.ctx, `
		SELECT qty_onhand FROM inv.stock_balances
		WHERE item_id = $1 AND location_id = $2 AND status = 'available'`,
		itemID, locID).Scan(&onhand))
	assert.Equal(t, float64(n), onhand)

	// Every movement made it into the append-only ledger.
	var moves int
	require.NoError(t, f.pool.QueryRow(f.ctx,
		`SELECT count(*) FROM inv.stock_movements WHERE doc_line_id = $1`, lineID).Scan(&moves))
	assert.Equal(t, n, moves)

	// And the balance is consistent with the ledger sum.
	var ledSum float64
	require.NoError(t, f.pool.QueryRow(f.ctx, `
		SELECT COALESCE(SUM(qty), 0) FROM inv.stock_movements WHERE doc_line_id = $1`, lineID).Scan(&ledSum))
	assert.Equal(t, float64(n), ledSum)
}
