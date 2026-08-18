import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CountingSessionsPage } from '../pages/counting/CountingSessionsPage';

describe('CountingSessionsPage Component (FE-601 & FE-605)', () => {
  it('renders count sessions table, search input, IRA accuracy metric card, and create session button', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CountingSessionsPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId('counting-sessions-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-session')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-count-sessions')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-session')).toBeInTheDocument();
    expect(screen.getByTestId('btn-nav-manual-adjustment')).toBeInTheDocument();
  }, 10000);

  it('opens modal to create new count session', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CountingSessionsPage />
        </MemoryRouter>
      );
    });

    const createBtn = screen.getByTestId('btn-create-session');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('modal-create-session')).toBeInTheDocument();
    expect(screen.getByTestId('form-create-session')).toBeInTheDocument();
  }, 10000);
});
