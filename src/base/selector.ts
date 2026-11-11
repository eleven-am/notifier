import { useSyncExternalStore } from 'react';

import { BaseNotifier } from './base';
import { useSelected } from './useSelected';
import { Subject, Subscriber, Unsubscribe } from '../subjects/subject';
import { deepCompare } from '../utils/deepCompare';

export interface SelectorStatus {
    pending: boolean;
    error: unknown | null;
}

type SelectorFunc<State, ReturnType> = (state: State) => ReturnType;
type UseNotifierHook<State> = <ReturnType = State>(selector?: SelectorFunc<State, ReturnType>) => ReturnType;
type Source<State> = BaseNotifier<State & object> | Selector<any, State>;
type GetFunction = <NotifierState>(notifier: Source<NotifierState>) => Readonly<NotifierState>;
type SetFunction = <NotifierState extends object>(notifier: BaseNotifier<NotifierState>, state: NotifierState) => void;
type SelectorHandler<ReturnedState> = (get: GetFunction, set: SetFunction, signal: AbortSignal) => Promise<ReturnedState> | ReturnedState;

export interface Selector<Value, State = Value> {
    subscribe (subscriber: Subscriber<Value>): Unsubscribe;
    subscribeStatus (subscriber: Subscriber<SelectorStatus>): Unsubscribe;
    getStatus (): SelectorStatus;
    getSnapshot (): State;
    getServerSnapshot (): State;
    createStateHook (): UseNotifierHook<State>;
    createStatusHook (): () => SelectorStatus;
    destroy (): void;
}

type SelectorOf<Result> = [Result] extends [Promise<infer Value>] ? Selector<Value, Value | undefined> : Selector<Result>;

const identity = <State>(state: State): State => state;

function getNotifierState<T> (notifier: Source<T>): T {
    if (notifier instanceof BaseNotifier) {
        return (notifier as unknown as { state: T }).state;
    }

    return notifier.getSnapshot();
}

function getNotifierServerState<T> (notifier: Source<T>): T {
    if (notifier instanceof BaseNotifier) {
        return (notifier as unknown as { serverState: T }).serverState;
    }

    return notifier.getServerSnapshot();
}

function setNotifierState<T extends object> (notifier: BaseNotifier<T>, state: T): void {
    (notifier as unknown as { state: T }).state = state;
}

/**
 * Derives state from notifiers and other selectors. Sources read through `get` are tracked
 * per run; the selector starts on first use, recomputes when a source changes, stops listening
 * to sources it no longer reads, and releases its sources when its last subscriber leaves.
 * An async selector receives an AbortSignal that is aborted when a newer run starts or the
 * selector is destroyed, and its value is undefined until the first run resolves.
 */
