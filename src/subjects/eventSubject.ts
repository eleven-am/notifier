import { Subscriber, Unsubscribe } from './subject';

type EventObserverMap<EventType> = Map<keyof EventType, Set<Subscriber<any>>>;

export class EventSubject<EventType extends Record<string, any>> {
    readonly #observers: EventObserverMap<EventType>;

    constructor () {
        this.#observers = new Map();
    }

    get size () {
        return this.#observers.size;
    }

    subscribe <Event extends keyof EventType> (event: Event, observer: Subscriber<EventType[Event]>): Unsubscribe {
        let observers = this.#observers.get(event);

        if (!observers) {
            observers = new Set();
            this.#observers.set(event, observers);
        }

        observers.add(observer);

        return () => {
            observers.delete(observer);
        };
    }

    publish <Event extends keyof EventType> (event: Event, message: EventType[Event]): void {
        const observers = this.#observers.get(event);

        if (observers) {
            observers.forEach((observer) => observer(message));
        }
    }
}
