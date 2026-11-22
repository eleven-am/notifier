import { useRef } from 'react';

import { useSelected } from './useSelected';
import { Subject, Unsubscribe, Subscriber } from '../subjects/subject';

type MethodKeys<T> = {
    [K in keyof T]-?: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type PublicMethodKeys<T> = Exclude<MethodKeys<T>, keyof BaseNotifier<any>>;

type PublicMethods<T> = Pick<T, PublicMethodKeys<T>>;

type UseActionsHook<Actions> = () => Actions;

type SelectorFunc<State, ReturnType> = (state: State) => ReturnType;

export type UseNotifierHook<Data> = <ReturnType = Data>(selector?: SelectorFunc<Data, ReturnType>) => ReturnType;

type InstanceOf<T> = T extends { prototype: infer R } ? R : never;
type IgnoreConstructor<T> = Pick<T, keyof T>;
type Subclass = IgnoreConstructor<typeof BaseNotifier>;
type ConstructorParams<Class> = Class extends new (...args: infer Params) => any ? Params : never;
type SubClassData<Sub extends Subclass> = InstanceOf<Sub> extends BaseNotifier<infer Data> ? Data : never;

type UseFactoryHook<Sub extends Subclass> =
    <ReturnType = SubClassData<Sub>>(selector?: SelectorFunc<SubClassData<Sub>, ReturnType>) =>
    { state: ReturnType, actions: PublicMethods<InstanceOf<Sub>> };

const defaultSelector: SelectorFunc<any, any> = (state) => state;

export class BaseNotifier<Data extends object> {
    readonly #subject: Subject<Data>;

    readonly #initialState: Data;

    #actors: PublicMethods<this> | null;

    #serverState: Data | null;

    #state: Data;

    readonly #subscribeHook = (callback: () => void): Unsubscribe => this.subscribe(() => callback());

    readonly #read = (): Data => this.#state;

    readonly #readServer = (): Data => this.serverState;

    readonly #useState: UseNotifierHook<Data> = <ReturnType>(selector: SelectorFunc<Data, ReturnType> = defaultSelector) => useSelected(this.#subscribeHook, this.#read, this.#readServer, selector);

    constructor (initialState: Data) {
        if (typeof initialState !== 'object' || initialState === null || Array.isArray(initialState)) {
            throw new Error('Notifier state must be a non-null object');
        }

        this.#initialState = initialState;
        this.#state = initialState;
        this.#serverState = null;
        this.#subject = new Subject<Data>((error) => this.onError(error));
        this.#actors = null;
    }

    protected get serverState (): Readonly<Data> {
        return this.#serverState ?? this.#initialState;
    }

    protected set serverState (state: Data) {
        if (this.#serverState !== null) {
            return;
        }

        this.#serverState = state;
        this.#state = state;
    }

    protected get state (): Readonly<Data> {
        return this.#state;
    }

    protected set state (state: Data) {
        this.#state = state;
        this.#subject.publish(state);
    }

    /**
     * Creates a React hook that provides a component-scoped notifier instance.
     * The instance is created once per component mount and persists across re-renders.
     * Note: params are captured at hook creation time and changes to params will not
     * recreate the instance. For dynamic params, use `build()` with your own state management.
     */
    static createFactoryHook <SubClass extends Subclass> (this: SubClass, ...params: ConstructorParams<SubClass>): UseFactoryHook<SubClass> {
        return <ReturnType>(selector?: SelectorFunc<SubClassData<SubClass>, ReturnType>) => {
            const instanceRef = useRef<InstanceOf<SubClass> | null>(null);

            if (instanceRef.current === null) {
                instanceRef.current = this.build(...params);
            }

            const state = instanceRef.current.createStateHook()(selector);
            const actions = instanceRef.current.createActionsHook()();

            return {
                state: state as ReturnType,
                actions,
            };
        };
    }

    static build <SubClass extends Subclass> (this: SubClass, ...params: ConstructorParams<SubClass>): InstanceOf<SubClass> {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return new this(...params);
    }

    createStateHook (): UseNotifierHook<Data> {
        return this.#useState;
    }

    reset (): void {
        this.state = this.#initialState;
    }

    createActionsHook (): UseActionsHook<PublicMethods<this>>;

    createActionsHook <Key extends PublicMethodKeys<this>> (...methodNames: Key[]): UseActionsHook<Pick<PublicMethods<this>, Key>>;

    createActionsHook (...methodNames: PropertyKey[]): () => object {
        let actions: object;

        if (methodNames.length === 0) {
            this.#actors ??= this.#getPublicMethods();
            actions = this.#actors;
        } else {
            actions = this.#bindMethods(methodNames);
        }

        return () => actions;
    }

    subscribe (subscriber: Subscriber<Data>): Unsubscribe {
        const wasEmpty = this.#subject.size === 0;
        const unsubscribe = this.#subject.subscribe(subscriber);

        if (wasEmpty) {
            try {
                this.onFirstSubscriber();
            } catch (error) {
                unsubscribe();
                throw error;
            }
        }

        return () => {
            if (!unsubscribe()) {
                return;
            }

            if (this.#subject.size === 0) {
                this.onLastSubscriber();
            }
        };
    }

    protected onFirstSubscriber (): void {}

    protected onLastSubscriber (): void {}

    /**
     * Receives any error a subscriber or event listener throws, so one failing listener
     * never breaks the action that changed state or the other listeners.
     * Defaults to console.error; override to route errors elsewhere.
     */
    protected onError (error: unknown): void {
        console.error(error);
    }

    protected updateState (state: Partial<Data>): void {
        this.state = {
            ...this.state,
            ...state,
        };
    }

    #getPublicMethods (): PublicMethods<this> {
        const methods = new Set<PropertyKey>();
        const baseClassMethods = new Set<PropertyKey>(Reflect.ownKeys(BaseNotifier.prototype));
        const collectMethods = (target: object): void => {
            Reflect.ownKeys(target).forEach((name) => {
                const descriptor = Object.getOwnPropertyDescriptor(target, name);

                if (descriptor && typeof descriptor.value === 'function') {
                    methods.add(name);
                }
            });
        };

        collectMethods(this);

        let prototype = Reflect.getPrototypeOf(this);

        while (prototype && prototype !== BaseNotifier.prototype && prototype !== Object.prototype) {
            collectMethods(prototype);
            prototype = Reflect.getPrototypeOf(prototype);
        }

        const methodNames = Array.from(methods)
            .filter((name) => name !== 'constructor')
            .filter((name) => typeof name !== 'string' || (!name.startsWith('#') && !name.startsWith('_')))
            .filter((name) => !baseClassMethods.has(name));

        return this.#bindMethods(methodNames) as PublicMethods<this>;
    }

    #bindMethods (methodNames: PropertyKey[]): object {
        const actions: Record<PropertyKey, unknown> = {};
        const baseClassMethods = new Set<PropertyKey>(Reflect.ownKeys(BaseNotifier.prototype));

        Array.from(new Set(methodNames)).forEach((name) => {
            const hidden = typeof name === 'string' && (name.startsWith('#') || name.startsWith('_'));
            const method = this.#findMethod(name);

            if (hidden || baseClassMethods.has(name) || method === null) {
                throw new Error(`Notifier action "${String(name)}" must be a callable public method`);
            }

            Object.defineProperty(actions, name, {
                configurable: false,
                enumerable: true,
                value: method.bind(this),
                writable: false,
            });
        });

        return Object.freeze(actions);
    }

    #findMethod (name: PropertyKey): ((...args: unknown[]) => unknown) | null {
        const ownDescriptor = Object.getOwnPropertyDescriptor(this, name);

        if (ownDescriptor) {
            return typeof ownDescriptor.value === 'function' ? ownDescriptor.value : null;
        }

        let prototype = Reflect.getPrototypeOf(this);

        while (prototype) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, name);

            if (descriptor) {
                return typeof descriptor.value === 'function' ? descriptor.value : null;
            }

            prototype = Reflect.getPrototypeOf(prototype);
        }

        return null;
    }
}
