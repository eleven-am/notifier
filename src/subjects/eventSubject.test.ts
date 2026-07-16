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

    it('should publish only to subscribers of an event', () => {
        const messageObserver = jest.fn();
        const countObserver = jest.fn();

        eventSubject.subscribe('message', messageObserver);
        eventSubject.subscribe('count', countObserver);
        eventSubject.publish('message', 'hello');

        expect(messageObserver).toHaveBeenCalledWith('hello');
        expect(countObserver).not.toHaveBeenCalled();
    });

    it('should support every event payload in the event map', () => {
        const countObserver = jest.fn();
        const dataObserver = jest.fn();
        const data = { id: 1, name: 'test' };

        eventSubject.subscribe('count', countObserver);
        eventSubject.subscribe('data', dataObserver);
        eventSubject.publish('count', 2);
        eventSubject.publish('data', data);

        expect(countObserver).toHaveBeenCalledWith(2);
        expect(dataObserver).toHaveBeenCalledWith(data);
    });

    it('should inherit subscription ownership and cleanup', () => {
        const observer = jest.fn();
        const unsubscribe = eventSubject.subscribe('message', observer);

        expect(eventSubject.size).toBe(1);
        unsubscribe();
        unsubscribe();
        expect(eventSubject.size).toBe(0);

        eventSubject.publish('message', 'ignored');
        expect(observer).not.toHaveBeenCalled();
    });

    it('should own repeated subscriptions independently', () => {
        const observer = jest.fn();
        const unsubscribeFirst = eventSubject.subscribe('message', observer);
        const unsubscribeSecond = eventSubject.subscribe('message', observer);

        expect(eventSubject.size).toBe(2);
        unsubscribeFirst();
        eventSubject.publish('message', 'hello');
        expect(observer).toHaveBeenCalledTimes(1);

        unsubscribeSecond();
        expect(eventSubject.size).toBe(0);
    });
});
