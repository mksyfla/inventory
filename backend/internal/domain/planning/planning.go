// Package planning defines the domain entities and repository contract for
// Fase 9 background jobs: expiry alerts (9.2), reorder point calculation
// (9.3), ledger reconciliation (9.4) and partition/report maintenance (9.5).
package planning

import (
	"context"
	"time"
)

// JobName identifies a scheduled background job (FSD §8).
type JobName string

const (
	JobExpiryAlert       JobName = "expiry.alert"
	JobReorderCalc       JobName = "reorder.calc"
	JobLedgerReconcile   JobName = "ledger.reconcile"
	JobPartitionMaintain JobName = "partition.maintain"
	JobReportRefresh     JobName = "report.refresh"
)

// JobRunStatus is the terminal status of a job run.
type JobRunStatus string

const (
	JobRunCompleted JobRunStatus = "completed"
	JobRunFailed    JobRunStatus = "failed"
)

// ExpiryBucket classifies a batch relative to today (FSD §8 expiry.alert).
type ExpiryBucket string

const (
	BucketNear90     ExpiryBucket = "H-90"  // 31..90 hari lagi
	BucketNear30     ExpiryBucket = "H-30"  // 1..30 hari lagi
	BucketExpired    ExpiryBucket = "expired"
	BucketBeyond90   ExpiryBucket = "H-90+" // di luar jendela alert, tidak diproses
)

// ExpiryCandidate is one batch with an expiry date and its sellable stock.
type ExpiryCandidate struct {
	BatchID    int64
	ItemID     int64
	BatchNo    string
	SKU        string
	ItemName   string
	ExpiryDate time.Time
	QtyOnhand  float64
}

// ReorderItem is one item with its 90-day outflow usage and reorder inputs
// (FR-8.2 / FSD §4.6).
type ReorderItem struct {
	ItemID        int64
	SKU           string
	Name          string
	AvgDailyUsage float64 // SUM(qty keluar 90 hari) / 90
	LeadTimeDays  int
	SafetyStock   float64
	QtyAvailable  float64 // total qty_onhand status available
}

// ReorderSuggestion is the computed reorder point record for one item
// (inv.replenishment_suggestions).
type ReorderSuggestion struct {
	ItemID        int64
	AvgDailyUsage float64
	LeadTimeDays  int
	SafetyStock   float64
	ROP           float64
	QtyAvailable  float64
	SuggestedQty  float64
	Status        string // pending | notified
}

// BalanceTotal is one stock-balance key with its ledger sum and on-hand
// value, used by ledger.reconcile (§4.7).
type BalanceTotal struct {
	ItemID     int64
	LocationID int64
	BatchID    *int64
	Status     string
	LedgerSum  float64 // SUM(qty) dari inv.stock_movements
	QtyOnhand  float64 // nilai saldo di inv.stock_balances
}

// PartitionSpec describes the next month partition to create (9.5).
type PartitionSpec struct {
	Name  string    // inv.stock_movements_202609
	Start time.Time // 2026-09-01 00:00
	End   time.Time // 2026-10-01 00:00
}

// JobRunResult is the outcome recorded in aud.job_runs.
type JobRunResult struct {
	ID             int64
	JobName        JobName
	ItemsProcessed int
	Detail         string
	Status         JobRunStatus
}

// Repository is the persistence contract for all Fase 9 jobs.
type Repository interface {
	// Expiry alert (9.2)
	GetExpiryCandidates(ctx context.Context) ([]ExpiryCandidate, error)
	// MarkBatchQuarantined moves all available stock of an expired batch to
	// status quarantine (balancing any existing quarantine row atomically).
	MarkBatchQuarantined(ctx context.Context, batchID int64) error

	// Reorder calc (9.3, FR-8.2)
	GetReorderItems(ctx context.Context, since time.Time) ([]ReorderItem, error)
	UpsertReplenishmentSuggestion(ctx context.Context, s *ReorderSuggestion) error

	// Ledger reconcile (9.4, §4.7)
	// GetBalanceTotals returns the current qty_onhand per balance key.
	GetBalanceTotals(ctx context.Context) ([]BalanceTotal, error)
	// GetLedgerTotals returns SUM(qty) per balance key from stock_movements.
	GetLedgerTotals(ctx context.Context) ([]BalanceTotal, error)

	// Maintenance (9.5)
	CreatePartition(ctx context.Context, spec PartitionSpec) error
	RefreshMaterializedViews(ctx context.Context, names []string) error

	// Job-run audit trail (9.1)
	StartJobRun(ctx context.Context, name JobName) (int64, error)
	FinishJobRun(ctx context.Context, id int64, res JobRunResult) error
}
