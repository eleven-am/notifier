import { Subject, Subscriber, Unsubscribe } from './subject';

type EventMessage<EventType extends Record<string, any>> = {
    [Event in keyof EventType]: {
        event: Event;
        payload: EventType[Event];
    };
}[keyof EventType];

export class EventSubject<EventType extends Record<string, any>> {
    readonly #subject = new Subject<EventMessage<EventType>>();

    get size () {
        return this.#subject.size;
    }

    subscribe <Event extends keyof EventType> (event: Event, observer: Subscriber<EventType[Event]>): Unsubscribe {
        return this.#subject.subscribe((message) => {
            if (message.event === event) {
                return observer(message.payload as EventType[Event]);
            }

            return undefined;
        });
    }

    publish <Event extends keyof EventType> (event: Event, payload: EventType[Event]): void {
        this.#subject.publish({
            event,
            payload,
        } as EventMessage<EventType>);
    }
}
