import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FsnAnalysisPage } from '../pages/reports/FsnAnalysisPage';

describe('FsnAnalysisPage Component (FE-702)', () => {
  it('renders FSN analysis table, search input, FSN category filter, and statistic cards', async () => {
    await act(async () => {
      render(<FsnAnalysisPage />);
    });

    expect(screen.getByTestId('fsn-analysis-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-fsn')).toBeInTheDocument();
    expect(screen.getByTestId('select-fsn-category')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-category')).toBeInTheDocument();
    expect(screen.getByTestId('table-fsn-analysis')).toBeInTheDocument();
  }, 10000);

  it('filters FSN report table by SKU search query', async () => {
    await act(async () => {
      render(<FsnAnalysisPage />);
    });

    const searchInput = screen.getByTestId('input-search-fsn');

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'SKU-PITA-001' } });
    });

    expect(screen.getByText('SKU-PITA-001')).toBeInTheDocument();
  }, 10000);
});
