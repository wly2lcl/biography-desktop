import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorModal from './ErrorModal';

describe('ErrorModal retry boundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not render a fake retry action', async () => {
    await act(async () => root.render(
      <ErrorModal message="failed" onClose={vi.fn()} />
    ));
    expect(container.textContent).not.toContain('重试');
  });

  it('runs the provided retry action', async () => {
    const retry = vi.fn();
    await act(async () => root.render(
      <ErrorModal message="failed" onClose={vi.fn()} onRetry={retry} />
    ));
    const button = [...container.querySelectorAll('button')]
      .find((candidate) => candidate.textContent === '重试');
    await act(async () => button?.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
