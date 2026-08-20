import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TransfersPage } from '../pages/transfer/TransfersPage';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

const makeMockTRFDoc = (id: number, status = 'in_progress', docNo = `TRF/WH01/2608/0000${id}`) => ({
  id,
  public_id: `trf-${id}`,
  doc_no: docNo,
  doc_type: 'TRF',
  doc_date: '2026-08-16',
  status,
  warehouse_id: 1,
  dest_warehouse_id: 2,
  partner_id: null,
  reason_code: '',
  notes: 'Mutasi persediaan pita cukai reguler',
  created_at: '2026-08-16T09:30:00Z',
  created_by: 3,
  submitted_at: null,
  approved_at: null,
  approved_by: null,
  completed_at: null,
  manager_approved_by: null,
  manager_approved_at: null,
  warehouse_code: 'WH01',
  warehouse_name: 'Gudang Utama Jakarta',
  dest_warehouse_code: 'WH02',
  dest_warehouse_name: 'Gudang Cabang Surabaya',
  partner_code: '',
  partner_name: '',
  ref_doc_no: '',
  line_count: 2,
});

const renderWithProviders = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/transfer']}>
        <Routes>
          <Route path="/transfer" element={<TransfersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('TransfersPage Component (FE-401)', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeMockTRFDoc(1, 'in_progress', 'TRF/WH01/2608/00001'),
      makeMockTRFDoc(2, 'completed', 'TRF/WH01/2608/00002'),
    ]);
  });

  it('renders transfers table, search bar, status filter, and create transfer button', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-view-transfer-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('transfers-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-transfer')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-transfers')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-transfer')).toBeInTheDocument();
    expect(screen.getByText(/TRF\/WH01\/2608\/00002/)).toBeInTheDocument();
    expect(screen.getByText('In-Transit (Dalam Pengiriman)')).toBeInTheDocument();
    expect(screen.getByText('Selesai (Received)')).toBeInTheDocument();
    expect(documentService.list).toHaveBeenCalledWith({ doc_type: 'TRF', limit: 100 });
  }, 10000);

  it('filters transfers table by search query', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-view-transfer-1')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('input-search-transfer');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'TRF/WH01/2608/00002' } });
    });

    expect(screen.getByTestId('btn-view-transfer-2')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-view-transfer-1')).not.toBeInTheDocument();
  }, 10000);
});
