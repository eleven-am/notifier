import { useRef, useSyncExternalStore } from 'react';

import { BaseNotifier } from './base';
import { Subject, Subscriber, Unsubscribe } from '../subjects/subject';
import { deepCompare } from '../utils/deepCompare';

export interface SelectorStatus {
    pending: boolean;
    error: unknown | null;
}

type SelectorHook<State> = ReturnType<typeof selector<State>>;
type SelectorFunc<State, ReturnType> = (state: State) => ReturnType;
type UseNotifierHook<State> = <ReturnType = State>(selector?: SelectorFunc<State, ReturnType>) => ReturnType;
type GetFunction = <NotifierState>(notifier: BaseNotifier<NotifierState & object> | SelectorHook<NotifierState>) => Readonly<NotifierState>;
type SetFunction = <NotifierState extends object>(notifier: BaseNotifier<NotifierState>, state: NotifierState) => void;
type SelectorHandler<ReturnedState> = (get: GetFunction, set: SetFunction) => Promise<ReturnedState> | ReturnedState;

function getNotifierState<T> (notifier: BaseNotifier<T & object> | SelectorHook<T>): T {
    if (notifier instanceof BaseNotifier) {
        return (notifier as unknown as { state: T }).state;
    }

    return notifier.getSnapshot();
}

function getNotifierServerState<T> (notifier: BaseNotifier<T & object> | SelectorHook<T>): T {
    if (notifier instanceof BaseNotifier) {
        return (notifier as unknown as { serverState: T }).serverState;
    }

    return notifier.getServerSnapshot();
}

function setNotifierState<T extends object> (notifier: BaseNotifier<T>, state: T): void {
    (notifier as unknown as { state: T }).state = state;
}

