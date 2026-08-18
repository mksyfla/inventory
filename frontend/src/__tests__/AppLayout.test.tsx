import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { DashboardPage } from '../pages/DashboardPage';

describe('AppLayout & Page Integration', () => {
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
      render(<RouterProvider router={memoryRouter} />);
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
