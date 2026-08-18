import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HeaderBar } from '../components/HeaderBar';

import { useWarehouseStore } from '../store/useWarehouseStore';
import { useAuthStore } from '../store/useAuthStore';
import { MOCK_CURRENT_USER } from '../types/user';

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('HeaderBar Component', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: MOCK_CURRENT_USER,
      token: 'mock-jwt-token-xyz-12345',
      refreshToken: 'mock-refresh-token-xyz-99999',
      isAuthenticated: true,
    });
  });

  it('renders correctly with active warehouse and user information', () => {
    const handleToggle = vi.fn();
    renderWithRouter(<HeaderBar collapsed={false} onToggleCollapse={handleToggle} />);

    // Check header exists
    expect(screen.getByTestId('header-bar')).toBeInTheDocument();

    // Check toggle button exists
    expect(screen.getByTestId('sidebar-toggle-btn')).toBeInTheDocument();

    // Check user profile name is displayed
    expect(screen.getByText('Dipo — Inventory Manager')).toBeInTheDocument();

    // Check warehouse select dropdown exists
    expect(screen.getByTestId('warehouse-select')).toBeInTheDocument();
  });

  it('triggers onToggleCollapse when sidebar toggle button is clicked', () => {
    const handleToggle = vi.fn();
    renderWithRouter(<HeaderBar collapsed={false} onToggleCollapse={handleToggle} />);

    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    fireEvent.click(toggleBtn);

    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('allows changing the active warehouse context', () => {
    const handleToggle = vi.fn();
    renderWithRouter(<HeaderBar collapsed={false} onToggleCollapse={handleToggle} />);

    // Initial warehouse is JKT01
    expect(useWarehouseStore.getState().activeWarehouseId).toBe(1);

    // Update active warehouse wrapped in act
    act(() => {
      useWarehouseStore.getState().setActiveWarehouseId(2);
    });

    expect(useWarehouseStore.getState().activeWarehouseId).toBe(2);
    expect(useWarehouseStore.getState().activeWarehouse?.code).toBe('BDG01');
  });
});
