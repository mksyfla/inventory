import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { DashboardPage } from '../pages/DashboardPage';
import { reportService } from '../api/services/reports';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/reports', () => ({
  reportService: {
    fsn: vi.fn(),
    valuation: vi.fn(),
    spaceUtilization: vi.fn(),
    dashboardSummary: vi.fn(),
  },
}));

const mockSummary = {
  grn_today: 12,
  do_today: 28,
  req_open: 3,
  do_open: 2,
  below_min_items: 5,
  total_valuation: 7450000000,
};

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

describe('DashboardPage Component (FE-704)', () => {
  beforeEach(() => {
    queryClient.clear();
    (reportService.dashboardSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockSummary);
  });

  it('renders metric cards, quick actions, and report navigation testids', async () => {
    await act(async () => {
      renderWithProviders(<DashboardPage />);
    });

    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getByTestId('btn-quick-grn')).toBeInTheDocument();
    expect(screen.getByTestId('btn-quick-scan')).toBeInTheDocument();
    expect(screen.getByTestId('card-report-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('card-report-fsn')).toBeInTheDocument();
    expect(screen.getByTestId('card-report-space')).toBeInTheDocument();
  }, 10000);

  it('shows dashboard summary values after data loads', async () => {
    await act(async () => {
      renderWithProviders(<DashboardPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Valuasi: Rp 7.450.000.000')).toBeInTheDocument();
  }, 10000);
});
