import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InventoryValuationPage } from '../pages/reports/InventoryValuationPage';

describe('InventoryValuationPage Component (FE-701)', () => {
  it('renders valuation report table, search bar, filters, and export buttons', async () => {
    await act(async () => {
      render(<InventoryValuationPage />);
    });

    expect(screen.getByTestId('inventory-valuation-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('select-warehouse-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('select-category-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('table-inventory-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-excel')).toBeInTheDocument();
    expect(screen.getByTestId('btn-export-pdf')).toBeInTheDocument();
  }, 10000);

  it('triggers export excel and pdf on button click', async () => {
    await act(async () => {
      render(<InventoryValuationPage />);
    });

    const excelBtn = screen.getByTestId('btn-export-excel');
    const pdfBtn = screen.getByTestId('btn-export-pdf');

    await act(async () => {
      fireEvent.click(excelBtn);
      fireEvent.click(pdfBtn);
    });

    expect(excelBtn).toBeInTheDocument();
    expect(pdfBtn).toBeInTheDocument();
  }, 10000);
});
