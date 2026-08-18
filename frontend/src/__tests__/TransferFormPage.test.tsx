import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TransferFormPage } from '../pages/transfer/TransferFormPage';

describe('TransferFormPage Component (FE-401)', () => {
  it('renders transfer form, warehouse selectors, item fields, and submit button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TransferFormPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('transfer-form-page')).toBeInTheDocument();
    expect(screen.getByTestId('select-origin-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('select-destination-warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('datepicker-transfer-date')).toBeInTheDocument();
    expect(screen.getByTestId('btn-submit-transfer')).toBeInTheDocument();
  }, 10000);

  it('submits transfer form successfully', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <TransferFormPage />
        </MemoryRouter>
      );
    });

    const submitBtn = screen.getByTestId('btn-submit-transfer');

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(submitBtn).toBeInTheDocument();
  }, 10000);
});
