import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RolesPage } from '../pages/admin/RolesPage';

describe('RolesPage Component (FE-802)', () => {
  it('renders roles table and create role button', async () => {
    await act(async () => {
      render(<RolesPage />);
    });

    expect(screen.getByTestId('roles-page')).toBeInTheDocument();
    expect(screen.getByTestId('table-roles')).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-role')).toBeInTheDocument();
  }, 10000);

  it('opens create role modal form and displays granular permission matrix', async () => {
    await act(async () => {
      render(<RolesPage />);
    });

    const createBtn = screen.getByTestId('btn-create-role');

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(screen.getByTestId('modal-role-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-role')).toBeInTheDocument();
  }, 10000);
});
