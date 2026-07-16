import { renderHook, act } from '@testing-library/react';

import { BaseNotifier, UseNotifierHook } from './base';

interface TestState {
    count: number;
    name: string;
}

class TestNotifier extends BaseNotifier<TestState> {
    increment (): void {
        this.updateState({ count: this.state.count + 1 });
    }

    setName (name: string): void {
        this.updateState({ name });
    }

    getCount (): number {
        return this.state.count;
    }

    setState (state: TestState): void {
        this.state = state;
    }

    getServerState (): TestState {
        return this.serverState;
    }

    setServerState (state: TestState): void {
        this.serverState = state;
    }

    _privateMethod (): void {
        return;
    }
}

describe('BaseNotifier', () => {
    describe('constructor', () => {
        it('should create instance with initial state', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });

            expect(notifier.getCount()).toBe(0);
        });

        it('should throw error for primitive state', () => {
            expect(() => new (BaseNotifier as any)(123)).toThrow(
                'Notifier state must be a non-null object',
            );
        });

        it('should throw error for null state', () => {
            expect(() => new (BaseNotifier as any)(null)).toThrow(
                'Notifier state must be a non-null object',
            );
        });

        it('should throw error for array state', () => {
            expect(() => new (BaseNotifier as any)([1, 2, 3])).toThrow(
                'Notifier state must be a non-null object',
            );
        });

        it('should throw error for string state', () => {
            expect(() => new (BaseNotifier as any)('hello')).toThrow(
                'Notifier state must be a non-null object',
            );
        });
    });

    describe('state management', () => {
        it('should return current state via getter', () => {
            const notifier = new TestNotifier({ count: 5, name: 'test' });

            expect(notifier.getCount()).toBe(5);
        });

        it('should update state and publish', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const subscriber = jest.fn();

            notifier.subscribe(subscriber);
            notifier.setState({ count: 10, name: 'updated' });

            expect(subscriber).toHaveBeenCalledWith({ count: 10, name: 'updated' });
        });

        it('should merge partial state with updateState', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const subscriber = jest.fn();

            notifier.subscribe(subscriber);
            notifier.increment();

            expect(subscriber).toHaveBeenCalledWith({ count: 1, name: 'test' });
        });
    });

    describe('serverState', () => {
        it('should return initial state when serverState is not set', () => {
            const notifier = new TestNotifier({ count: 0, name: 'initial' });

            expect(notifier.getServerState()).toEqual({ count: 0, name: 'initial' });
        });

        it('should set serverState only once', () => {
            const notifier = new TestNotifier({ count: 0, name: 'initial' });

            notifier.setServerState({ count: 5, name: 'server' });
            expect(notifier.getServerState()).toEqual({ count: 5, name: 'server' });

            notifier.setServerState({ count: 10, name: 'second' });
            expect(notifier.getServerState()).toEqual({ count: 5, name: 'server' });
        });

        it('should also update client state when setting serverState', () => {
            const notifier = new TestNotifier({ count: 0, name: 'initial' });

            notifier.setServerState({ count: 5, name: 'server' });
            expect(notifier.getCount()).toBe(5);
        });
    });

    describe('reset', () => {
        it('should restore initial state', () => {
            const notifier = new TestNotifier({ count: 0, name: 'initial' });

            notifier.increment();
            notifier.increment();
            expect(notifier.getCount()).toBe(2);

            notifier.reset();
            expect(notifier.getCount()).toBe(0);
        });

        it('should notify subscribers on reset', () => {
            const notifier = new TestNotifier({ count: 0, name: 'initial' });
            const subscriber = jest.fn();

            notifier.increment();
            notifier.subscribe(subscriber);
            notifier.reset();

            expect(subscriber).toHaveBeenCalledWith({ count: 0, name: 'initial' });
        });
    });

    describe('subscribe', () => {
        it('should receive state updates', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const subscriber = jest.fn();

            notifier.subscribe(subscriber);
            notifier.increment();
            notifier.increment();

            expect(subscriber).toHaveBeenCalledTimes(2);
            expect(subscriber).toHaveBeenLastCalledWith({ count: 2, name: 'test' });
        });

        it('should stop receiving updates after unsubscribe', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const subscriber = jest.fn();

            const unsubscribe = notifier.subscribe(subscriber);

            notifier.increment();
            expect(subscriber).toHaveBeenCalledTimes(1);

            unsubscribe();
            notifier.increment();
            expect(subscriber).toHaveBeenCalledTimes(1);
        });

        it('should run first and last subscriber lifecycle hooks once per active group', () => {
            class LifecycleNotifier extends TestNotifier {
                readonly first = jest.fn();

                readonly last = jest.fn();

                protected onFirstSubscriber (): void {
                    this.first();
                }

                protected onLastSubscriber (): void {
                    this.last();
                }
            }

            const notifier = new LifecycleNotifier({ count: 0, name: 'test' });
            const unsubscribeFirst = notifier.subscribe(jest.fn());
            const unsubscribeSecond = notifier.subscribe(jest.fn());

            expect(notifier.first).toHaveBeenCalledTimes(1);

            unsubscribeFirst();
            unsubscribeFirst();
            expect(notifier.last).not.toHaveBeenCalled();

            unsubscribeSecond();
            expect(notifier.last).toHaveBeenCalledTimes(1);

            const unsubscribeThird = notifier.subscribe(jest.fn());
            expect(notifier.first).toHaveBeenCalledTimes(2);
            unsubscribeThird();
            expect(notifier.last).toHaveBeenCalledTimes(2);
        });

        it('should use lifecycle-aware subscriptions from generated React hooks', () => {
            class LifecycleNotifier extends TestNotifier {
                readonly first = jest.fn();

                readonly last = jest.fn();

                protected onFirstSubscriber (): void {
                    this.first();
                }

                protected onLastSubscriber (): void {
                    this.last();
                }
            }

            const notifier = new LifecycleNotifier({ count: 0, name: 'test' });
            const useState = notifier.createStateHook();
            const { unmount } = renderHook(() => useState());

            expect(notifier.first).toHaveBeenCalledTimes(1);

            unmount();
            expect(notifier.last).toHaveBeenCalledTimes(1);
        });
    });

    describe('createStateHook', () => {
        it('should return hook function', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestState = notifier.createStateHook();

            expect(typeof useTestState).toBe('function');
        });

        it('should return state without selector', () => {
            const notifier = new TestNotifier({ count: 5, name: 'test' });
            const useTestState = notifier.createStateHook();

            const { result } = renderHook(() => useTestState());

            expect(result.current).toEqual({ count: 5, name: 'test' });
        });

        it('should apply selector function', () => {
            const notifier = new TestNotifier({ count: 5, name: 'test' });
            const useTestState = notifier.createStateHook();

            const { result } = renderHook(() => useTestState((s) => s.count));

            expect(result.current).toBe(5);
        });

        it('should update when state changes', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestState = notifier.createStateHook();

            const { result } = renderHook(() => useTestState((s) => s.count));

            expect(result.current).toBe(0);

            act(() => {
                notifier.increment();
            });

            expect(result.current).toBe(1);
        });

        it('should not re-render when selected value is unchanged', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestState = notifier.createStateHook();
            let renderCount = 0;

            const { result } = renderHook(() => {
                renderCount++;

                return useTestState((s) => s.count);
            });

            expect(result.current).toBe(0);
            const initialRenderCount = renderCount;

            act(() => {
                notifier.setName('new name');
            });

            expect(renderCount).toBe(initialRenderCount);
            expect(result.current).toBe(0);
        });

        it('should handle selector updates', () => {
            const notifier = new TestNotifier({ count: 5, name: 'test' });
            const useTestState = notifier.createStateHook();

            const { result, rerender } = renderHook(
                ({ multiplier }) => useTestState((s) => s.count * multiplier),
                { initialProps: { multiplier: 1 } },
            );

            expect(result.current).toBe(5);

            rerender({ multiplier: 2 });

            act(() => {
                notifier.increment();
            });

            expect(result.current).toBe(12);
        });

        it('should use deep comparison for objects', () => {
            interface NestedState {
                data: { value: number };
            }

            class NestedNotifier extends BaseNotifier<NestedState> {
                setData (data: { value: number }): void {
                    this.updateState({ data });
                }
            }

            const notifier = new NestedNotifier({ data: { value: 1 } });
            const useNestedState = notifier.createStateHook();
            let renderCount = 0;

            renderHook(() => {
                renderCount++;

                return useNestedState((s) => s.data);
            });

            const initialRenderCount = renderCount;

            act(() => {
                notifier.setData({ value: 1 });
            });

            expect(renderCount).toBe(initialRenderCount);
        });
    });

    describe('createActionsHook', () => {
        it('should return hook function', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestActions = notifier.createActionsHook();

            expect(typeof useTestActions).toBe('function');
        });

        it('should return public methods', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestActions = notifier.createActionsHook();

            const { result } = renderHook(() => useTestActions());

            expect(typeof result.current.increment).toBe('function');
            expect(typeof result.current.setName).toBe('function');
            expect(typeof result.current.getCount).toBe('function');
        });

        it('should not expose base class methods', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestActions = notifier.createActionsHook();

            const { result } = renderHook(() => useTestActions());

            expect((result.current as any).reset).toBeUndefined();
            expect((result.current as any).subscribe).toBeUndefined();
            expect((result.current as any).createStateHook).toBeUndefined();
            expect((result.current as any).createActionsHook).toBeUndefined();
            expect((result.current as any).updateState).toBeUndefined();
            expect((result.current as any).onFirstSubscriber).toBeUndefined();
            expect((result.current as any).onLastSubscriber).toBeUndefined();
        });

        it('should not expose private methods starting with underscore', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestActions = notifier.createActionsHook();

            const { result } = renderHook(() => useTestActions());

            expect((result.current as any)._privateMethod).toBeUndefined();
        });

        it('should call methods with correct context', () => {
            const notifier = new TestNotifier({ count: 0, name: 'test' });
            const useTestActions = notifier.createActionsHook();
            const useTestState = notifier.createStateHook();

            const { result: actionsResult } = renderHook(() => useTestActions());
            const { result: stateResult } = renderHook(() => useTestState((s) => s.count));

            expect(stateResult.current).toBe(0);

            act(() => {
                actionsResult.current.increment();
            });

            expect(stateResult.current).toBe(1);
        });
    });

    describe('static build', () => {
        it('should create instance', () => {
            const instance = TestNotifier.build({ count: 10, name: 'built' });

            expect(instance).toBeInstanceOf(TestNotifier);
            expect(instance.getCount()).toBe(10);
        });
    });

    describe('static createFactoryHook', () => {
        it('should return hook function', () => {
            const useTestFactory = TestNotifier.createFactoryHook({ count: 0, name: 'test' });

            expect(typeof useTestFactory).toBe('function');
        });

        it('should return state and actions', () => {
            const useTestFactory = TestNotifier.createFactoryHook({ count: 5, name: 'factory' });

            const { result } = renderHook(() => useTestFactory());

            expect(result.current.state).toEqual({ count: 5, name: 'factory' });
            expect(typeof result.current.actions.increment).toBe('function');
        });

        it('should apply selector', () => {
            const useTestFactory = TestNotifier.createFactoryHook({ count: 5, name: 'factory' });

            const { result } = renderHook(() => useTestFactory((s) => s.count));

            expect(result.current.state).toBe(5);
        });

        it('should maintain instance across renders', () => {
            const useTestFactory = TestNotifier.createFactoryHook({ count: 0, name: 'factory' });

            const { result, rerender } = renderHook(() => useTestFactory());

            const initialActions = result.current.actions;

            act(() => {
                result.current.actions.increment();
            });

            rerender();

            expect(result.current.state.count).toBe(1);
            expect(result.current.actions).toBe(initialActions);
        });

        it('should update when state changes', () => {
            const useTestFactory = TestNotifier.createFactoryHook({ count: 0, name: 'factory' });

            const { result } = renderHook(() => useTestFactory((s) => s.count));

            expect(result.current.state).toBe(0);

            act(() => {
                result.current.actions.increment();
            });

            expect(result.current.state).toBe(1);
        });

        it('should create isolated instances per hook', () => {
            const useTestFactory1 = TestNotifier.createFactoryHook({ count: 0, name: 'factory1' });
            const useTestFactory2 = TestNotifier.createFactoryHook({ count: 100, name: 'factory2' });

            const { result: result1 } = renderHook(() => useTestFactory1());
            const { result: result2 } = renderHook(() => useTestFactory2());

            act(() => {
                result1.current.actions.increment();
            });

            expect(result1.current.state.count).toBe(1);
            expect(result2.current.state.count).toBe(100);
        });
    });
});
