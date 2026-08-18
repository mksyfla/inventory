import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DeliveryDetailPage } from '../pages/outbound/DeliveryDetailPage';

describe('DeliveryDetailPage Outbound Module', () => {
  it('renders Delivery Order details, customer metadata, and items table', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/1']}>
          <Routes>
            <Route path="/outbound/deliveries/:id" element={<DeliveryDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('delivery-detail-page')).toBeInTheDocument();
    expect(screen.getByText('Surat Jalan DO: DO-2026-08-001')).toBeInTheDocument();
    expect(screen.getByTestId('table-do-items')).toBeInTheDocument();
    expect(screen.getByText('SKU-INK-001')).toBeInTheDocument();
  }, 10000);

  it('triggers FEFO/FIFO stock allocation algorithm on draft DO', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/1']}>
          <Routes>
            <Route path="/outbound/deliveries/:id" element={<DeliveryDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const triggerBtn = screen.getByTestId('btn-action-trigger-allocation');
    expect(triggerBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(triggerBtn);
    });

    // Check that state transitions to allocated and displays batch allocation details
    expect(screen.getByTestId('btn-action-start-picking')).toBeInTheDocument();
    expect(screen.getByText('Batch: LOT-SIC-202608-01')).toBeInTheDocument();
    expect(screen.getByTestId('btn-override-item-0')).toBeInTheDocument();
  }, 10000);

  it('opens OverrideAllocationModal and submits manual allocation adjustment', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/2']}>
          <Routes>
            <Route path="/outbound/deliveries/:id" element={<DeliveryDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const overrideBtn = screen.getByTestId('btn-override-item-0');
    await act(async () => {
      fireEvent.click(overrideBtn);
    });

    expect(screen.getByTestId('modal-override-allocation')).toBeInTheDocument();

    const notesInput = screen.getByTestId('input-override-notes');
    await act(async () => {
      fireEvent.change(notesInput, { target: { value: 'Kemasan kaleng penyok pada batch FEFO rekomendasi' } });
    });

    const submitOverrideBtn = screen.getByTestId('btn-submit-override-allocation');
    await act(async () => {
      fireEvent.click(submitOverrideBtn);
    });

    expect(screen.getByText('Override FEFO')).toBeInTheDocument();
  }, 10000);
});
