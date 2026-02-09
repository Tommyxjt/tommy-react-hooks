import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import useDebouncedClick from '../hooks/useDebouncedClick';

jest.useFakeTimers(); // 模拟定时器

function DebouncedClickDemo(props: { onClick: (...args: any[]) => any; delay?: number }) {
  const [debouncedClick, actions] = useDebouncedClick(props.onClick, { delay: props.delay });
  return (
    <div>
      {' '}
      <button data-testid="btn" onClick={() => debouncedClick('arg1', 2)}>
        Click
      </button>{' '}
      <button data-testid="reset" onClick={() => actions.reset()}>
        Reset
      </button>{' '}
      <div data-testid="pending">{String(actions.pending)}</div>{' '}
    </div>
  );
}

// 由于 useDebouncedClick 的场景是按钮点击防抖，因此单测选择还原用户手动操作的场景
describe('useDebouncedClick', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  // 1) 基础行为：第一次点击应立即执行；并进入 pending（防抖期内拦截后续点击）
  it('should call onClick immediately on first click and set pending to true', () => {
    const onClick = jest.fn();
    render(<DebouncedClickDemo onClick={onClick} delay={100} />);

    fireEvent.click(screen.getByTestId('btn')); // 用户第一次点击

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('arg1', 2);

    // 点击后应进入防抖期（pending=true）
    expect(screen.getByTestId('pending').textContent).toBe('true');
  });

  // 2) 防抖期内重复点击：不应再次触发 onClick（防重复点击）
  it('should not call onClick again when clicking repeatedly within the debounce window', () => {
    const onClick = jest.fn();
    render(<DebouncedClickDemo onClick={onClick} delay={100} />);

    fireEvent.click(screen.getByTestId('btn')); // 第一次点击：立即执行
    fireEvent.click(screen.getByTestId('btn')); // 防抖期内第二次点击：应被拦截
    fireEvent.click(screen.getByTestId('btn')); // 防抖期内第三次点击：应被拦截

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pending').textContent).toBe('true');
  });

  // 3) 防抖期结束：pending 应复位为 false；下一次点击应再次生效（回归：pending 不应卡住）
  it('should reset pending to false after delay, and allow next click to work (regression: pending should not stay true)', () => {
    const onClick = jest.fn();
    render(<DebouncedClickDemo onClick={onClick} delay={100} />);

    fireEvent.click(screen.getByTestId('btn')); // 第一次点击
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pending').textContent).toBe('true');

    act(() => {
      jest.advanceTimersByTime(100); // 防抖期结束
    });

    expect(screen.getByTestId('pending').textContent).toBe('false');

    fireEvent.click(screen.getByTestId('btn')); // 防抖期结束后的再次点击：应再次执行
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  // 4) reset：手动重置防抖期（让下一次点击立刻生效）
  it('should allow immediate click after reset() even within the original window', () => {
    const onClick = jest.fn();
    render(<DebouncedClickDemo onClick={onClick} delay={100} />);

    fireEvent.click(screen.getByTestId('btn')); // 第一次点击：立即执行，进入 pending
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pending').textContent).toBe('true');

    fireEvent.click(screen.getByTestId('btn')); // 防抖期内再次点击：被拦截
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('reset')); // 用户点击 Reset（相当于取消本轮防抖期）
    expect(screen.getByTestId('pending').textContent).toBe('false');

    fireEvent.click(screen.getByTestId('btn')); // Reset 后点击：应立刻生效
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  // 5) onClick 更新：应始终调用最新 onClick（useLatestRef 防旧闭包）
  it('should always call the latest onClick after rerender', () => {
    const onClick1 = jest.fn();
    const onClick2 = jest.fn();

    const { rerender } = render(<DebouncedClickDemo onClick={onClick1} delay={100} />);

    fireEvent.click(screen.getByTestId('btn')); // 第一次点击：调用 onClick1
    expect(onClick1).toHaveBeenCalledTimes(1);
    expect(onClick2).toHaveBeenCalledTimes(0);

    // 防抖期内更新 onClick（模拟父组件更新 handler）
    rerender(<DebouncedClickDemo onClick={onClick2} delay={100} />);

    // 先让防抖期结束，确保下一次点击是“新一轮周期”的 leading
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('pending').textContent).toBe('false');

    fireEvent.click(screen.getByTestId('btn')); // 下一次点击：应调用最新 onClick2
    expect(onClick1).toHaveBeenCalledTimes(1);
    expect(onClick2).toHaveBeenCalledTimes(1);
  });
});
