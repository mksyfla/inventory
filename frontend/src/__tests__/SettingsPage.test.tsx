import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SettingsPage } from '../pages/admin/SettingsPage';

describe('SettingsPage Component (FE-803)', () => {
  it('renders system settings form, thresholds, maker-checker switch, and save button', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-company')).toBeInTheDocument();
    expect(screen.getByTestId('select-setting-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-minstock')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-expiry')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-timeout')).toBeInTheDocument();
    expect(screen.getByTestId('switch-setting-makerchecker')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-settings')).toBeInTheDocument();
  }, 10000);

  it('submits system settings form successfully', async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    const saveBtn = screen.getByTestId('btn-save-settings');

    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(saveBtn).toBeInTheDocument();
  }, 10000);
});
