import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '../layouts/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';
import { useAuthStore } from '../store/useAuthStore';
import { MOCK_CURRENT_USER } from '../types/user';
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

describe('AppLayout & Page Integration', () => {
  beforeEach(() => {
    queryClient.clear();
    (reportService.dashboardSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      grn_today: 12,
      do_today: 28,
      req_open: 3,
      do_open: 2,
      below_min_items: 5,
      total_valuation: 7450000000,
    });
    useAuthStore.setState({
      user: MOCK_CURRENT_USER,
      token: 'mock-jwt-token-xyz-12345',
      refreshToken: 'mock-refresh-token-xyz-99999',
      isAuthenticated: true,
    });
  });

  it('renders AppLayout with Sidebar, Header, Breadcrumb, and Dashboard content', async () => {
    const memoryRouter = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppLayout />,
          children: [
            {
              path: 'dashboard',
              element: <DashboardPage />,
            },
          ],
        },
      ],
      { initialEntries: ['/dashboard'] }
    );

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={memoryRouter} />
        </QueryClientProvider>
      );
    });

    // Layout elements
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.getByTestId('header-bar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-sider')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-nav')).toBeInTheDocument();

    // Dashboard page content
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getAllByText(/Dashboard Operasional/).length).toBeGreaterThan(0);
    expect(screen.getByText('Penerimaan Hari Ini (GRN)')).toBeInTheDocument();
  });
});
