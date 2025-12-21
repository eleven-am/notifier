import { useEffect, useSyncExternalStore, useRef, useCallback } from 'react';

import { Subject, Unsubscribe, Subscriber } from '../subjects/subject';
import { deepCompare } from '../utils/deepCompare';

type ClassMethods<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? T[K] : never;
};

type PublicMethods<T> = Omit<ClassMethods<T>, keyof BaseNotifier<any>>;

type UseActorsHook<Class extends BaseNotifier<any>> = () => PublicMethods<Class>;

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

export class BaseNotifier<Data> {
    readonly #subject: Subject<Data>;

    readonly #initialState: Data;

    readonly #actors: PublicMethods<this>;

    #serverState: Data | null;

    #state: Data;

    constructor (initialState: Data) {
        if (typeof initialState !== 'object' || initialState === null || Array.isArray(initialState)) {
            throw new Error('Notifier state must be a non-null object');
        }

        this.#initialState = initialState;
        this.#state = initialState;
        this.#serverState = null;
        this.#subject = new Subject<Data>();
        this.#actors = this.#getPublicMethods();
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
        return <ReturnType>(selector: SelectorFunc<Data, ReturnType> = defaultSelector) => {
            const selectorRef = useRef(selector);
            const clientStateRef = useRef(selectorRef.current(this.state));
            const getSnapshot = useCallback(() => clientStateRef.current, []);
            const serverStateRef = useRef(selectorRef.current(this.serverState));
            const getServerSnapshot = useCallback(() => serverStateRef.current, []);

            const subscribe = useCallback((callback: () => void) => this.#subject.subscribe((state) => {
                const newState = selectorRef.current(state);

                if (deepCompare(clientStateRef.current, newState)) {
                    return;
                }

                clientStateRef.current = newState;
                callback();
            }), []);

            useEffect(() => {
                selectorRef.current = selector;
            }, [selector]);

            return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        };
    }

    reset (): void {
        this.state = this.#initialState;
    }

    createActionsHook (): UseActorsHook<this> {
        return () => this.#actors;
    }

    subscribe (subscriber: Subscriber<Data>): Unsubscribe {
        return this.#subject.subscribe(subscriber);
    }

    protected updateState (state: Partial<Data>): void {
        this.state = {
            ...this.state,
            ...state,
        };
    }

    #getPublicMethods (): PublicMethods<this> {
        const objectPrototype = Object.getPrototypeOf({});
        const objectKeys = Reflect.ownKeys(objectPrototype);
        const methods = new Set<string>();

        const isAccessor = (prop: string, obj: object): boolean => {
            const descriptor = Object.getOwnPropertyDescriptor(obj, prop);

            return Boolean(descriptor && (descriptor.get || descriptor.set));
        };

        const collectMethods = (obj: object | null): void => {
            if (!obj) {
                return;
            }

            const proto = Reflect.getPrototypeOf(obj);

            if (!proto) {
                return;
            }

            Reflect.ownKeys(proto)
                .map((k) => k.toString())
                .filter((name) => !objectKeys.includes(name))
                .filter((name) => !isAccessor(name, proto))
                .forEach((k) => methods.add(k));

            collectMethods(proto);
        };

        collectMethods(this);

        const baseClassMethods = [
            'reset',
            'subscribe',
            'createStateHook',
            'createActionsHook',
            'updateState',
        ];

        const methodNames = Array.from(methods)
            .filter((k) => !k.startsWith('#') && !k.startsWith('_') && k !== 'constructor')
            .filter((k) => !baseClassMethods.includes(k));

        const self = this as Record<string, unknown>;

        return methodNames
            .filter((name) => typeof self[name] === 'function')
            .reduce((acc, name) => {
                const method = self[name] as (...args: unknown[]) => unknown;

                (acc as Record<string, unknown>)[name] = method.bind(this);

                return acc;
            }, {} as PublicMethods<this>);
    }
}
