import { useSyncExternalStore } from 'react';

import { BaseNotifier } from './base';
import { Subject, Unsubscribe } from '../subjects/subject';
import { deepCompare } from '../utils/deepCompare';

type SelectorHook<State> = ReturnType<typeof selector<State>>;
type SelectorFunc<State, ReturnType> = (state: State) => ReturnType;
type UseNotifierHook<State> = <ReturnType = State>(selector?: SelectorFunc<State, ReturnType>) => ReturnType;
type GetFunction = <NotifierState>(notifier: BaseNotifier<NotifierState> | SelectorHook<NotifierState>) => Readonly<NotifierState>;
type SetFunction = <NotifierState>(notifier: BaseNotifier<NotifierState>, state: NotifierState) => void;
type SelectorHandler<ReturnedState> = (get: GetFunction, set: SetFunction) => Promise<ReturnedState> | ReturnedState;

function getNotifierState<T> (notifier: BaseNotifier<T> | SelectorHook<T>): T {
    if (notifier instanceof BaseNotifier) {
        return (notifier as unknown as { state: T }).state;
    }

    return notifier.getSnapshot();
}

function getNotifierServerState<T> (notifier: BaseNotifier<T> | SelectorHook<T>): T {
    if (notifier instanceof BaseNotifier) {
        return (notifier as unknown as { serverState: T }).serverState;
    }

    return notifier.getServerSnapshot();
}

function setNotifierState<T> (notifier: BaseNotifier<T>, state: T): void {
    (notifier as unknown as { state: T }).state = state;
}

export function selector<ReturnedState> (selectorFn: SelectorHandler<ReturnedState>) {
    const notifiers = new Set<BaseNotifier<unknown> | SelectorHook<unknown>>();
    const unsubscribes: Unsubscribe[] = [];
    const subject = new Subject<ReturnedState>();

    let version = 0;
    let subscriberCount = 0;
    let needsInit = false;
    let returnedState: ReturnedState;
    let serverState: ReturnedState;

    function set<NotifierState> (notifier: BaseNotifier<NotifierState>, state: NotifierState): void {
        setNotifierState(notifier, state);
    }

    function handleAsyncResult (promise: Promise<ReturnedState>, currentVersion: number, isServer: boolean): void {
        promise
            .then((state) => {
                if (version !== currentVersion) {
                    return;
                }

                if (isServer) {
                    serverState = state;
                } else if (!deepCompare(returnedState, state)) {
                    returnedState = state;
                    subject.publish(state);
                }
            })
            .catch(() => undefined);
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
            } else if (!deepCompare(returnedState, result)) {
                returnedState = result;
                subject.publish(result);
            }
        });

        unsubscribes.push(unsubscribe);
    }

    function get<NotifierState> (notifier: BaseNotifier<NotifierState> | SelectorHook<NotifierState>): Readonly<NotifierState> {
        subscribeToNotifier(notifier);

        return getNotifierState(notifier);
    }

    function getServer<NotifierState> (notifier: BaseNotifier<NotifierState> | SelectorHook<NotifierState>): Readonly<NotifierState> {
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
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        unsubscribes.length = 0;
        notifiers.clear();
        needsInit = true;
    }

    function ensureInitialised (): void {
        if (!needsInit) {
            return;
        }

        initialiseValues();
        needsInit = false;
    }

    initialiseValues();

    return {
        subscribe: subject.subscribe.bind(subject),
        getServerSnapshot: () => serverState,
        getSnapshot: () => returnedState,
        createStateHook: (): UseNotifierHook<ReturnedState> => <ReturnType>(selectorFunc?: SelectorFunc<ReturnedState, ReturnType>): ReturnType => {
            let clientState = selectorFunc
                ? selectorFunc(returnedState)
                : returnedState as unknown as ReturnType;

            const currentServerState = selectorFunc
                ? selectorFunc(serverState)
                : serverState as unknown as ReturnType;

            const subscribe = (callback: () => void) => {
                ensureInitialised();
                subscriberCount += 1;

                const unsubscribe = subject.subscribe((state) => {
                    const newState = selectorFunc
                        ? selectorFunc(state)
                        : state as unknown as ReturnType;

                    if (deepCompare(clientState, newState)) {
                        return;
                    }

                    clientState = newState;
                    callback();
                });

                return () => {
                    unsubscribe();
                    subscriberCount -= 1;
                    if (subscriberCount === 0) {
                        destroy();
                    }
                };
            };

            const getSnapshot = () => clientState;
            const getServerSnapshot = () => currentServerState;

            return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        },
        destroy,
    };
}

export const getSnapshot: GetFunction = (notifier) => getNotifierState(notifier);
