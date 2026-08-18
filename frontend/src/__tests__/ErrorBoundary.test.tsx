import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

const ProblemChild = () => {
  throw new Error('Simulated Component Failure');
};

describe('ErrorBoundary Component (FE-901)', () => {
  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <div data-testid="normal-child">Safe Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('normal-child')).toBeInTheDocument();
  });

  it('renders fallback error screen when a child component throws an exception', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('btn-reload-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('btn-toggle-details')).toBeInTheDocument();
    expect(screen.getByTestId('btn-retry-boundary')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
