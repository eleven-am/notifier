import {
    Notifier,
    EventNotifier,
    selector,
    getSnapshot,
} from './index';
import { BaseNotifier } from './base/base';
import { EventNotifier as OriginalEventNotifier } from './eventNotifier/event';
import { selector as originalSelector, getSnapshot as originalGetSnapshot } from './base/selector';

describe('index exports', () => {
    describe('class exports', () => {
        it('should export Notifier as BaseNotifier', () => {
            expect(Notifier).toBe(BaseNotifier);
        });

        it('should export EventNotifier', () => {
            expect(EventNotifier).toBe(OriginalEventNotifier);
        });

        it('should allow creating Notifier instances', () => {
            const notifier = new Notifier({ count: 0 });

            expect(notifier).toBeInstanceOf(BaseNotifier);
        });

        it('should allow creating EventNotifier instances', () => {
            const notifier = new EventNotifier<{ count: number }, { event: string }>({ count: 0 });

            expect(notifier).toBeInstanceOf(OriginalEventNotifier);
            expect(notifier).toBeInstanceOf(BaseNotifier);
        });
    });

    describe('function exports', () => {
        it('should export selector', () => {
            expect(selector).toBe(originalSelector);
        });

        it('should export getSnapshot', () => {
            expect(getSnapshot).toBe(originalGetSnapshot);
        });

        it('should allow creating selectors', () => {
            const notifier = new Notifier({ value: 10 });
            const derived = selector((get) => get(notifier).value * 2);

            expect(derived.getSnapshot()).toBe(20);
            derived.destroy();
        });

        it('should allow using getSnapshot', () => {
            const notifier = new Notifier({ value: 42 });

            expect(getSnapshot(notifier)).toEqual({ value: 42 });
        });
    });

    describe('type exports', () => {
        it('should allow using UseNotifierHook type', () => {
            const notifier = new Notifier({ count: 0 });
            const hook = notifier.createStateHook();

            expect(typeof hook).toBe('function');
        });

        it('should allow using Subscriber type', () => {
            const notifier = new Notifier({ count: 0 });
            const subscriber = jest.fn();

            const unsubscribe = notifier.subscribe(subscriber);

            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
        });
    });
});
