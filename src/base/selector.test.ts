import { renderHook, act, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';

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

        it('should keep source subscriptions while a direct subscriber remains', () => {
            const counter = new CounterNotifier({ count: 0 });
            const subscriber = jest.fn();
            const derived = selector((get) => get(counter).count);
            const unsubscribe = derived.subscribe(subscriber);
            const useDerivedState = derived.createStateHook();
            const { unmount } = renderHook(() => useDerivedState());

            unmount();
            counter.increment();

            expect(subscriber).toHaveBeenCalledWith(1);

            unsubscribe();
        });
    });

    describe('sync selector errors', () => {
        it('should keep the last value and expose the error when a sync selector throws', () => {
            const counter = new CounterNotifier({ count: 0 });
            const derived = selector((get) => {
                const { count } = get(counter);

                if (count === 1) {
                    throw new Error('sync failure');
                }

                return count * 10;
            });
            const subscriber = jest.fn();

            derived.subscribe(subscriber);

            expect(() => counter.increment()).not.toThrow();
            expect(derived.getSnapshot()).toBe(0);
            expect(derived.getStatus()).toEqual({
                pending: false,
                error: expect.objectContaining({ message: 'sync failure' }),
            });
            expect(subscriber).not.toHaveBeenCalled();

            counter.increment();

            expect(derived.getSnapshot()).toBe(20);
            expect(derived.getStatus()).toEqual({ pending: false, error: null });

            derived.destroy();
        });

        it('should expose the error when a sync selector throws on its first run', () => {
            const counter = new CounterNotifier({ count: 1 });
            const derived = selector((get) => {
                if (get(counter).count === 1) {
                    throw new Error('first run failure');
                }

                return 'ok';
            });

            expect(derived.getStatus().error).toEqual(expect.objectContaining({ message: 'first run failure' }));

            counter.increment();

            expect(derived.getSnapshot()).toBe('ok');
            expect(derived.getStatus().error).toBeNull();

            derived.destroy();
        });
    });

    describe('hook subscription stability', () => {
        it('should not re-run the selector when a component re-renders', () => {
            const counter = new CounterNotifier({ count: 0 });
            let runs = 0;
            const derived = selector((get) => {
                runs++;

                return get(counter).count;
            });
            const useDerived = derived.createStateHook();
            const { rerender } = renderHook(() => useDerived());
            const runsAfterMount = runs;

            rerender();
            rerender();
            rerender();

            expect(runs).toBe(runsAfterMount);

            derived.destroy();
        });

        it('should keep the same reference when an inline selector returns an equal value on re-render', () => {
            const counter = new CounterNotifier({ count: 1 });
            const derived = selector((get) => get(counter).count);
            const useDerived = derived.createStateHook();
            const { result, rerender } = renderHook(() => useDerived((count) => ({ count })));
            const first = result.current;

            rerender();

            expect(result.current).toBe(first);

            derived.destroy();
        });
    });

    describe('lazy start', () => {
        it('should not run the selector until something reads it', () => {
            const counter = new CounterNotifier({ count: 1 });
            let runs = 0;
            const derived = selector((get) => {
                runs++;

                return get(counter).count;
            });

            expect(runs).toBe(0);
            expect(derived.getSnapshot()).toBe(1);
            expect(runs).toBe(1);

            derived.destroy();
        });

        it('should compute the server value only when it is asked for', () => {
            const counter = new CounterNotifier({ count: 2 });
            let runs = 0;
            const derived = selector((get) => {
                runs++;

                return get(counter).count * 2;
            });

            derived.subscribe(() => undefined);
            expect(runs).toBe(1);

            expect(derived.getServerSnapshot()).toBe(4);
            expect(runs).toBe(2);

            expect(derived.getServerSnapshot()).toBe(4);
            expect(runs).toBe(2);

            derived.destroy();
        });
    });

    describe('cancellation', () => {
        it('should abort the previous async run when a newer one starts', async () => {
            const counter = new CounterNotifier({ count: 0 });
            const signals: AbortSignal[] = [];
            const derived = selector(async (get, _set, signal) => {
                signals.push(signal);
                const { count } = get(counter);

                await new Promise((resolve) => setTimeout(resolve, 5));

                return count;
            });

            derived.subscribe(() => undefined);
            counter.increment();

            expect(signals).toHaveLength(2);
            expect(signals[0].aborted).toBe(true);
            expect(signals[1].aborted).toBe(false);

            await waitFor(() => {
                expect(derived.getSnapshot()).toBe(1);
            });

            derived.destroy();
        });

        it('should never hand the signal of a finished sync run to a later run', () => {
            const counter = new CounterNotifier({ count: 0 });
            const signals: AbortSignal[] = [];
            const derived = selector((get, _set, signal) => {
                signals.push(signal);

                return get(counter).count;
            });

            derived.subscribe(() => undefined);
            counter.increment();

            expect(signals).toHaveLength(2);
            expect(signals[0]).not.toBe(signals[1]);

            derived.destroy();
        });

        it('should abort the in-flight run on destroy', () => {
            const counter = new CounterNotifier({ count: 0 });
            let seen: AbortSignal | undefined;
            const derived = selector(async (get, _set, signal) => {
                seen = signal;

                return get(counter).count;
            });

            derived.subscribe(() => undefined);
            derived.destroy();

            expect(seen?.aborted).toBe(true);
        });
    });

    describe('dependency tracking', () => {
        it('should stop recomputing for a source the selector no longer reads', () => {
            const flag = new CounterNotifier({ count: 0 });
            const first = new CounterNotifier({ count: 10 });
            const second = new CounterNotifier({ count: 20 });
            let runs = 0;
            const derived = selector((get) => {
                runs++;

                return get(flag).count === 0 ? get(first).count : get(second).count;
            });

            derived.subscribe(() => undefined);
            flag.increment();
            expect(derived.getSnapshot()).toBe(20);

            const runsAfterSwitch = runs;

            first.increment();

            expect(runs).toBe(runsAfterSwitch);

            second.increment();

            expect(derived.getSnapshot()).toBe(21);

            derived.destroy();
        });

        it('should keep the sources of the last good run when a run fails', () => {
            const flag = new CounterNotifier({ count: 0 });
            const source = new CounterNotifier({ count: 1 });
            const derived = selector((get) => {
                if (get(flag).count === 1) {
                    throw new Error('failed run');
                }

                return get(source).count;
            });

            derived.subscribe(() => undefined);
            flag.increment();
            flag.setCount(0);
            source.increment();

            expect(derived.getSnapshot()).toBe(2);

            derived.destroy();
        });
    });

    describe('runs after destroy', () => {
        it('should not start listening to a source read by a run that finishes after destroy', async () => {
            let listeners = 0;

            class TrackedNotifier extends CounterNotifier {
                protected onFirstSubscriber (): void {
                    listeners++;
                }

                protected onLastSubscriber (): void {
                    listeners--;
                }
            }

            const first = new TrackedNotifier({ count: 0 });
            const late = new TrackedNotifier({ count: 0 });
            let runs = 0;
            const derived = selector(async (get) => {
                runs++;
                get(first);
                await Promise.resolve();

                return get(late).count;
            });

            const unsubscribe = derived.subscribe(() => undefined);

            unsubscribe();
            await Promise.resolve();
            await Promise.resolve();

            expect(listeners).toBe(0);

            late.increment();

            expect(runs).toBe(1);
        });
    });

    describe('strict mode and nesting', () => {
        it('should settle on one subscription under StrictMode', () => {
            const counter = new CounterNotifier({ count: 3 });
            let runs = 0;
            const derived = selector((get) => {
                runs++;

                return get(counter).count;
            });
            const useDerived = derived.createStateHook();
            const { result, rerender } = renderHook(() => useDerived(), { wrapper: StrictMode });

            const runsAfterMount = runs;

            rerender();

            expect(result.current).toBe(3);
            expect(runs).toBe(runsAfterMount);

            act(() => {
                counter.increment();
            });

            expect(result.current).toBe(4);

            derived.destroy();
        });

        it('should keep a nested selector alive for its own hook when the parent stops reading it', () => {
            const flag = new CounterNotifier({ count: 0 });
            const counter = new CounterNotifier({ count: 1 });
            const inner = selector((get) => get(counter).count * 10);
            const outer = selector((get) => (get(flag).count === 0 ? get(inner) : -1));
            const useInner = inner.createStateHook();
            const { result } = renderHook(() => useInner());

            outer.subscribe(() => undefined);
            flag.increment();

            act(() => {
                counter.increment();
            });

            expect(result.current).toBe(20);

            outer.destroy();
            inner.destroy();
        });
    });

    describe('types', () => {
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

        it('should type an async selector as possibly undefined until it resolves', () => {
            const counter = new CounterNotifier({ count: 0 });
            const asyncDerived = selector(async (get) => get(counter).count);
            const syncDerived = selector((get) => get(counter).count);

            const asyncIsOptional: Equal<ReturnType<typeof asyncDerived.getSnapshot>, number | undefined> = true;
            const explicitAsync = selector<number>(async (get) => get(counter).count);
            const explicitAsyncIsOptional: Equal<ReturnType<typeof explicitAsync.getSnapshot>, number | undefined> = true;

            explicitAsync.destroy();
            expect(explicitAsyncIsOptional).toBe(true);
            const syncIsExact: Equal<ReturnType<typeof syncDerived.getSnapshot>, number> = true;

            type Target = { kind: 'a'; value: number } | { kind: 'b' };

            const unionDerived = selector<Target>((get) => (get(counter).count > 0 ? { kind: 'a', value: 1 } : { kind: 'b' }));
            const unionStaysOneSelector: Equal<ReturnType<typeof unionDerived.getSnapshot>, Target> = true;

            expect(asyncIsOptional && syncIsExact && unionStaysOneSelector).toBe(true);

            unionDerived.destroy();

            asyncDerived.destroy();
            syncDerived.destroy();
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

            derived.subscribe(() => undefined);
            counter.setCount(15);

            expect(counter.getCount()).toBe(10);
            expect(derived.getSnapshot()).toBe(10);

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

            expect(derived.getStatus()).toEqual({ pending: true, error: null });

            await waitFor(() => {
                expect(derived.getSnapshot()).toBe(10);
            });

            expect(derived.getStatus()).toEqual({ pending: false, error: null });

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

        it('should expose errors in async selectors without discarding the last value', async () => {
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

            await waitFor(() => {
                expect(derived.getStatus()).toEqual({
                    pending: false,
                    error: expect.objectContaining({ message: 'Test error' }),
                });
            });

            expect(derived.getSnapshot()).toBe(0);

            derived.destroy();
        });

        it('should expose async status through a React hook', async () => {
            const counter = new CounterNotifier({ count: 1 });
            const derived = selector(async (get) => {
                const count = get(counter).count;

                await new Promise((resolve) => setTimeout(resolve, 10));

                return count;
            });
            const useStatus = derived.createStatusHook();
            const { result } = renderHook(() => useStatus());

            expect(result.current.pending).toBe(true);

            await waitFor(() => {
                expect(result.current).toEqual({ pending: false, error: null });
            });

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

        it('should reinitialize snapshots after destroy on next access', () => {
            const counter = new CounterNotifier({ count: 1 });
            const derived = selector((get) => get(counter).count * 2);

            expect(derived.getSnapshot()).toBe(2);

            derived.destroy();
            counter.setCount(3);

            expect(derived.getSnapshot()).toBe(6);
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

        it('should render the current value when remounted after the last subscriber left', () => {
            const counter = new CounterNotifier({ count: 1 });

            const derived = selector((get) => get(counter).count);

            const useDerivedState = derived.createStateHook();

            const first = renderHook(() => useDerivedState());

            expect(first.result.current).toBe(1);

            first.unmount();

            act(() => {
                counter.setCount(7);
            });

            const second = renderHook(() => useDerivedState());

            expect(second.result.current).toBe(7);

            derived.destroy();
        });

        it('should render the current selected value when remounted with a selector', () => {
            const counter = new CounterNotifier({ count: 1 });

            const derived = selector((get) => ({ count: get(counter).count }));

            const useDerivedState = derived.createStateHook();

            const first = renderHook(() => useDerivedState((state) => state.count * 2));

            expect(first.result.current).toBe(2);

            first.unmount();

            act(() => {
                counter.setCount(7);
            });

            const second = renderHook(() => useDerivedState((state) => state.count * 2));

            expect(second.result.current).toBe(14);

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
