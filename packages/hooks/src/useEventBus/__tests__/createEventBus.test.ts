import createEventBus from '../hooks/createEventBus';

interface TestEvents {
  ping: number;
  notice: string;
  empty: undefined;
}

describe('createEventBus', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1）应返回具备 EventBus 基本 API 形状的实例（工厂层冒烟测试）
  it('should return an event bus instance with expected methods', () => {
    const bus = createEventBus<TestEvents>();

    expect(typeof bus.on).toBe('function');
    expect(typeof bus.once).toBe('function');
    expect(typeof bus.off).toBe('function');
    expect(typeof bus.emit).toBe('function');
    expect(typeof bus.clear).toBe('function');
    expect(typeof bus.listenerCount).toBe('function');
  });

  // 2）未传 onError 时应使用默认错误处理，并在日志前缀中携带 debugName（若提供）
  it('should use default onError and include debugName in console.error output', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const bus = createEventBus<TestEvents>({ debugName: 'demo-bus' });

    bus.on('ping', () => {
      throw new Error('boom');
    });

    bus.emit('ping', 1);

    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [prefix, eventName, error] = errorSpy.mock.calls[0];
    expect(String(prefix)).toContain('EventBus');
    expect(String(prefix)).toContain('demo-bus');
    expect(eventName).toBe('ping');
    expect(error).toBeInstanceOf(Error);
  });

  // 3）开发环境下，当某事件监听数超过 maxListeners 时应告警（同一事件避免重复刷屏；clear 后允许重新告警）
  it('should warn once per event when listener count exceeds maxListeners in dev mode', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = createEventBus<TestEvents>({
      debugName: 'warn-bus',
      maxListeners: 1,
    });

    const fn1 = jest.fn();
    const fn2 = jest.fn();
    const fn3 = jest.fn();

    bus.on('ping', fn1);
    bus.on('ping', fn2); // 超限，告警
    bus.on('ping', fn3); // 同一 eventName 不应重复刷屏

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('warn-bus');
    expect(bus.listenerCount('ping')).toBe(3);

    // clear 后重新注册，视为新一轮，应允许再次告警
    bus.clear('ping');
    bus.on('ping', fn1);
    bus.on('ping', fn2);

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  // 4）生产环境下不应触发 maxListeners 告警
  it('should not warn maxListeners in production mode', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const bus = createEventBus<TestEvents>({ maxListeners: 1 });

      bus.on('ping', jest.fn());
      bus.on('ping', jest.fn());

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  // 5）maxListeners <= 0 时应视为关闭告警（即使监听器持续增加也不 warn）
  it('should disable maxListeners warning when maxListeners <= 0', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = createEventBus<TestEvents>({ maxListeners: 0 });

    bus.on('ping', jest.fn());
    bus.on('ping', jest.fn());
    bus.on('ping', jest.fn());

    expect(bus.listenerCount('ping')).toBe(3);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
