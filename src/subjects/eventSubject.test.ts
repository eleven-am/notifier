import { EventSubject } from './eventSubject';

interface TestEvents {
    message: string;
    count: number;
    data: { id: number; name: string };
}

describe('EventSubject', () => {
    let eventSubject: EventSubject<TestEvents>;

    beforeEach(() => {
        eventSubject = new EventSubject<TestEvents>();
    });

    it('should subscribe to specific events', () => {
        const messageHandler = jest.fn();
        const countHandler = jest.fn();

        eventSubject.subscribe('message', messageHandler);
        eventSubject.subscribe('count', countHandler);

        eventSubject.publish('message', 'hello');

        expect(messageHandler).toHaveBeenCalledWith('hello');
        expect(countHandler).not.toHaveBeenCalled();
    });

    it('should publish to all subscribers of an event', () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        eventSubject.subscribe('message', handler1);
        eventSubject.subscribe('message', handler2);

        eventSubject.publish('message', 'test');

        expect(handler1).toHaveBeenCalledWith('test');
        expect(handler2).toHaveBeenCalledWith('test');
    });

    it('should unsubscribe correctly', () => {
        const handler = jest.fn();
        const unsubscribe = eventSubject.subscribe('message', handler);

        eventSubject.publish('message', 'first');

        expect(handler).toHaveBeenCalledTimes(1);

        unsubscribe();

        eventSubject.publish('message', 'second');

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle complex event data', () => {
        const handler = jest.fn();

        eventSubject.subscribe('data', handler);

        const testData = { id: 1, name: 'test' };

        eventSubject.publish('data', testData);

        expect(handler).toHaveBeenCalledWith(testData);
    });

    it('should return correct size', () => {
        expect(eventSubject.size).toBe(0);

        eventSubject.subscribe('message', jest.fn());

        expect(eventSubject.size).toBe(1);

        eventSubject.subscribe('count', jest.fn());

        expect(eventSubject.size).toBe(2);
    });

    it('should not fail when publishing to event with no subscribers', () => {
        expect(() => {
            eventSubject.publish('message', 'test');
        }).not.toThrow();
    });

    it('should handle multiple unsubscribes from same event', () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        const unsub1 = eventSubject.subscribe('message', handler1);
        const unsub2 = eventSubject.subscribe('message', handler2);

        unsub1();

        eventSubject.publish('message', 'test');

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledWith('test');

        unsub2();

        eventSubject.publish('message', 'test2');

        expect(handler2).toHaveBeenCalledTimes(1);
    });
});
