import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CountExecutePage } from '../pages/counting/CountExecutePage';
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

// Blind field screen: qty_system is absent from the payload (FR-6.1) and the
// lines are freshly counted (qty_counted: null).
const makeMockBlindCount = (id: number) => ({
  id,
  public_id: `cnt-${id}`,
  doc_no: 'CNT/WH01/2608/00001',
  doc_type: 'CNT',
  doc_date: '2026-08-16',
  status: 'in_progress',
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
      qty_system: null,
      qty_counted: null,
      variance: null,
      reason_code: '',
      counted_by: null,
      counted_at: null,
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
      qty_system: null,
      qty_counted: null,
      variance: null,
      reason_code: '',
      counted_by: null,
      counted_at: null,
    },
  ],
});

const renderWithProviders = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/counting/1/execute']}>
        <Routes>
          <Route path="/counting/:id/execute" element={<CountExecutePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('CountExecutePage Component (FE-602 Blind Count)', () => {
  beforeEach(() => {
    queryClient.clear();
    (countService.getCountDetail as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockBlindCount(1));
  });

  it('renders blind count screen with safeguard banner, items table, and NO Qty Sistem column', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-blind-count-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('count-execute-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-execute-lines')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-count-review')).toBeInTheDocument();
    // Blind Count (FR-6.1): the system quantity column must never render.
    expect(screen.queryByText('Qty Sistem')).not.toBeInTheDocument();
    // blind=true is requested from the backend.
    expect(countService.getCountDetail).toHaveBeenCalledWith(1, true);
  }, 10000);

  it('blocks submission until every line is counted', async () => {
    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-submit-count-review')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-submit-count-review'));
    });

    // Nothing counted yet → backend not called.
    expect(countService.inputCountLines).not.toHaveBeenCalled();
  }, 10000);

  it('submits physical count readings to the backend when all lines are counted', async () => {
    (countService.inputCountLines as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await act(async () => {
      renderWithProviders();
    });

    await waitFor(() => {
      expect(screen.getByTestId('input-qty-counted-0')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-qty-counted-0'), { target: { value: '250' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-qty-counted-1'), { target: { value: '78' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-submit-count-review'));
    });

    await waitFor(() => {
      expect(countService.inputCountLines).toHaveBeenCalledWith(1, [
        { count_line_id: 101, qty_counted: 250 },
        { count_line_id: 102, qty_counted: 78 },
      ]);
    });
  }, 10000);
});
