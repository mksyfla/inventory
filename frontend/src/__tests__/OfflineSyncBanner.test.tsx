import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OfflineSyncBanner } from '../components/common/OfflineSyncBanner';

describe('OfflineSyncBanner Component (FE-902)', () => {
  it('displays offline alert banner when offline event triggers', async () => {
    render(<OfflineSyncBanner />);

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('alert-offline')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
  });
});
