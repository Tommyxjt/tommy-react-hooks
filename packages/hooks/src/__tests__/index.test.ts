import * as txHooks from '..';

describe('@tx-labs/react-hooks', () => {
  test('exports modules should be defined', () => {
    Object.keys(txHooks).forEach((module) => {
      expect((txHooks as Record<string, any>)[module]).toBeDefined();
    });
  });
});
