import { useCallback, useRef, useSyncExternalStore } from 'react';

import { Unsubscribe } from '../subjects/subject';
import { deepCompare } from '../utils/deepCompare';

const UNSET = Symbol('unset');

interface Selection<State, Selected> {
    source: State | typeof UNSET;
    select: ((state: State) => Selected) | null;
    value: Selected | typeof UNSET;
}

function emptySelection<State, Selected> (): Selection<State, Selected> {
    return {
        source: UNSET,
        select: null,
        value: UNSET,
    };
}

function choose<State, Selected> (selection: Selection<State, Selected>, source: State, select: (state: State) => Selected): Selected {
    if (selection.value !== UNSET && selection.source === source && selection.select === select) {
        return selection.value;
    }

    const next = select(source);

    selection.source = source;
    selection.select = select;

    if (selection.value === UNSET || !deepCompare(selection.value, next)) {
        selection.value = next;
    }

    return selection.value;
}

/**
 * Shared React binding for notifiers and selectors: subscribes once, reads the current
 * state on every snapshot, and returns the same reference while the selected value is
 * deeply equal. `subscribe` must keep the same identity for the lifetime of the store.
 */
export function useSelected<State, Selected> (
    subscribe: (callback: () => void) => Unsubscribe,
    read: () => State,
    readServer: () => State,
    select: (state: State) => Selected,
): Selected {
    const selectRef = useRef(select);
    const clientRef = useRef<Selection<State, Selected>>(emptySelection());
    const serverRef = useRef<Selection<State, Selected>>(emptySelection());

    selectRef.current = select;

    const getSnapshot = useCallback(() => choose(clientRef.current, read(), selectRef.current), [read]);
    const getServerSnapshot = useCallback(() => choose(serverRef.current, readServer(), selectRef.current), [readServer]);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
