// eventBusCore.test.ts
import eventBusCore from '../core/eventBusCore';

interface TestEvents {
  ping: number;
  notice: string;
  empty: undefined;
}

describe('eventBusCore', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1）应创建相互隔离的 core 实例（多实例互不影响）
  it('should create isolated core instances', () => {
    const coreA = eventBusCore<TestEvents>();
    const coreB = eventBusCore<TestEvents>();

    const fnA = jest.fn();
    const fnB = jest.fn();

    coreA.on('ping', fnA);
    coreB.on('ping', fnB);

    coreA.emit('ping', 1);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnA).toHaveBeenCalledWith(1);
    expect(fnB).not.toHaveBeenCalled();

    expect(coreA.listenerCount('ping')).toBe(1);
    expect(coreB.listenerCount('ping')).toBe(1);
  });

  // 2）应支持 on + emit，并且 on 返回的 unsubscribe 可正常取消监听
  it('should support on and emit', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    const unsubscribe = core.on('notice', fn);

    expect(core.listenerCount('notice')).toBe(1);
    expect(core.listenerCount()).toBe(1);

    core.emit('notice', 'hello');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('hello');

    unsubscribe();

    expect(core.listenerCount('notice')).toBe(0);
    expect(core.listenerCount()).toBe(0);
  });

  // 3）同一事件下重复 on 同一个回调应忽略（no-op，不重复注册）
  it('should ignore duplicate on registration for the same callback', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    core.on('ping', fn);
    core.on('ping', fn);

    expect(core.listenerCount('ping')).toBe(1);

    core.emit('ping', 1);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  // 4）应支持 once，并在首次触发后自动移除监听
  it('should support once and auto remove after first emit', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    core.once('notice', fn);

    expect(core.listenerCount('notice')).toBe(1);

    core.emit('notice', 'a');
    core.emit('notice', 'b');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
    expect(core.listenerCount('notice')).toBe(0);
  });

  // 5）同一事件下重复 once 同一个回调应忽略（与 on 语义保持一致）
  it('should ignore duplicate once registration for the same callback', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    core.once('notice', fn);
    core.once('notice', fn);

    expect(core.listenerCount('notice')).toBe(1);

    core.emit('notice', 'hello');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('hello');
    expect(core.listenerCount('notice')).toBe(0);
  });

  // 6）once 返回的 unsubscribe 应支持在触发前取消（触发后不应执行）
  it('should allow unsubscribing a once listener before emit', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    const unsubscribe = core.once('notice', fn);

    expect(core.listenerCount('notice')).toBe(1);

    unsubscribe();

    expect(core.listenerCount('notice')).toBe(0);

    core.emit('notice', 'hello');

    expect(fn).not.toHaveBeenCalled();
  });

  // 7）off(eventName, cb) 应能移除 once（通过原始 cb 取消内部 wrapper）
  it('should allow off(eventName, cb) to remove once listener by original callback', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    core.once('notice', fn);

    expect(core.listenerCount('notice')).toBe(1);

    core.off('notice', fn);

    expect(core.listenerCount('notice')).toBe(0);

    core.emit('notice', 'hello');

    expect(fn).not.toHaveBeenCalled();
  });

  // 8）off(eventName, cb) 应同时移除 on 与 once（同一 cb 在同一事件下）
  it('should remove both on and once listeners when off is called with the same callback', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    core.on('notice', fn);
    core.once('notice', fn);

    expect(core.listenerCount('notice')).toBe(2);

    core.off('notice', fn);

    expect(core.listenerCount('notice')).toBe(0);

    core.emit('notice', 'hello');

    expect(fn).not.toHaveBeenCalled();
  });

  // 9）off 不存在的回调/事件时应安全 no-op（不抛错）
  it('should be safe when off is called for non-existent listener', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    expect(() => {
      core.off('ping', fn);
      core.off('notice', fn);
    }).not.toThrow();

    expect(core.listenerCount()).toBe(0);
  });

  // 10）clear(eventName) 应只清空单个事件；clear() 应清空整个 bus
  it('should support clear(eventName) and clear()', () => {
    const core = eventBusCore<TestEvents>();
    const fnPing = jest.fn();
    const fnNotice = jest.fn();

    core.on('ping', fnPing);
    core.on('notice', fnNotice);

    expect(core.listenerCount()).toBe(2);
    expect(core.listenerCount('ping')).toBe(1);
    expect(core.listenerCount('notice')).toBe(1);

    core.clear('ping');

    expect(core.listenerCount('ping')).toBe(0);
    expect(core.listenerCount('notice')).toBe(1);
    expect(core.listenerCount()).toBe(1);

    core.emit('ping', 1);
    core.emit('notice', 'n1');

    expect(fnPing).not.toHaveBeenCalled();
    expect(fnNotice).toHaveBeenCalledTimes(1);

    core.clear();

    expect(core.listenerCount()).toBe(0);
    expect(core.listenerCount('notice')).toBe(0);
  });

  // 11）listenerCount(eventName?) 应支持按事件统计和总量统计
  it('should support listenerCount by eventName and total', () => {
    const core = eventBusCore<TestEvents>();

    core.on('ping', jest.fn());
    core.on('ping', jest.fn());
    core.on('notice', jest.fn());

    expect(core.listenerCount('ping')).toBe(2);
    expect(core.listenerCount('notice')).toBe(1);
    expect(core.listenerCount()).toBe(3);
  });

  // 12）emit 在没有监听器时应安全 no-op（不抛错）
  it('should be a safe no-op when emitting without listeners', () => {
    const core = eventBusCore<TestEvents>();

    expect(() => {
      core.emit('ping', 1);
      core.emit('notice', 'x');
      core.emit('empty', undefined);
    }).not.toThrow();

    expect(core.listenerCount()).toBe(0);
  });

  // 13）某个 handler 抛错时，不应打断同事件的其他 handler；错误应交给 onError
  it('should isolate handler errors and call custom onError without breaking other handlers', () => {
    const err = new Error('boom');
    const onError = jest.fn();
    const core = eventBusCore<TestEvents>({ onError });

    const okHandler = jest.fn();

    core.on('ping', () => {
      throw err;
    });
    core.on('ping', okHandler);

    core.emit('ping', 123);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        eventName: 'ping',
        payload: 123,
        handler: expect.any(Function),
      }),
    );

    expect(okHandler).toHaveBeenCalledTimes(1);
    expect(okHandler).toHaveBeenCalledWith(123);
  });

  // 14）emit 应使用快照遍历：遍历中新增的监听器不应在本轮立刻执行
  it('should not execute newly added listeners in the same emit cycle', () => {
    const core = eventBusCore<TestEvents>();
    const late = jest.fn();

    const first = jest.fn(() => {
      core.on('ping', late);
    });

    core.on('ping', first);

    core.emit('ping', 1);

    expect(first).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();

    // 下一轮才会执行
    core.emit('ping', 2);

    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith(2);
  });

  // 15）emit 应使用快照遍历：遍历中移除后续监听器，不应影响其在本轮执行
  it('should keep current emit cycle stable when listeners are removed during iteration', () => {
    const core = eventBusCore<TestEvents>();
    const second = jest.fn();

    const first = jest.fn(() => {
      core.off('ping', second);
    });

    core.on('ping', first);
    core.on('ping', second);

    // 因为是快照遍历，second 在本轮仍应执行
    core.emit('ping', 1);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // 下一轮 second 已被移除
    core.emit('ping', 2);

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // 16）once 在回调内部再次 emit 同事件时，不应重复触发（防止重入）
  it('should not re-enter once listener on nested emit', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn((n: number) => {
      if (n === 1) {
        core.emit('ping', 2);
      }
    });

    core.once('ping', fn);

    core.emit('ping', 1);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
    expect(core.listenerCount('ping')).toBe(0);
  });

  // 17）同一回调可在不同事件名下独立注册，off 只应影响指定事件
  it('should keep listeners independent across different event names', () => {
    const core = eventBusCore<TestEvents>();
    const fn = jest.fn();

    core.on('ping', fn as any);
    core.on('notice', fn as any);

    expect(core.listenerCount('ping')).toBe(1);
    expect(core.listenerCount('notice')).toBe(1);
    expect(core.listenerCount()).toBe(2);

    core.off('ping', fn as any);

    expect(core.listenerCount('ping')).toBe(0);
    expect(core.listenerCount('notice')).toBe(1);

    core.emit('notice', 'hello');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('hello');
  });

  // 18）执行顺序应按注册顺序（重复注册忽略不应打乱顺序）
  it('should preserve registration order', () => {
    const core = eventBusCore<TestEvents>();
    const calls: string[] = [];

    const a = jest.fn(() => calls.push('a'));
    const b = jest.fn(() => calls.push('b'));
    const c = jest.fn(() => calls.push('c'));

    core.on('ping', a);
    core.on('ping', b);
    core.on('ping', b); // 重复注册应忽略，不重排
    core.on('ping', c);

    core.emit('ping', 1);

    expect(calls).toEqual(['a', 'b', 'c']);
  });
});
