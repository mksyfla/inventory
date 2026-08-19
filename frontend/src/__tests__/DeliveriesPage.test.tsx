import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { DeliveriesPage } from '../pages/outbound/DeliveriesPage';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

const mockDeliveries = [
  {
    id: 1,
    public_id: 'do-001-uuid',
    doc_no: 'DO-2026-08-001',
    doc_type: 'DO',
    doc_date: '2026-08-20',
    status: 'draft',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: 21,
    reason_code: '',
    notes: '',
    created_at: '2026-08-14T10:00:00Z',
    created_by: 1,
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
    partner_code: 'KEMLU',
    partner_name: 'Kementerian Luar Negeri RI (Kemlu)',
    ref_doc_no: 'REQ-2026-08-001',
    line_count: 2,
  },
  {
    id: 2,
    public_id: 'do-002-uuid',
    doc_no: 'DO-2026-08-002',
    doc_type: 'DO',
    doc_date: '2026-08-22',
    status: 'in_progress',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: 22,
    reason_code: 'rush_order',
    notes: '',
    created_at: '2026-08-13T16:00:00Z',
    created_by: 1,
    submitted_at: '2026-08-13T16:05:00Z',
    approved_at: '2026-08-14T08:30:00Z',
    approved_by: 5,
    completed_at: null,
    manager_approved_by: null,
    manager_approved_at: null,
    warehouse_code: 'WH01',
    warehouse_name: 'Gudang Utama Jakarta',
    dest_warehouse_code: '',
    dest_warehouse_name: '',
    partner_code: 'DJBC',
    partner_name: 'Direktorat Jenderal Bea dan Cukai (DJBC)',
    ref_doc_no: 'REQ-2026-08-002',
    line_count: 1,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('DeliveriesPage Outbound Module', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockDeliveries);
  });

  it('renders Delivery Orders list table, search bar, and status filter', async () => {
    await act(async () => {
      renderWithProviders(<DeliveriesPage />);
    });

    expect(screen.getByTestId('deliveries-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-do')).toBeInTheDocument();
    expect(screen.getByTestId('select-filter-do-status')).toBeInTheDocument();
    expect(screen.getByTestId('table-deliveries')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('DO-2026-08-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Kementerian Luar Negeri RI (Kemlu)')).toBeInTheDocument();
  }, 10000);

  it('filters delivery list when searching for DO Number', async () => {
    await act(async () => {
      renderWithProviders(<DeliveriesPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('DO-2026-08-002')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('input-search-do');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'DO-2026-08-002' } });
    });

    await waitFor(
      () => {
        expect(screen.getByText('DO-2026-08-002')).toBeInTheDocument();
        expect(screen.queryByText('DO-2026-08-001')).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  }, 10000);
});
