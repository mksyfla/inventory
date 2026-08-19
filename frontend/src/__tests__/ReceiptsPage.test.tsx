import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReceiptsPage } from '../pages/inbound/ReceiptsPage';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';
import { DocumentSummaryDTO } from '../api/dto';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

const mockGrns: DocumentSummaryDTO[] = [
  {
    id: 1,
    public_id: 'pub-1',
    doc_no: 'GRN/WH01/2608/00001',
    doc_type: 'GRN',
    doc_date: '2026-08-10',
    status: 'completed',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: 1,
    reason_code: '',
    notes: 'PO Ref: PO-2026-0102',
    created_at: '2026-08-10T09:00:00Z',
    created_by: 5,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    completed_at: null,
    manager_approved_by: null,
    manager_approved_at: null,
    warehouse_code: 'WH01',
    warehouse_name: 'Gudang Utama Jakarta',
    dest_warehouse_code: '',
    dest_warehouse_name: '',
    partner_code: 'SUP-001',
    partner_name: 'PT SICPA Perdana Printing Inks',
    ref_doc_no: 'PO-2026-0102',
    line_count: 2,
  },
  {
    id: 2,
    public_id: 'pub-2',
    doc_no: 'GRN/WH01/2608/00002',
    doc_type: 'GRN',
    doc_date: '2026-08-12',
    status: 'submitted',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: 2,
    reason_code: '',
    notes: '',
    created_at: '2026-08-12T14:30:00Z',
    created_by: 1,
    submitted_at: '2026-08-12T14:45:00Z',
    approved_at: null,
    approved_by: null,
    completed_at: null,
    manager_approved_by: null,
    manager_approved_at: null,
    warehouse_code: 'WH01',
    warehouse_name: 'Gudang Utama Jakarta',
    dest_warehouse_code: '',
    dest_warehouse_name: '',
    partner_code: 'SUP-002',
    partner_name: 'PT Pura Barutama (Paper Division)',
    ref_doc_no: 'PO-2026-0108',
    line_count: 1,
  },
];

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/inbound/receipts']}>
        <Routes>
          <Route path="/inbound/receipts" element={<ReceiptsPage />} />
          <Route
            path="/inbound/receipts/:id"
            element={<div data-testid="receipt-detail-page">Detail</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('ReceiptsPage Inbound Module', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockGrns);
  });

  it('renders GRN rows loaded from GET /documents (doc_type=GRN)', async () => {
    await act(async () => {
      renderPage();
    });

    expect(screen.getByTestId('receipts-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-grn')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('GRN/WH01/2608/00001')).toBeInTheDocument();
    });
    expect(screen.getByText('GRN/WH01/2608/00002')).toBeInTheDocument();
    expect(screen.getByText('PT SICPA Perdana Printing Inks')).toBeInTheDocument();
    expect(screen.getByText('PT Pura Barutama (Paper Division)')).toBeInTheDocument();
    expect(documentService.list).toHaveBeenCalledWith({ doc_type: 'GRN' });
  }, 10000);

  it('filters by status and navigates to the GRN detail page', async () => {
    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(screen.getByText('GRN/WH01/2608/00001')).toBeInTheDocument();
    });

    // Filter by status "submitted" — only GRN #2 remains.
    const statusFilter = screen.getByTestId('select-filter-status');
    const selector = statusFilter.querySelector('.ant-select-selector') as Element;
    await act(async () => {
      fireEvent.mouseDown(selector);
    });
    const option = await screen.findByText('Diajukan');
    await act(async () => {
      fireEvent.click(option);
    });

    await waitFor(() => {
      expect(screen.queryByText('GRN/WH01/2608/00001')).not.toBeInTheDocument();
    });
    expect(screen.getByText('GRN/WH01/2608/00002')).toBeInTheDocument();

    // Click the view action on GRN #2.
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-view-grn-2'));
    });
    expect(screen.getByTestId('receipt-detail-page')).toBeInTheDocument();
  }, 10000);
});
