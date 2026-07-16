import { useEffect, useRef } from 'react';

import { BaseNotifier } from '../base/base';
import { EventSubject } from '../subjects/eventSubject';
import { Unsubscribe } from '../subjects/subject';

export type UseEventHook<EventType> = <Event extends keyof EventType>(
    event: Event,
    callback: (data: EventType[Event]) => void
) => void;

export class EventNotifier<State extends object, EventType extends Record<string, any>> extends BaseNotifier<State> {
    readonly #subject: EventSubject<EventType>;

    constructor (initialState: State) {
        super(initialState);
        this.#subject = new EventSubject<EventType>();
    }

    public on <Event extends keyof EventType> (event: Event, callback: (data: EventType[Event]) => void): Unsubscribe {
        return this.#subject.subscribe(event, callback);
    }

    public createEventsHook (): UseEventHook<EventType> {
        return (event, callback) => {
            const callbackRef = useRef(callback);

            callbackRef.current = callback;

            useEffect(() => {
                const unsubscribe = this.on(event, (data) => {
                    callbackRef.current(data);
                });

                return () => {
                    unsubscribe();
                };
            }, [event]);
        };
    }

    protected emit <Event extends keyof EventType> (event: Event, data: EventType[Event]): void {
        this.#subject.publish(event, data);
    }
}
