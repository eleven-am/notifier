import { renderHook, act } from '@testing-library/react';

import { EventNotifier } from './event';

interface TestState {
    count: number;
    status: string;
}

interface TestEvents {
    increment: number;
    statusChange: { old: string; new: string };
    simple: void;
}

class TestEventNotifier extends EventNotifier<TestState, TestEvents> {
    increment (): void {
        const newCount = this.state.count + 1;

        this.updateState({ count: newCount });
        this.emit('increment', newCount);
    }

    setStatus (status: string): void {
        const old = this.state.status;

        this.updateState({ status });
        this.emit('statusChange', { old, new: status });
    }

    triggerSimple (): void {
        this.emit('simple', undefined as any);
    }

    getCount (): number {
        return this.state.count;
    }
}

describe('EventNotifier', () => {
    describe('inheritance from BaseNotifier', () => {
        it('should create instance with initial state', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });

            expect(notifier.getCount()).toBe(0);
        });

        it('should support state updates', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });

            notifier.increment();

            expect(notifier.getCount()).toBe(1);
        });

        it('should support state subscription', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const subscriber = jest.fn();

            notifier.subscribe(subscriber);
            notifier.increment();

            expect(subscriber).toHaveBeenCalledWith({ count: 1, status: 'idle' });
        });

        it('should support createStateHook', () => {
            const notifier = new TestEventNotifier({ count: 5, status: 'active' });
            const useTestState = notifier.createStateHook();

            const { result } = renderHook(() => useTestState((s) => s.count));

            expect(result.current).toBe(5);
        });

        it('should support createActionsHook', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestActions = notifier.createActionsHook();

            const { result } = renderHook(() => useTestActions());

            expect(typeof result.current.increment).toBe('function');
            expect(typeof result.current.setStatus).toBe('function');
        });

        it('should support reset', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });

            notifier.increment();
            notifier.increment();
            notifier.reset();

            expect(notifier.getCount()).toBe(0);
        });
    });

    describe('event system', () => {
        describe('emit and on', () => {
            it('should emit events with data', () => {
                const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
                const listener = jest.fn();

                notifier.on('increment', listener);
                notifier.increment();

                expect(listener).toHaveBeenCalledWith(1);
            });

            it('should emit events with complex data', () => {
                const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
                const listener = jest.fn();

                notifier.on('statusChange', listener);
                notifier.setStatus('active');

                expect(listener).toHaveBeenCalledWith({ old: 'idle', new: 'active' });
            });

            it('should handle multiple listeners for same event', () => {
                const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
                const listener1 = jest.fn();
                const listener2 = jest.fn();

                notifier.on('increment', listener1);
                notifier.on('increment', listener2);
                notifier.increment();

                expect(listener1).toHaveBeenCalledWith(1);
                expect(listener2).toHaveBeenCalledWith(1);
            });

            it('should handle different event types independently', () => {
                const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
                const incrementListener = jest.fn();
                const statusListener = jest.fn();

                notifier.on('increment', incrementListener);
                notifier.on('statusChange', statusListener);

                notifier.increment();

                expect(incrementListener).toHaveBeenCalledTimes(1);
                expect(statusListener).toHaveBeenCalledTimes(0);

                notifier.setStatus('active');

                expect(incrementListener).toHaveBeenCalledTimes(1);
                expect(statusListener).toHaveBeenCalledTimes(1);
            });
        });

        describe('unsubscribe', () => {
            it('should stop receiving events after unsubscribe', () => {
                const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
                const listener = jest.fn();

                const unsubscribe = notifier.on('increment', listener);

                notifier.increment();
                expect(listener).toHaveBeenCalledTimes(1);

                unsubscribe();
                notifier.increment();
                expect(listener).toHaveBeenCalledTimes(1);
            });

            it('should only unsubscribe the specific listener', () => {
                const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
                const listener1 = jest.fn();
                const listener2 = jest.fn();

                const unsubscribe1 = notifier.on('increment', listener1);

                notifier.on('increment', listener2);

                unsubscribe1();
                notifier.increment();

                expect(listener1).not.toHaveBeenCalled();
                expect(listener2).toHaveBeenCalledWith(1);
            });
        });
    });

    describe('createEventsHook', () => {
        it('should return hook function', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestEvents = notifier.createEventsHook();

            expect(typeof useTestEvents).toBe('function');
        });

        it('should subscribe to events', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestEvents = notifier.createEventsHook();
            const callback = jest.fn();

            renderHook(() => useTestEvents('increment', callback));

            act(() => {
                notifier.increment();
            });

            expect(callback).toHaveBeenCalledWith(1);
        });

        it('should clean up on unmount', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestEvents = notifier.createEventsHook();
            const callback = jest.fn();

            const { unmount } = renderHook(() => useTestEvents('increment', callback));

            act(() => {
                notifier.increment();
            });

            expect(callback).toHaveBeenCalledTimes(1);

            unmount();

            act(() => {
                notifier.increment();
            });

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('should use latest callback (no stale closures)', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestEvents = notifier.createEventsHook();
            const values: number[] = [];

            const { rerender } = renderHook(
                ({ multiplier }) => useTestEvents('increment', (count) => {
                    values.push(count * multiplier);
                }),
                { initialProps: { multiplier: 1 } },
            );

            act(() => {
                notifier.increment();
            });

            expect(values).toEqual([1]);

            rerender({ multiplier: 10 });

            act(() => {
                notifier.increment();
            });

            expect(values).toEqual([1, 20]);
        });

        it('should resubscribe when event name changes', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestEvents = notifier.createEventsHook();
            const incrementCallback = jest.fn();
            const statusCallback = jest.fn();

            const { rerender } = renderHook(
                ({ event, callback }) => useTestEvents(event, callback),
                {
                    initialProps: {
                        event: 'increment' as keyof TestEvents,
                        callback: incrementCallback as any,
                    },
                },
            );

            act(() => {
                notifier.increment();
            });

            expect(incrementCallback).toHaveBeenCalledTimes(1);

            rerender({
                event: 'statusChange' as keyof TestEvents,
                callback: statusCallback as any,
            });

            act(() => {
                notifier.increment();
                notifier.setStatus('active');
            });

            expect(incrementCallback).toHaveBeenCalledTimes(1);
            expect(statusCallback).toHaveBeenCalledTimes(1);
        });

        it('should handle void event data', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestEvents = notifier.createEventsHook();
            const callback = jest.fn();

            renderHook(() => useTestEvents('simple', callback));

            act(() => {
                notifier.triggerSimple();
            });

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('combined state and event usage', () => {
        it('should work with both state hook and events hook', () => {
            const notifier = new TestEventNotifier({ count: 0, status: 'idle' });
            const useTestState = notifier.createStateHook();
            const useTestEvents = notifier.createEventsHook();
            const eventCallback = jest.fn();

            const { result: stateResult } = renderHook(() => useTestState((s) => s.count));

            renderHook(() => useTestEvents('increment', eventCallback));

            expect(stateResult.current).toBe(0);

            act(() => {
                notifier.increment();
            });

            expect(stateResult.current).toBe(1);
            expect(eventCallback).toHaveBeenCalledWith(1);
        });
    });

    describe('listener errors', () => {
        it('should hand a throwing event listener to onError and keep notifying the others', () => {
            const errors: unknown[] = [];
            const failure = new Error('listener failed');

            class GuardedNotifier extends TestEventNotifier {
                protected onError (error: unknown): void {
                    errors.push(error);
                }
            }

            const notifier = new GuardedNotifier({ count: 0, status: 'idle' });
            const listener = jest.fn();

            notifier.on('increment', () => {
                throw failure;
            });
            notifier.on('increment', listener);

            expect(() => notifier.increment()).not.toThrow();
            expect(listener).toHaveBeenCalledWith(1);
            expect(errors).toEqual([failure]);
        });
    });
});
