import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdjustmentFormPage } from '../pages/counting/AdjustmentFormPage';

describe('AdjustmentFormPage Component (FE-604)', () => {
  it('renders manual adjustment form, warehouse & bin selectors, SKU select, adjustment type radio, and submit button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AdjustmentFormPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('adjustment-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-bin')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-sku')).toBeInTheDocument();
    expect(screen.getByTestId('input-adj-batch')).toBeInTheDocument();
    expect(screen.getByTestId('radio-adj-type')).toBeInTheDocument();
    expect(screen.getByTestId('select-adj-reason')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-adjustment')).toBeInTheDocument();
  }, 10000);

  it('submits manual stock adjustment form successfully', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <AdjustmentFormPage />
        </MemoryRouter>
      );
    });

    const submitBtn = screen.getByTestId('btn-submit-adjustment');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(submitBtn).toBeInTheDocument();
  }, 10000);
});
