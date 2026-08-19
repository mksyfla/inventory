import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SettingsPage } from '../pages/admin/SettingsPage';
import { adminService } from '../api/services/admin';
import { queryClient } from '../api/queryClient';

vi.mock('../api/services/admin', () => ({
  adminService: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

const mockSettings = {
  companyName: 'PT Perum Peruri (Persero) - SIMBAR WMS',
  minStockThresholdPct: 15,
  expiryWarningDays: 60,
  sessionTimeoutMinutes: 30,
  valuationMethod: 'FIFO',
  makerCheckerEnabled: true,
};

const renderWithProviders = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

describe('SettingsPage Component (FE-803)', () => {
  beforeEach(() => {
    queryClient.clear();
    (adminService.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue(mockSettings);
    (adminService.updateSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ updated: true });
  });

  it('renders system settings form, thresholds, maker-checker switch, and save button', async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage />);
    });

    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-company')).toBeInTheDocument();
    expect(screen.getByTestId('select-setting-valuation')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-minstock')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-expiry')).toBeInTheDocument();
    expect(screen.getByTestId('input-setting-timeout')).toBeInTheDocument();
    expect(screen.getByTestId('switch-setting-makerchecker')).toBeInTheDocument();
    expect(screen.getByTestId('btn-save-settings')).toBeInTheDocument();

    // Persisted values are loaded into the form.
    await waitFor(() => {
      expect(screen.getByTestId('input-setting-company')).toHaveValue(mockSettings.companyName);
    });
  }, 10000);

  it('submits settings via adminService.updateSettings', async () => {
    await act(async () => {
      renderWithProviders(<SettingsPage />);
    });

    // Wait until the persisted settings have been loaded into the form so the
    // submitted payload matches what the backend returned.
    await waitFor(() => {
      expect(screen.getByTestId('input-setting-company')).toHaveValue(mockSettings.companyName);
    });

    const saveBtn = screen.getByTestId('btn-save-settings');

    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(adminService.updateSettings).toHaveBeenCalledWith(mockSettings);
    });
  }, 10000);
});
