package docnum

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockStore simulates the atomic doc.document_numbers upsert: each
// (docType, period) pair increments from its current last_seq.
type mockStore struct {
	mu     sync.Mutex
	seqs   map[string]int64
	period string
}

func newMockStore() *mockStore {
	return &mockStore{seqs: map[string]int64{}}
}

func (m *mockStore) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := docType + "/" + period
	m.seqs[key]++
	m.period = period
	return m.seqs[key], nil
}

var aug2026 = time.Date(2026, time.August, 12, 10, 0, 0, 0, time.UTC)

func TestGenerator_Next_FirstNumber(t *testing.T) {
	gen := NewGenerator(newMockStore())

	num, err := gen.Next(context.Background(), "GRN", "JKT01", aug2026)
	require.NoError(t, err)
	assert.Equal(t, "GRN/JKT01/2608/00001", num)
}

func TestGenerator_Next_IncrementsPerPeriod(t *testing.T) {
	store := newMockStore()
	gen := NewGenerator(store)
	ctx := context.Background()

	// Same period, same doc type: sequence increments (BR-04).
	num1, err := gen.Next(ctx, "GRN", "JKT01", aug2026)
	require.NoError(t, err)
	num2, err := gen.Next(ctx, "GRN", "JKT01", aug2026)
	require.NoError(t, err)
	num3, err := gen.Next(ctx, "GRN", "JKT01", aug2026)
	require.NoError(t, err)

	assert.Equal(t, "GRN/JKT01/2608/00001", num1)
	assert.Equal(t, "GRN/JKT01/2608/00002", num2)
	assert.Equal(t, "GRN/JKT01/2608/00003", num3)
	assert.Equal(t, "2608", store.period, "period must come from the same clock as the number")
}

func TestGenerator_Next_SequencesAreIndependentPerDocType(t *testing.T) {
	gen := NewGenerator(newMockStore())
	ctx := context.Background()

	doNum, err := gen.Next(ctx, "DO", "JKT01", aug2026)
	require.NoError(t, err)
	grnNum, err := gen.Next(ctx, "GRN", "JKT01", aug2026)
	require.NoError(t, err)

	assert.Equal(t, "DO/JKT01/2608/00001", doNum)
	assert.Equal(t, "GRN/JKT01/2608/00001", grnNum, "doc types must have independent sequences")
}

func TestGenerator_Next_PeriodRollsOver(t *testing.T) {
	gen := NewGenerator(newMockStore())
	ctx := context.Background()

	augEnd := time.Date(2026, time.August, 31, 23, 59, 0, 0, time.UTC)
	sepStart := time.Date(2026, time.September, 1, 0, 1, 0, 0, time.UTC)

	augNum, err := gen.Next(ctx, "GRN", "JKT01", augEnd)
	require.NoError(t, err)
	sepNum, err := gen.Next(ctx, "GRN", "JKT01", sepStart)
	require.NoError(t, err)

	assert.Equal(t, "GRN/JKT01/2608/00001", augNum)
	assert.Equal(t, "GRN/JKT01/2609/00001", sepNum, "new period must restart the sequence")
}

func TestGenerator_Next_SequencePadding(t *testing.T) {
	store := newMockStore()
	gen := NewGenerator(store)
	ctx := context.Background()

	// Force the sequence past 99999 to prove the number stays readable.
	store.mu.Lock()
	store.seqs["GRN/2608"] = 99999
	store.mu.Unlock()

	num, err := gen.Next(ctx, "GRN", "JKT01", aug2026)
	require.NoError(t, err)
	assert.Equal(t, "GRN/JKT01/2608/100000", num)
}

func TestGenerator_Next_StoreErrorPropagates(t *testing.T) {
	boom := errors.New("connection lost")
	gen := NewGenerator(failingStore{err: boom})

	num, err := gen.Next(context.Background(), "GRN", "JKT01", aug2026)
	require.Error(t, err)
	assert.ErrorIs(t, err, boom)
	assert.Empty(t, num, "no number may be returned when the sequence allocation failed")
}

type failingStore struct{ err error }

func (f failingStore) NextSequence(ctx context.Context, docType, period string) (int64, error) {
	return 0, f.err
}
