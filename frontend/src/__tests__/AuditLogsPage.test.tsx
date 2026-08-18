import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuditLogsPage } from '../pages/admin/AuditLogsPage';

describe('AuditLogsPage Component (FE-503)', () => {
  it('renders audit logs table, search input, and action filter', async () => {
    await act(async () => {
      render(<AuditLogsPage />);
    });

    expect(screen.getByTestId('audit-logs-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-search-audit')).toBeInTheDocument();
    expect(screen.getByTestId('select-action-filter')).toBeInTheDocument();
    expect(screen.getByTestId('table-audit-logs')).toBeInTheDocument();
  }, 10000);

  it('opens side-by-side JSON diff modal when clicking view diff button', async () => {
    await act(async () => {
      render(<AuditLogsPage />);
    });

    const diffBtn = screen.getByTestId('btn-view-diff-1');

    await act(async () => {
      fireEvent.click(diffBtn);
    });

    expect(screen.getByTestId('modal-audit-diff')).toBeInTheDocument();
    expect(screen.getByTestId('json-old-value')).toBeInTheDocument();
    expect(screen.getByTestId('json-new-value')).toBeInTheDocument();
  }, 10000);
});
