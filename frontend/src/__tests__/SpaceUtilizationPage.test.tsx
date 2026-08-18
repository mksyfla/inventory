import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpaceUtilizationPage } from '../pages/reports/SpaceUtilizationPage';

describe('SpaceUtilizationPage Component (FE-703)', () => {
  it('renders space utilization report page, warehouse cards, and zone occupancy tables', async () => {
    await act(async () => {
      render(<SpaceUtilizationPage />);
    });

    expect(screen.getByTestId('space-utilization-page')).toBeInTheDocument();
    expect(screen.getByTestId('card-warehouse-space-1')).toBeInTheDocument();
    expect(screen.getByTestId('table-zones-space-1')).toBeInTheDocument();
  }, 10000);
});
