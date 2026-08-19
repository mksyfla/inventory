package document

import "time"

// AttachmentCategory identifies the kind of GRN attachment (doc.attachments
// category column). Values match the frontend attachment type union.
type AttachmentCategory string

const (
	AttachDeliveryNote AttachmentCategory = "delivery_note"
	AttachQCInspection AttachmentCategory = "qc_inspection"
	AttachTruckPhoto   AttachmentCategory = "truck_photo"
	AttachOther        AttachmentCategory = "other"
)

// Attachment is one lampiran (attachment) metadata row bound to a document
// (doc_type GRN). The file bytes are not stored — the row persists the
// reference (FileURL), category and uploader metadata. Persistence lives on
// DocumentRepository (ListAttachments / CreateAttachment / GetAttachmentByID /
// DeleteAttachment).
type Attachment struct {
	ID            int64
	DocumentID    int64
	Category      AttachmentCategory
	FileName      string
	FileSizeBytes int64
	FileURL       string
	UploadedBy    int64
	CreatedAt     time.Time
}
