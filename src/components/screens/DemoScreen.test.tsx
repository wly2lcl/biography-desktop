import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DemoScreen from './DemoScreen';
import { useGameStore } from '@/store/gameStore';

describe('DemoScreen', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useGameStore.setState({
      setScreen: vi.fn(),
      setShowSettings: vi.fn(),
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('completes an offline journey without invoking the narrative engine', async () => {
    await act(async () => root.render(<DemoScreen />));
    expect(container.textContent).toContain('不发送任何数据');
    const first = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '赶往听雪楼');
    await act(async () => first?.click());
    const second = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === '相信故人');
    await act(async () => second?.click());
    expect(container.textContent).toContain('未完待续');
    expect(container.textContent).toContain('赶往听雪楼、相信故人');
    const configure = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('配置模型'));
    await act(async () => configure?.click());
    expect(useGameStore.getState().setShowSettings).toHaveBeenCalledWith(true);
  });
});
