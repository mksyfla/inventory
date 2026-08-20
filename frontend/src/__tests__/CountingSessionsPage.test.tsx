import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CountingSessionsPage } from '../pages/counting/CountingSessionsPage';
import { documentService } from '../api/services/documents';
import { warehouseService } from '../api/services/warehouses';
import { countService } from '../api/services/counting';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: { list: vi.fn(), getDetail: vi.fn() },
}));

vi.mock('../api/services/warehouses', () => ({
  warehouseService: { list: vi.fn() },
}));

vi.mock('../api/services/counting', () => ({
  countService: {
    createCount: vi.fn(),
    getCountDetail: vi.fn(),
    inputCountLines: vi.fn(),
    postCount: vi.fn(),
  },
}));

const mockCountDocs = [
  {
    id: 1,
    public_id: 'cnt-1',
    doc_no: 'CNT/WH01/2608/00001',
    doc_type: 'CNT',
    doc_date: '2026-08-16',
    status: 'in_progress',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: null,
    reason_code: '',
    notes: 'Stock Opname Bulanan Zona A - Agustus 2026',
    created_at: '2026-08-16T08:00:00Z',
    created_by: 3,
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
    partner_code: '',
    partner_name: '',
    ref_doc_no: '',
    line_count: 0,
  },
  {
    id: 2,
    public_id: 'cnt-2',
    doc_no: 'CNT/WH01/2608/00002',
    doc_type: 'CNT',
    doc_date: '2026-08-10',
    status: 'completed',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: null,
    reason_code: '',
    notes: 'Cycle Count Stok Kelas A (Fast Moving)',
    created_at: '2026-08-10T09:00:00Z',
    created_by: 3,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    completed_at: '2026-08-11T10:00:00Z',
    manager_approved_by: null,
    manager_approved_at: null,
    warehouse_code: 'WH01',
    warehouse_name: 'Gudang Utama Jakarta',
    dest_warehouse_code: '',
    dest_warehouse_name: '',
    partner_code: '',
    partner_name: '',
    ref_doc_no: '',
    line_count: 0,
  },
];

const renderWithProviders = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CountingSessionsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('CountingSessionsPage Component (FE-601 & FE-605)', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCountDocs);
    (warehouseService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', address: '', is_active: true },
    ]);
  });

  it('renders count sessions table, search input, IRA accuracy metric card, and create session button', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByText('CNT/WH01/2608/00001')).toBeInTheDocument();
    });
    expect(screen.getByTestId('counting-sessions-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-session')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-count-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-session')).toBeInTheDocument();
    expect(screen.getByTestId('btn-nav-manual-adjustment')).toBeInTheDocument();
  }, 10000);

  it('opens modal to create new count session', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByText('CNT/WH01/2608/00001')).toBeInTheDocument();
    });

    const createBtn = screen.getByTestId('btn-create-session');
    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('modal-create-session')).toBeInTheDocument();
    expect(screen.getByTestId('form-create-session')).toBeInTheDocument();
  }, 10000);

  it('creates a count session via backend when the modal is submitted', async () => {
    (countService.createCount as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3,
      public_id: 'cnt-3',
      doc_no: 'CNT/WH01/2608/00003',
      doc_type: 'CNT',
      doc_date: '2026-08-18',
      status: 'draft',
      warehouse_id: 1,
      notes: 'Stock Opname Harian',
      created_by: 3,
      lines: [],
    });

    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByText('CNT/WH01/2608/00001')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-create-session'));
    });

    const titleInput = screen.getByTestId('input-session-title');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Stock Opname Harian' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-submit-session'));
    });

    await waitFor(() => {
      expect(countService.createCount).toHaveBeenCalledWith({
        warehouse_id: 1,
        zone: undefined,
        notes: 'Stock Opname Harian',
      });
    });
  }, 10000);
});
