import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CountingDetailPage } from '../pages/counting/CountingDetailPage';

describe('CountingDetailPage Component (FE-603)', () => {
  it('renders detail page, status tag, variance warning alert, and reconciliation table for SO #1', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/counting/1']}>
          <Routes>
            <Route path="/counting/:id" element={<CountingDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('counting-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('alert-reconciliation-warning')).toBeInTheDocument();
    expect(screen.getByTestId('table-counting-reconciliation')).toBeInTheDocument();
    expect(screen.getByTestId('btn-post-adjustments')).toBeInTheDocument();
  }, 10000);
});
