import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HeaderBar } from '../components/HeaderBar';
import { useWarehouseStore } from '../store/useWarehouseStore';

describe('HeaderBar Component', () => {
  it('renders correctly with active warehouse and user information', () => {
    const handleToggle = vi.fn();
    render(<HeaderBar collapsed={false} onToggleCollapse={handleToggle} />);

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
    render(<HeaderBar collapsed={false} onToggleCollapse={handleToggle} />);

    const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
    fireEvent.click(toggleBtn);

    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('allows changing the active warehouse context', () => {
    const handleToggle = vi.fn();
    render(<HeaderBar collapsed={false} onToggleCollapse={handleToggle} />);

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
