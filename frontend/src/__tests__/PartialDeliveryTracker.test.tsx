import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DeliveryDetailPage } from '../pages/outbound/DeliveryDetailPage';

describe('Partial Delivery Tracker (FE-307)', () => {
  it('renders partial delivery alert banner and outstanding quantities table for DO #2', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/outbound/deliveries/2']}>
          <Routes>
            <Route path="/outbound/deliveries/:id" element={<DeliveryDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('alert-partial-delivery')).toBeInTheDocument();
    expect(screen.getByTestId('table-partial-outstanding')).toBeInTheDocument();
    expect(screen.getByText('Terkirim Sebagian (Partial)')).toBeInTheDocument();
  }, 10000);
});
