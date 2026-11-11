export type Subscriber<T> = (message: T) => void;
export type Unsubscribe = () => void;
export type ErrorHandler = (error: unknown) => void;

const logError: ErrorHandler = (error) => console.error(error);

export class Subject<T> {
    readonly #observers: Set<Subscriber<T>>;

    readonly #onError: ErrorHandler;

    /**
     * @param onError - Receives any error an observer throws; defaults to console.error
     */
    constructor (onError: ErrorHandler = logError) {
        this.#observers = new Set<Subscriber<T>>();
        this.#onError = onError;
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
     * @desc Publishes a message to all subscribers; an observer that throws is reported to onError and the rest still run
     * @param message - The message to publish
     */
    publish (message: T) {
        this.#observers.forEach((observer) => {
            try {
                observer(message);
            } catch (error) {
                this.#onError(error);
            }
        });
    }
}
