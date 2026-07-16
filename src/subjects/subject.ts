export type Subscriber<T> = (message: T) => void;
export type Unsubscribe = () => void;

export class Subject<T> {
    readonly #observers: Set<Subscriber<T>>;

    constructor () {
        this.#observers = new Set<Subscriber<T>>();
    }

    /**
     * @desc Returns the number of subscribers
     */
    get size () {
        return this.#observers.size;
    }

    /**
     * @desc Subscribes to a subject
     * @param observer - The observer to subscribe
     */
    subscribe (observer: Subscriber<T>): () => boolean {
        const subscription = (message: T) => observer(message);

        this.#observers.add(subscription);

        return () => this.#observers.delete(subscription);
    }

    /**
     * @desc Publishes a message to all subscribers
     * @param message - The message to publish
     */
    publish (message: T) {
        this.#observers.forEach((observer) => observer(message));
    }
}
