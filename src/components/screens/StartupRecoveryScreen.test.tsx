import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StartupRecoveryScreen from './StartupRecoveryScreen';

describe('StartupRecoveryScreen', () => {
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

  it('explains data loss and exposes both recovery choices', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const continueTemporarily = vi.fn();
    await act(async () => root.render(
      <StartupRecoveryScreen
        status={{ ready: false, degraded: true, dataDir: '/data', error: 'permission denied' }}
        onOpenDataFolder={open}
        onContinueTemporarily={continueTemporarily}
      />
    ));
    expect(container.textContent).toContain('关闭应用后丢失');
    expect(container.textContent).toContain('permission denied');
    const buttons = [...container.querySelectorAll('button')];
    await act(async () => buttons[0].click());
    await act(async () => buttons[1].click());
    expect(open).toHaveBeenCalledOnce();
    expect(continueTemporarily).toHaveBeenCalledOnce();
  });
});
