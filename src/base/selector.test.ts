import { renderHook, act, waitFor } from '@testing-library/react';

import { selector, getSnapshot } from './selector';
import { BaseNotifier } from './base';

interface CounterState {
    count: number;
}

interface UserState {
    name: string;
    age: number;
}

class CounterNotifier extends BaseNotifier<CounterState> {
    increment (): void {
        this.updateState({ count: this.state.count + 1 });
    }

    setCount (count: number): void {
        this.state = { count };
    }

    getCount (): number {
        return this.state.count;
    }
}

class UserNotifier extends BaseNotifier<UserState> {
    setName (name: string): void {
        this.updateState({ name });
    }

    setAge (age: number): void {
        this.updateState({ age });
    }
}

describe('selector', () => {
    describe('basic functionality', () => {
        it('should compute derived state from single notifier', () => {
            const counter = new CounterNotifier({ count: 5 });

            const derived = selector((get) => {
                const state = get(counter);

                return state.count * 2;
            });

            expect(derived.getSnapshot()).toBe(10);
            derived.destroy();
        });

        it('should compute derived state from multiple notifiers', () => {
            const counter = new CounterNotifier({ count: 5 });
            const user = new UserNotifier({ name: 'John', age: 30 });

            const derived = selector((get) => {
                const counterState = get(counter);
                const userState = get(user);

                return `${userState.name}: ${counterState.count}`;
            });

            expect(derived.getSnapshot()).toBe('John: 5');
            derived.destroy();
        });

        it('should update when source notifier changes', () => {
            const counter = new CounterNotifier({ count: 0 });

            const derived = selector((get) => {
                const state = get(counter);

                return state.count * 10;
            });

            expect(derived.getSnapshot()).toBe(0);

            counter.increment();
            expect(derived.getSnapshot()).toBe(10);

            counter.increment();
            expect(derived.getSnapshot()).toBe(20);

            derived.destroy();
        });

        it('should update when any source notifier changes', () => {
            const counter = new CounterNotifier({ count: 0 });
            const user = new UserNotifier({ name: 'John', age: 30 });

            const derived = selector((get) => {
                const counterState = get(counter);
                const userState = get(user);

                return {
                    greeting: `Hello ${userState.name}`,
                    count: counterState.count,
                };
            });

            expect(derived.getSnapshot()).toEqual({
                greeting: 'Hello John',
                count: 0,
            });

            user.setName('Jane');
            expect(derived.getSnapshot().greeting).toBe('Hello Jane');

            counter.increment();
            expect(derived.getSnapshot().count).toBe(1);

            derived.destroy();
        });
    });

    describe('subscription', () => {
        it('should notify subscribers on state change', () => {
            const counter = new CounterNotifier({ count: 0 });
            const subscriber = jest.fn();

            const derived = selector((get) => get(counter).count * 2);

            derived.subscribe(subscriber);

            counter.increment();

            expect(subscriber).toHaveBeenCalledWith(2);

            derived.destroy();
        });

        it('should not notify when derived value is unchanged', () => {
            const counter = new CounterNotifier({ count: 0 });
            const subscriber = jest.fn();

            const derived = selector((get) => {
                const count = get(counter).count;

                return count > 5 ? 'high' : 'low';
            });

            derived.subscribe(subscriber);

            counter.increment();
            counter.increment();

            expect(subscriber).toHaveBeenCalledTimes(0);

            derived.destroy();
        });

        it('should allow unsubscribing', () => {
            const counter = new CounterNotifier({ count: 0 });
            const subscriber = jest.fn();

            const derived = selector((get) => get(counter).count);

            const unsubscribe = derived.subscribe(subscriber);

            counter.increment();
            expect(subscriber).toHaveBeenCalledTimes(1);

            unsubscribe();
            counter.increment();
            expect(subscriber).toHaveBeenCalledTimes(1);

            derived.destroy();
        });
    });

    describe('set function', () => {
        it('should allow setting notifier state', () => {
            const counter = new CounterNotifier({ count: 0 });

            const derived = selector((get, set) => {
                const count = get(counter).count;

                if (count > 10) {
                    set(counter, { count: 10 });
                }

                return count;
            });

            counter.setCount(15);

            expect(counter.getCount()).toBe(10);

            derived.destroy();
        });
    });

    describe('async selectors', () => {
        it('should handle Promise return values', async () => {
            const counter = new CounterNotifier({ count: 5 });

            const derived = selector(async (get) => {
                const state = get(counter);
                await new Promise((resolve) => setTimeout(resolve, 10));

                return state.count * 2;
            });

            await waitFor(() => {
                expect(derived.getSnapshot()).toBe(10);
            });

            derived.destroy();
        });

        it('should handle race conditions with version counter', async () => {
            const counter = new CounterNotifier({ count: 0 });
            const results: number[] = [];

            const derived = selector(async (get) => {
                const count = get(counter).count;
                await new Promise((resolve) => setTimeout(resolve, count === 1 ? 100 : 10));

                return count * 10;
            });

            derived.subscribe((value) => results.push(value));

            counter.setCount(1);
            counter.setCount(2);

            await new Promise((resolve) => setTimeout(resolve, 150));

            expect(results).not.toContain(10);
            expect(results).toContain(20);

            derived.destroy();
        });

        it('should silently catch errors in async selectors', async () => {
            const counter = new CounterNotifier({ count: 0 });

            const derived = selector(async (get) => {
                const state = get(counter);

                if (state.count > 0) {
                    throw new Error('Test error');
                }

                return state.count;
            });

            await waitFor(() => {
                expect(derived.getSnapshot()).toBe(0);
            });

            counter.increment();

            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(derived.getSnapshot()).toBe(0);

            derived.destroy();
        });
    });

    describe('destroy', () => {
        it('should unsubscribe from all notifiers', () => {
            const counter = new CounterNotifier({ count: 0 });
            const subscriber = jest.fn();

            const derived = selector((get) => get(counter).count * 2);

            derived.subscribe(subscriber);

            counter.increment();
            expect(subscriber).toHaveBeenCalledTimes(1);

            derived.destroy();

            counter.increment();
            expect(subscriber).toHaveBeenCalledTimes(1);
        });
    });

    describe('getServerSnapshot', () => {
        it('should return server state', () => {
            const counter = new CounterNotifier({ count: 5 });

            const derived = selector((get) => get(counter).count * 2);

            expect(derived.getServerSnapshot()).toBe(10);

            derived.destroy();
        });
    });

    describe('createStateHook', () => {
        it('should return working hook', () => {
            const counter = new CounterNotifier({ count: 5 });

            const derived = selector((get) => get(counter).count * 2);

            const useDerivedState = derived.createStateHook();

            const { result } = renderHook(() => useDerivedState());

            expect(result.current).toBe(10);

            derived.destroy();
        });

        it('should apply selector to derived state', () => {
            const counter = new CounterNotifier({ count: 5 });

            const derived = selector((get) => ({
                doubled: get(counter).count * 2,
                tripled: get(counter).count * 3,
            }));

            const useDerivedState = derived.createStateHook();

            const { result } = renderHook(() => useDerivedState((s) => s.doubled));

            expect(result.current).toBe(10);

            derived.destroy();
        });

        it('should update when source changes', () => {
            const counter = new CounterNotifier({ count: 0 });

            const derived = selector((get) => get(counter).count * 2);

            const useDerivedState = derived.createStateHook();

            const { result } = renderHook(() => useDerivedState());

            expect(result.current).toBe(0);

            act(() => {
                counter.increment();
            });

            expect(result.current).toBe(2);

            derived.destroy();
        });

        it('should use deep comparison for preventing unnecessary updates', () => {
            const counter = new CounterNotifier({ count: 0 });

            const derived = selector((get) => ({
                isPositive: get(counter).count > 0,
            }));

            const useDerivedState = derived.createStateHook();
            let renderCount = 0;

            renderHook(() => {
                renderCount++;

                return useDerivedState();
            });

            const initialRenderCount = renderCount;

            act(() => {
                counter.setCount(-1);
            });

            expect(renderCount).toBe(initialRenderCount);

            derived.destroy();
        });

        it('should not re-render with selector when selected value unchanged', () => {
            const counter = new CounterNotifier({ count: 5 });

            const derived = selector((get) => ({
                count: get(counter).count,
                doubled: get(counter).count * 2,
            }));

            const useDerivedState = derived.createStateHook();
            let renderCount = 0;

            const { result } = renderHook(() => {
                renderCount++;

                return useDerivedState((s) => s.doubled > 5);
            });

            expect(result.current).toBe(true);
            const initialRenderCount = renderCount;

            act(() => {
                counter.setCount(10);
            });

            expect(renderCount).toBe(initialRenderCount);

            derived.destroy();
        });

        it('should update hook state when source changes', () => {
            const counter = new CounterNotifier({ count: 0 });

            const derived = selector((get) => get(counter).count * 3);

            const useDerivedState = derived.createStateHook();

            const { result } = renderHook(() => useDerivedState());

            expect(result.current).toBe(0);

            act(() => {
                counter.setCount(5);
            });

            expect(result.current).toBe(15);

            derived.destroy();
        });

        it('should work without selector', () => {
            const counter = new CounterNotifier({ count: 10 });

            const derived = selector((get) => get(counter).count);

            const useDerivedState = derived.createStateHook();

            const { result } = renderHook(() => useDerivedState());

            expect(result.current).toBe(10);

            act(() => {
                counter.increment();
            });

            expect(result.current).toBe(11);

            derived.destroy();
        });
    });

    describe('nested selectors', () => {
        it('should support using selector in another selector', () => {
            const counter = new CounterNotifier({ count: 5 });

            const doubled = selector((get) => get(counter).count * 2);
            const quadrupled = selector((get) => get(doubled) * 2);

            expect(quadrupled.getSnapshot()).toBe(20);

            counter.increment();
            expect(doubled.getSnapshot()).toBe(12);
            expect(quadrupled.getSnapshot()).toBe(24);

            doubled.destroy();
            quadrupled.destroy();
        });
    });
});

describe('getSnapshot', () => {
    it('should get snapshot from notifier', () => {
        const counter = new CounterNotifier({ count: 42 });

        expect(getSnapshot(counter)).toEqual({ count: 42 });
    });

    it('should get snapshot from selector', () => {
        const counter = new CounterNotifier({ count: 5 });
        const derived = selector((get) => get(counter).count * 2);

        expect(getSnapshot(derived)).toBe(10);

        derived.destroy();
    });
});
