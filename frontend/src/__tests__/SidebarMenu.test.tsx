import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SidebarMenu } from '../components/SidebarMenu';

describe('SidebarMenu Component', () => {
  it('renders brand logo and navigation menu when expanded', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <SidebarMenu collapsed={false} />
        </MemoryRouter>
      );
    });

    // Brand logo SIMBAR
    expect(screen.getByTestId('brand-logo')).toBeInTheDocument();
    expect(screen.getByText('SIMBAR')).toBeInTheDocument();

    // Menu container
    expect(screen.getByTestId('sidebar-menu')).toBeInTheDocument();

    // Navigation items
    expect(screen.getByText('Dashboard Operasional')).toBeInTheDocument();
    expect(screen.getByText('Master Data')).toBeInTheDocument();
    expect(screen.getByText('Inbound (Penerimaan)')).toBeInTheDocument();
    expect(screen.getByText('Outbound (Pengeluaran)')).toBeInTheDocument();
  });

  it('hides brand text when collapsed', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <SidebarMenu collapsed={true} />
        </MemoryRouter>
      );
    });

    // SIMBAR text should not be visible when collapsed
    expect(screen.queryByText('SIMBAR')).not.toBeInTheDocument();
  });
});
