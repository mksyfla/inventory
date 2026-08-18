import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';

describe('ProtectedRoute Component', () => {
  it('renders protected content directly when login check is bypassed', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/dashboard',
          element: (
            <ProtectedRoute>
              <div data-testid="dashboard-screen">Halaman Dashboard</div>
            </ProtectedRoute>
          ),
        },
      ],
      { initialEntries: ['/dashboard'] }
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('dashboard-screen')).toBeInTheDocument();
  });
});
