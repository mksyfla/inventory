import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RequestsPage } from '../pages/outbound/RequestsPage';
import { documentService } from '../api/services/documents';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/documents', () => ({
  documentService: {
    list: vi.fn(),
    getDetail: vi.fn(),
  },
}));

const mockRequests = [
  {
    id: 1,
    public_id: 'req-001-uuid',
    doc_no: 'REQ-2026-08-001',
    doc_type: 'REQ',
    doc_date: '2026-08-20',
    status: 'submitted',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: 11,
    reason_code: '',
    notes: '',
    created_at: '2026-08-14T08:00:00Z',
    created_by: 2,
    submitted_at: '2026-08-14T08:05:00Z',
    approved_at: null,
    approved_by: null,
    completed_at: null,
    manager_approved_by: null,
    manager_approved_at: null,
    warehouse_code: 'WH01',
    warehouse_name: 'Gudang Utama Jakarta',
    dest_warehouse_code: '',
    dest_warehouse_name: '',
    partner_code: 'DIV-PASPOR',
    partner_name: 'Divisi Cetak Paspor & Dokumen Negara',
    ref_doc_no: '',
    line_count: 2,
  },
  {
    id: 2,
    public_id: 'req-002-uuid',
    doc_no: 'REQ-2026-08-002',
    doc_type: 'REQ',
    doc_date: '2026-08-25',
    status: 'approved',
    warehouse_id: 1,
    dest_warehouse_id: null,
    partner_id: 12,
    reason_code: '',
    notes: '',
    created_at: '2026-08-13T14:20:00Z',
    created_by: 3,
    submitted_at: '2026-08-13T14:25:00Z',
    approved_at: '2026-08-14T09:00:00Z',
    approved_by: 1,
    completed_at: null,
    manager_approved_by: null,
    manager_approved_at: null,
    warehouse_code: 'WH01',
    warehouse_name: 'Gudang Utama Jakarta',
    dest_warehouse_code: '',
    dest_warehouse_name: '',
    partner_code: 'DIV-PITA',
    partner_name: 'Divisi Cetak Pita Cukai & Meterai',
    ref_doc_no: '',
    line_count: 1,
  },
];

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('RequestsPage Outbound Module', () => {
  beforeEach(() => {
    queryClient.clear();
    (documentService.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockRequests);
  });

  it('renders item request list table, search bar, and filter dropdowns', async () => {
    await act(async () => {
      renderWithProviders(<RequestsPage />);
    });

    expect(screen.getByTestId('requests-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-request')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-request')).toBeInTheDocument();
    expect(screen.getByTestId('table-requests')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('REQ-2026-08-001')).toBeInTheDocument();
    });
    expect(screen.getByText('Divisi Cetak Paspor & Dokumen Negara')).toBeInTheDocument();
  }, 10000);

  it('filters item request list when searching by requesting unit', async () => {
    await act(async () => {
      renderWithProviders(<RequestsPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('REQ-2026-08-002')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('input-search-request');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Pita Cukai' } });
    });

    await waitFor(
      () => {
        expect(screen.getByText('REQ-2026-08-002')).toBeInTheDocument();
        expect(screen.queryByText('REQ-2026-08-001')).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  }, 10000);
});
