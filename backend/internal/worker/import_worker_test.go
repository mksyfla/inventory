package worker

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func makeTask(t *testing.T, payload any) *asynq.Task {
	t.Helper()
	data, err := json.Marshal(payload)
	require.NoError(t, err)
	return asynq.NewTask(TypeImportSKU, data)
}

func TestHandleImportSKUTask_Success(t *testing.T) {
	payload := ImportSKUPayload{
		JobID:    "test-job-001",
		Filename: "items.csv",
	}
	task := makeTask(t, payload)
	err := HandleImportSKUTask(context.Background(), task)
	assert.NoError(t, err)
}

func TestHandleImportSKUTask_InvalidPayload(t *testing.T) {
	task := asynq.NewTask(TypeImportSKU, []byte("not-json"))
	err := HandleImportSKUTask(context.Background(), task)
	assert.Error(t, err)
}

func TestNewServeMux(t *testing.T) {
	mux := NewServeMux()
	assert.NotNil(t, mux)
}
