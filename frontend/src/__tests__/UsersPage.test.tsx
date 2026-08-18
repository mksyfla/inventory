import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UsersPage } from '../pages/admin/UsersPage';

describe('UsersPage Component (FE-801)', () => {
  it('renders users table, search input, status filter, and create user button', async () => {
    await act(async () => {
      render(<UsersPage />);
    });

    expect(screen.getByTestId('users-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-users')).toBeInTheDocument();
    expect(screen.getByTestId('select-status-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-users')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-user')).toBeInTheDocument();
  }, 10000);

  it('opens create user modal form on click create button', async () => {
    await act(async () => {
      render(<UsersPage />);
    });

    const createBtn = screen.getByTestId('btn-create-user');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('modal-user-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-user')).toBeInTheDocument();
  }, 10000);
});
