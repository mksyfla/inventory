package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/hibiken/asynq"
)

const TypeImportSKU = "import:sku"

// ImportSKUPayload is the task payload for async SKU import jobs.
type ImportSKUPayload struct {
	JobID    string `json:"job_id"`
	Filename string `json:"filename"`
}

// HandleImportSKUTask processes the import:sku background task.
// In production this would re-read the uploaded file from storage, parse it,
// validate and insert rows into the database, and produce a failure report.
func HandleImportSKUTask(ctx context.Context, t *asynq.Task) error {
	var payload ImportSKUPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("worker: failed to unmarshal import payload: %w", err)
	}

	slog.Info("Processing SKU import job",
		slog.String("job_id", payload.JobID),
		slog.String("filename", payload.Filename),
	)

	// TODO (Phase 3 full): re-read file from storage, parse CSV row-by-row,
	// validate against item schema, batch-insert into master.items,
	// and record failed rows to an import_errors table.

	slog.Info("SKU import job completed", slog.String("job_id", payload.JobID))
	return nil
}

// NewServeMux wires all task handlers and returns a ready asynq.ServeMux.
func NewServeMux() *asynq.ServeMux {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeImportSKU, HandleImportSKUTask)
	return mux
}
