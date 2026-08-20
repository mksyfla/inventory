import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { TransferDetailPage } from '../pages/transfer/TransferDetailPage';
import { documentService } from '../api/services/documents';
import { locationService } from '../api/services/locations';
import { transferService } from '../api/services/transfer';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

vi.mock('../api/services/locations', () => ({
  locationService: {
    listLocations: vi.fn(),
    createLocation: vi.fn(),
  },
}));

vi.mock('../api/services/transfer', () => ({
  transferService: {
    createTransfer: vi.fn(),
    submitTransfer: vi.fn(),
    approveTransfer: vi.fn(),
    sendTransfer: vi.fn(),
    receiveTransfer: vi.fn(),
  },
}));

const makeTRFLine = (
  id: number,
  sku: string,
  itemName: string,
  uom: string,
  qtyRequest: number,
  qtyProcessed: number
) => ({
  id,
  document_id: 1,
  line_no: id,
  item_id: id,
  sku,
  item_name: itemName,
  uom,
  conv_factor: 1,
  qty_request: qtyRequest,
  qty_processed: qtyProcessed,
  batch_id: 10,
  location_id: null,
  status: 'sent',
  notes: '',
});

const makeMockTRFDetail = (id: number, status: string) => ({
  id,
  public_id: `trf-${id}`,
  doc_no: `TRF/WH01/2608/0000${id}`,
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
  source_warehouse: { id: 1, code: 'WH01', name: 'Gudang Utama Jakarta', is_active: true },
  dest_warehouse: { id: 2, code: 'WH02', name: 'Gudang Cabang Surabaya', is_active: true },
  lines: [
    makeTRFLine(101, 'SKU-PITA-001', 'Pita Cukai Hasil Tembakau 2026', 'RIM', 50, 0),
    makeTRFLine(102, 'SKU-TINTA-002', 'Tinta Cetak Sekuritas Siklamat Biru', 'KG', 30, 0),
  ],
});

const makeMockLocations = () => [
  { id: 1001, warehouse_id: 2, code: 'DEST-A1', zone: 'Z1', rack: 'R01', level: 'B01', loc_type: 'pick', pick_seq: 1, capacity: null, is_active: true },
  { id: 1002, warehouse_id: 2, code: 'DEST-B1', zone: 'Z1', rack: 'R02', level: 'B01', loc_type: 'pick', pick_seq: 2, capacity: null, is_active: true },
];

const renderWithProviders = (initialEntry = '/transfer/1') =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/transfer/:id" element={<TransferDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('TransferDetailPage Component (FE-402 & FE-403)', () => {
  beforeEach(() => {
    queryClient.clear();
    (locationService.listLocations as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockLocations());
  });

  it('renders transfer detail page, status tag, items table, and confirm transfer in button for an in-transit TRF', async () => {
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTRFDetail(1, 'in_progress'));

    await act(async () => {
      renderWithProviders('/transfer/1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('table-transfer-items')).toBeInTheDocument();
    });
    expect(screen.getByTestId('transfer-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-confirm-transfer-in')).toBeInTheDocument();
    expect(screen.getByText('In-Transit (Dalam Pengiriman)')).toBeInTheDocument();
    expect(screen.getByText(/TRF\/WH01\/2608\/00001/)).toBeInTheDocument();
    expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
    expect(screen.getByText('SKU-TINTA-002')).toBeInTheDocument();
    expect(documentService.getDetail).toHaveBeenCalledWith(1);
    expect(locationService.listLocations).toHaveBeenCalledWith(2);
  }, 10000);

  it('renders discrepancy warning alert and reason textarea for a TRF with variance (FE-403)', async () => {
    const detail = makeMockTRFDetail(2, 'in_progress');
    detail.lines[1].qty_processed = 27; // received 27 of 30 → variance 3
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail);

    await act(async () => {
      renderWithProviders('/transfer/2');
    });

    await waitFor(() => {
      expect(screen.getByTestId('alert-discrepancy-warning')).toBeInTheDocument();
    });
    expect(screen.getByTestId('input-discrepancy-reason')).toBeInTheDocument();
    expect(screen.getByTestId('btn-confirm-transfer-in')).toBeInTheDocument();
  }, 10000);

  it('confirms transfer-in via backend, mapping selected bin codes to location ids and updating status', async () => {
    (documentService.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockTRFDetail(1, 'in_progress'));
    (transferService.receiveTransfer as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      status: 'completed',
      discrepancy: false,
      receipts: [],
    });

    await act(async () => {
      renderWithProviders('/transfer/1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('btn-confirm-transfer-in')).toBeInTheDocument();
    });

    // Pick a target bin for the first line. 'DEST-B1' is not the default
    // (locations[0] is DEST-A1), so the option text is unambiguous in the dropdown.
    const targetBin = screen.getByTestId('select-target-bin-0');
    const selector = targetBin.querySelector('.ant-select-selector') as Element;
    await act(async () => {
      fireEvent.mouseDown(selector);
    });
    const option = await screen.findByText('DEST-B1 (pick)');
    await act(async () => {
      fireEvent.click(option);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-confirm-transfer-in'));
    });

    await waitFor(() => {
      expect(transferService.receiveTransfer).toHaveBeenCalledWith(1, [
        { line_id: 101, qty_received: 50, location_id: 1002, notes: undefined },
        { line_id: 102, qty_received: 30, location_id: 0, notes: undefined },
      ]);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('btn-confirm-transfer-in')).not.toBeInTheDocument();
    });
  }, 10000);
});
