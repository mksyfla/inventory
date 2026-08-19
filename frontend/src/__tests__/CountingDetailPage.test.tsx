import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CountingDetailPage } from '../pages/counting/CountingDetailPage';
import { countService } from '../api/services/counting';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/counting', () => ({
  countService: {
    createCount: vi.fn(),
    getCountDetail: vi.fn(),
    inputCountLines: vi.fn(),
    postCount: vi.fn(),
  },
}));

const makeMockCount = (id: number, status = 'in_progress') => ({
  id,
  public_id: `cnt-${id}`,
  doc_no: 'CNT/WH01/2608/00001',
  doc_type: 'CNT',
  doc_date: '2026-08-16',
  status,
  warehouse_id: 1,
  notes: 'Stock Opname Bulanan Zona A - Agustus 2026',
  created_at: '2026-08-16T08:00:00Z',
  created_by: 3,
  warehouse_code: 'WH01',
  warehouse_name: 'Gudang Utama Jakarta',
  lines: [
    {
      id: 101,
      item_id: 1,
      sku: 'SKU-PITA-001',
      item_name: 'Pita Cukai Hasil Tembakau 2026',
      uom: 'RIM',
      location_id: 5,
      location_code: 'JKT01-Z1-R01-B01',
      batch_id: 10,
      batch_no: 'LOT-SIC-202608-01',
      expiry_date: '2027-08-10',
      qty_system: 250,
      qty_counted: 250,
      variance: 0,
      reason_code: '',
      counted_by: 3,
      counted_at: '2026-08-17T10:00:00Z',
    },
    {
      id: 102,
      item_id: 2,
      sku: 'SKU-TINTA-002',
      item_name: 'Tinta Cetak Sekuritas Siklamat Biru',
      uom: 'KG',
      location_id: 6,
      location_code: 'JKT01-Z1-R01-B02',
      batch_id: 11,
      batch_no: 'LOT-PUR-2026-99',
      expiry_date: '2028-08-10',
      qty_system: 80,
      qty_counted: 78,
      variance: -2,
      reason_code: '',
      counted_by: 3,
      counted_at: '2026-08-17T10:05:00Z',
    },
  ],
});

const renderWithProviders = (initialEntry = '/counting/1') =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/counting/:id" element={<CountingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('CountingDetailPage Component (FE-603)', () => {
  beforeEach(() => {
    queryClient.clear();
    (countService.getCountDetail as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockCount(1));
  });

  it('renders detail page, status tag, variance warning alert, and reconciliation table', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-reconciliation-warning')).toBeInTheDocument();
    });
    expect(screen.getByTestId('counting-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-counting-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('btn-post-adjustments')).toBeInTheDocument();
    expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
    expect(screen.getByText('SKU-TINTA-002')).toBeInTheDocument();
    expect(countService.getCountDetail).toHaveBeenCalledWith(1);
  }, 10000);

  it('requires a reason code for variance lines before posting', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-post-adjustments')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-post-adjustments'));
    });

    // No reason selected yet → posting is blocked, backend not called.
    expect(countService.postCount).not.toHaveBeenCalled();
  }, 10000);

  it('posts adjustments via backend after a reason is selected and hides the post button', async () => {
    (countService.postCount as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      status: 'completed',
      total_variance: 2,
      total_variance_value: 0,
      needs_manager_approval: false,
      posted_adjustment_lines: 1,
    });

    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-post-adjustments')).toBeInTheDocument();
    });

    // Variance line is index 1 (line id 102). rc-select opens its dropdown on
    // mousedown of the inner .ant-select-selector.
    const reasonSelect = screen.getByTestId('select-reason-1');
    const selector = reasonSelect.querySelector('.ant-select-selector') as Element;
    await act(async () => {
      fireEvent.mouseDown(selector);
    });
    const reasonOption = await screen.findByText('Barang Rusak (Damaged)');
    await act(async () => {
      fireEvent.click(reasonOption);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-post-adjustments'));
    });

    await waitFor(() => {
      expect(countService.postCount).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('btn-post-adjustments')).not.toBeInTheDocument();
    });
  }, 10000);
});
