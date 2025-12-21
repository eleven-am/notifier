import { Subject } from './subject';

describe('Subject', () => {
    let testSubject: Subject<number>;
    let observer1: jest.Mock;
    let observer2: jest.Mock;

    beforeEach(() => {
        testSubject = new Subject<number>();
        observer1 = jest.fn();
        observer2 = jest.fn();
    });

    it('should notify all subscribers when publish is called', () => {
        testSubject.subscribe(observer1);
        testSubject.subscribe(observer2);

        const message = 10;

        testSubject.publish(message);

        expect(observer1).toHaveBeenCalledWith(message);
        expect(observer2).toHaveBeenCalledWith(message);
    });

    it('should unsubscribe an observer when unsubscribe is called', () => {
        testSubject.subscribe(observer1);
        const unsubscribe = testSubject.subscribe(observer2);

        expect(testSubject.size).toBe(2);

        unsubscribe();

        expect(testSubject.size).toBe(1);

        testSubject.publish(5);

        expect(observer1).toHaveBeenCalledWith(5);
        expect(observer2).not.toHaveBeenCalled();
    });

    it('should return correct size', () => {
        expect(testSubject.size).toBe(0);

        const unsub1 = testSubject.subscribe(observer1);

        expect(testSubject.size).toBe(1);

        const unsub2 = testSubject.subscribe(observer2);

        expect(testSubject.size).toBe(2);

        unsub1();
        unsub2();

        expect(testSubject.size).toBe(0);
    });

    it('should handle multiple publishes', () => {
        testSubject.subscribe(observer1);

        testSubject.publish(1);
        testSubject.publish(2);
        testSubject.publish(3);

        expect(observer1).toHaveBeenCalledTimes(3);
        expect(observer1).toHaveBeenNthCalledWith(1, 1);
        expect(observer1).toHaveBeenNthCalledWith(2, 2);
        expect(observer1).toHaveBeenNthCalledWith(3, 3);
    });
});
