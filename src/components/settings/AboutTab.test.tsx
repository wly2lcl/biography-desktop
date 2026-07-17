import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AboutTab from './AboutTab';
import { useGameStore } from '@/store/gameStore';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { recordRequestMetric } from '@/services/requestMetrics';

describe('AboutTab diagnostics', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    recordRequestMetric({
      timestamp: '2026-07-17T00:00:00.000Z',
      provider: 'deepseek',
      model: 'deepseek-chat',
      durationMs: 123,
      inputTokensEstimate: 20,
      outputTokensEstimate: 5,
      attempt: 1,
      status: 'success',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows local usage and exports a privacy-safe diagnostic bundle', async () => {
    const createUrl = vi.fn(() => 'blob:diagnostics');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await act(async () => root.render(<AboutTab />));
    expect(container.textContent).toContain('deepseek / deepseek-chat');
    expect(container.textContent).toContain('123 ms');
    const exportButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('诊断包'));
    await act(async () => exportButton?.click());
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith('blob:diagnostics');
    expect(container.querySelector<HTMLAnchorElement>('a[href*="releases"]')).not.toBeNull();
  });
});
