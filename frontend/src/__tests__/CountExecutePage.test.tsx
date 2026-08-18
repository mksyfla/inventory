import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CountExecutePage } from '../pages/counting/CountExecutePage';

describe('CountExecutePage Component (FE-602 Blind Count)', () => {
  it('renders count execute page, blind count safeguard alert, execution lines table, and submit button for SO #1', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/counting/1/execute']}>
          <Routes>
            <Route path="/counting/:id/execute" element={<CountExecutePage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('count-execute-page')).toBeInTheDocument();
    expect(screen.getByTestId('alert-blind-count-banner')).toBeInTheDocument();
    expect(screen.getByTestId('table-execute-lines')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-count-review')).toBeInTheDocument();
  }, 10000);
});