export function selector<Result> (selectorFn: (get: GetFunction, set: SetFunction, signal: AbortSignal) => Result): SelectorOf<Result>;
export function selector<ReturnedState> (selectorFn: (get: GetFunction, set: SetFunction, signal: AbortSignal) => Promise<ReturnedState>): Selector<ReturnedState, ReturnedState | undefined>;
export function selector<ReturnedState> (selectorFn: SelectorHandler<ReturnedState>): Selector<ReturnedState, ReturnedState | undefined> {
    type State = ReturnedState | undefined;

    const sources = new Map<Source<any>, Unsubscribe>();
    const subject = new Subject<ReturnedState>();
    const statusSubject = new Subject<SelectorStatus>();

    let subscriberCount = 0;
    let needsInit = true;
    let serverReady = false;
    let run: AbortController | null = null;
    let inFlight: AbortController | null = null;
    let serverRun: object | null = null;
    let returnedState: State;
    let serverState: State;
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

    function onSourceChange (): void {
        if (needsInit) {
            return;
        }

        compute(); // eslint-disable-line @typescript-eslint/no-use-before-define
    }

    function track (source: Source<any>): void {
        if (!sources.has(source)) {
            sources.set(source, source.subscribe(onSourceChange));
        }
    }

    function prune (reads: Set<Source<any>>): void {
        sources.forEach((unsubscribe, source) => {
            if (!reads.has(source)) {
                sources.delete(source);
                unsubscribe();
            }
        });
    }

    function settle (state: ReturnedState, reads: Set<Source<any>>): void {
        setStatus({
            pending: false,
            error: null,
        });
        prune(reads);

        if (!deepCompare(returnedState, state)) {
            returnedState = state;
            subject.publish(state);
        }
    }

    function fail (error: unknown): void {
        setStatus({
            pending: false,
            error,
        });
    }

    function abortInFlight (): void {
        inFlight?.abort();
        inFlight = null;
    }

    function compute (): void {
        abortInFlight();

        const current = new AbortController();
        const reads = new Set<Source<any>>();
        const get: GetFunction = (source) => {
            if (run === current) {
                reads.add(source);
                track(source);
            }

            return getNotifierState(source);
        };

        run = current;

        let result: Promise<ReturnedState> | ReturnedState;

        try {
            result = selectorFn(get, set, current.signal);
        } catch (error) {
            if (run === current) {
                fail(error);
            }

            return;
        }

        if (run !== current) {
            return;
        }

        if (!(result instanceof Promise)) {
            settle(result, reads);

            return;
        }

        inFlight = current;
        setStatus({
            pending: true,
            error: null,
        });

        result.then(
            (state) => {
                if (run === current) {
                    inFlight = null;
                    settle(state, reads);
                }
            },
            (error: unknown) => {
                if (run === current) {
                    inFlight = null;
                    fail(error);
                }
            },
        );
    }

    function computeServer (): void {
        const current = {};
        const get: GetFunction = (source) => getNotifierServerState(source);

        serverRun = current;

        let result: Promise<ReturnedState> | ReturnedState;

        try {
            result = selectorFn(get, set, new AbortController().signal);
        } catch {
            return;
        }

        if (!(result instanceof Promise)) {
            serverState = result;

            return;
        }

        result.then(
            (state) => {
                if (serverRun === current) {
                    serverState = state;
                }
            },
            () => undefined,
        );
    }

    function ensureInitialised (): void {
        if (!needsInit) {
            return;
        }

        needsInit = false;
        compute();
    }

    function destroy (): void {
        abortInFlight();
        run = null;
        serverRun = null;
        sources.forEach((unsubscribe) => unsubscribe());
        sources.clear();
        needsInit = true;
        serverReady = false;
        setStatus({
            pending: false,
            error: null,
        });
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

    function getSnapshot (): State {
        ensureInitialised();

        return returnedState;
    }

    function getServerSnapshot (): State {
        if (!serverReady) {
            serverReady = true;
            computeServer();
        }

        return serverState;
    }

    function getStatus (): SelectorStatus {
        ensureInitialised();

        return status;
    }

    const subscribeToResult = (callback: () => void): Unsubscribe => subscribeResult(() => callback());
    const subscribeToStatus = (callback: () => void): Unsubscribe => subscribeStatus(() => callback());

    function useSelectorState<Selected = State> (selectFn?: SelectorFunc<State, Selected>): Selected {
        return useSelected(subscribeToResult, getSnapshot, getServerSnapshot, selectFn ?? (identity as SelectorFunc<State, Selected>));
    }

    function useSelectorStatus (): SelectorStatus {
        return useSyncExternalStore(subscribeToStatus, getStatus, getStatus);
    }

    return {
        subscribe: subscribeResult,
        subscribeStatus,
        getStatus,
        getSnapshot,
        getServerSnapshot,
        createStateHook: () => useSelectorState,
        createStatusHook: () => useSelectorStatus,
        destroy,
    };
}

export const getSnapshot: GetFunction = (notifier) => getNotifierState(notifier);