export function selector<ReturnedState> (selectorFn: SelectorHandler<ReturnedState>) {
    const notifiers = new Set<BaseNotifier<any> | SelectorHook<any>>();
    const unsubscribes: Unsubscribe[] = [];
    const subject = new Subject<ReturnedState>();
    const statusSubject = new Subject<SelectorStatus>();

    let version = 0;
    let subscriberCount = 0;
    let needsInit = false;
    let returnedState: ReturnedState;
    let serverState: ReturnedState;
    let status: SelectorStatus = Object.freeze({
        pending: false,
        error: null,
    });

    function set<NotifierState extends object> (notifier: BaseNotifier<NotifierState>, state: NotifierState): void {
        setNotifierState(notifier, state);
    }

    function setStatus (nextStatus: SelectorStatus): void {
        if (status.pending === nextStatus.pending && status.error === nextStatus.error) {
            return;
        }

        status = Object.freeze(nextStatus);
        statusSubject.publish(status);
    }

    function handleAsyncResult (promise: Promise<ReturnedState>, currentVersion: number, isServer: boolean): void {
        if (!isServer) {
            setStatus({
                pending: true,
                error: null,
            });
        }

        promise
            .then((state) => {
                if (version !== currentVersion) {
                    return;
                }

                if (isServer) {
                    serverState = state;
                } else {
                    setStatus({
                        pending: false,
                        error: null,
                    });

                    if (!deepCompare(returnedState, state)) {
                        returnedState = state;
                        subject.publish(state);
                    }
                }
            })
            .catch((error: unknown) => {
                if (!isServer && version === currentVersion) {
                    setStatus({
                        pending: false,
                        error,
                    });
                }
            });
    }

    function subscribeToNotifier (notifier: BaseNotifier<any> | SelectorHook<any>): void {
        if (notifiers.has(notifier)) {
            return;
        }

        notifiers.add(notifier);

        const unsubscribe = notifier.subscribe(() => {
            version++;
            const currentVersion = version;

            const result = selectorFn(get, set); // eslint-disable-line @typescript-eslint/no-use-before-define

            if (result instanceof Promise) {
                handleAsyncResult(result, currentVersion, false);
            } else {
                setStatus({
                    pending: false,
                    error: null,
                });

                if (!deepCompare(returnedState, result)) {
                    returnedState = result;
                    subject.publish(result);
                }
            }
        });

        unsubscribes.push(unsubscribe);
    }

    function get<NotifierState> (notifier: BaseNotifier<NotifierState & object> | SelectorHook<NotifierState>): Readonly<NotifierState> {
        subscribeToNotifier(notifier);

        return getNotifierState(notifier);
    }

    function getServer<NotifierState> (notifier: BaseNotifier<NotifierState & object> | SelectorHook<NotifierState>): Readonly<NotifierState> {
        subscribeToNotifier(notifier);

        return getNotifierServerState(notifier);
    }

    function initialiseValues (): void {
        const currentVersion = version;
        const serverResult = selectorFn(getServer, set);
        const clientResult = selectorFn(get, set);

        if (serverResult instanceof Promise) {
            handleAsyncResult(serverResult, currentVersion, true);
        } else {
            serverState = serverResult;
        }

        if (clientResult instanceof Promise) {
            handleAsyncResult(clientResult, currentVersion, false);
        } else {
            returnedState = clientResult;
            subject.publish(clientResult);
        }
    }

    function destroy (): void {
        version++;
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        unsubscribes.length = 0;
        notifiers.clear();
        needsInit = true;
        setStatus({
            pending: false,
            error: null,
        });
    }

    function ensureInitialised (): void {
        if (!needsInit) {
            return;
        }

        initialiseValues();
        needsInit = false;
    }

    function retain (): void {
        ensureInitialised();
        subscriberCount += 1;
    }

    function release (): void {
        subscriberCount -= 1;

        if (subscriberCount === 0) {
            destroy();
        }
    }

    function subscribeResult (subscriber: Subscriber<ReturnedState>): Unsubscribe {
        retain();
        const unsubscribe = subject.subscribe(subscriber);

        return () => {
            if (!unsubscribe()) {
                return;
            }

            release();
        };
    }

    function subscribeStatus (subscriber: Subscriber<SelectorStatus>): Unsubscribe {
        retain();
        const unsubscribe = statusSubject.subscribe(subscriber);

        return () => {
            if (!unsubscribe()) {
                return;
            }

            release();
        };
    }

    const subscribeToStatus = (callback: () => void): Unsubscribe => subscribeStatus(() => callback());
    const getStatus = (): SelectorStatus => status;

    initialiseValues();

    return {
        subscribe: subscribeResult,
        subscribeStatus,
        getStatus,
        getServerSnapshot: () => {
            ensureInitialised();

            return serverState;
        },
        getSnapshot: () => {
            ensureInitialised();

            return returnedState;
        },
        createStateHook: (): UseNotifierHook<ReturnedState> => <ReturnType>(selectorFunc?: SelectorFunc<ReturnedState, ReturnType>): ReturnType => {
            const selectorFuncRef = useRef(selectorFunc);
            const clientStateRef = useRef(
                selectorFunc
                    ? selectorFunc(returnedState)
                    : returnedState as unknown as ReturnType,
            );
            const serverStateRef = useRef(
                selectorFunc
                    ? selectorFunc(serverState)
                    : serverState as unknown as ReturnType,
            );

            if (selectorFuncRef.current !== selectorFunc) {
                selectorFuncRef.current = selectorFunc;
                clientStateRef.current = selectorFunc
                    ? selectorFunc(returnedState)
                    : returnedState as unknown as ReturnType;
                serverStateRef.current = selectorFunc
                    ? selectorFunc(serverState)
                    : serverState as unknown as ReturnType;
            }

            const subscribe = (callback: () => void) => subscribeResult((state) => {
                const newState = selectorFuncRef.current
                    ? selectorFuncRef.current(state)
                    : state as unknown as ReturnType;

                if (deepCompare(clientStateRef.current, newState)) {
                    return;
                }

                clientStateRef.current = newState;
                callback();
            });

            const getSnapshot = () => clientStateRef.current;
            const getServerSnapshot = () => serverStateRef.current;

            return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        },
        createStatusHook: () => () => useSyncExternalStore(subscribeToStatus, getStatus, getStatus),
        destroy,
    };
}

export const getSnapshot: GetFunction = (notifier) => getNotifierState(notifier);
