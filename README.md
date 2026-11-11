# Notifier

State management for React built on plain TypeScript classes.

You write a class that holds some state and the methods that change it. Notifier
turns that class into React hooks: one hook to read the state, one to call the
methods. On top of that you get selectors (values computed from other state, sync
or async) and typed events.

[![npm version](https://badge.fury.io/js/%40eleven-am%2Fnotifier.svg)](https://www.npmjs.com/package/@eleven-am/notifier)
![License](https://img.shields.io/github/license/eleven-am/notifier)

```bash
npm install @eleven-am/notifier
```

Requires React 18 or 19.

## Contents

- [The four building blocks](#the-four-building-blocks)
- [Quick start](#quick-start)
- [Notifiers](#notifiers)
- [Reading state in components](#reading-state-in-components)
- [Calling methods from components](#calling-methods-from-components)
- [Using a notifier outside React](#using-a-notifier-outside-react)
- [Local state per component](#local-state-per-component)
- [Selectors](#selectors)
- [Async selectors](#async-selectors)
- [Events](#events)
- [Starting and stopping resources](#starting-and-stopping-resources)
- [Errors](#errors)
- [Server rendering](#server-rendering)
- [API reference](#api-reference)
- [Rules to remember](#rules-to-remember)
- [Upgrading to 0.1](#upgrading-to-01)

## The four building blocks

| You want to… | Use | You get |
| --- | --- | --- |
| Keep shared state and the logic that changes it | `Notifier` | a state hook and an actions hook |
| Give every component its own copy of that state | `Notifier.createFactoryHook` | a hook that creates one instance per component |
| Compute a value from one or more notifiers, or load data based on them | `selector` | a hook for the value and a hook for its loading/error status |
| Broadcast one-off messages ("message received", "typing") | `EventNotifier` | everything a notifier has, plus typed events |

## Quick start

```tsx
import { Notifier } from '@eleven-am/notifier';

interface CounterState {
  count: number;
}

class CounterNotifier extends Notifier<CounterState> {
  increment() {
    this.updateState({ count: this.state.count + 1 });
  }
}

const counter = new CounterNotifier({ count: 0 });

export const useCounter = counter.createStateHook();
export const useCounterActions = counter.createActionsHook();

function Counter() {
  const count = useCounter((state) => state.count);
  const { increment } = useCounterActions();

  return <button onClick={increment}>Clicked {count} times</button>;
}
```

Every component that calls `useCounter` sees the same count, and re-renders when
it changes.

## Notifiers

A notifier is a class that extends `Notifier<State>`.

```ts
interface UserState {
  name: string;
  age: number;
}

class UserNotifier extends Notifier<UserState> {
  setName(name: string) {
    this.updateState({ name });
  }

  async load(id: string) {
    const user = await api.getUser(id);
    this.updateState(user);
  }
}

export const userNotifier = new UserNotifier({ name: '', age: 0 });
```

- **State is an object.** The constructor throws for anything else (a number,
  an array, `null`).
- **`this.state`** reads the current state. It is `protected`: only the class
  itself can read or write it, so all changes go through your methods.
- **`this.updateState(partial)`** merges the fields you pass into the current
  state (a shallow merge) and notifies everyone listening.
- **`this.state = next`** replaces the whole state and notifies everyone.
- **State is immutable.** Always pass new objects and arrays. If you mutate the
  current object in place, listeners are not told anything changed.
- **Methods can be async.** Call `updateState` whenever you have data; there is
  nothing special to set up.

## Reading state in components

`createStateHook()` returns a hook. Call it with a function that picks what the
component needs:

```tsx
const useUser = userNotifier.createStateHook();

function Greeting() {
  const name = useUser((state) => state.name);
  return <p>Hello {name}</p>;
}

function Profile() {
  const { name, age } = useUser((state) => ({ name: state.name, age: state.age }));
  return <p>{name}, {age}</p>;
}

function Everything() {
  const user = useUser();
  return <pre>{JSON.stringify(user)}</pre>;
}
```

The component re-renders only when the value your function returns actually
changes. Values are compared by content, not by reference: arrays, plain objects,
Maps, Sets, Dates and RegExps are compared deeply. So a function that builds a new
object every time, like `Profile` above, is fine: the component keeps getting the
same object until something in it changes, which also keeps it safe to use in
`useEffect` and `useMemo` dependencies.

## Calling methods from components

`createActionsHook()` returns a hook that gives you the notifier's public methods,
already bound, so you can pass them around directly:

```tsx
const useUserActions = userNotifier.createActionsHook();

function NameInput() {
  const { setName } = useUserActions();
  return <input onChange={(event) => setName(event.target.value)} />;
}
```

- The object is the same on every render, so it is safe in dependency arrays.
- It contains your public methods only. Methods whose name starts with `_`,
  getters and setters, and the built-in methods (`subscribe`, `reset`,
  `createStateHook`, `updateState`, the lifecycle hooks, `onError`) are left out.
- The actions hook never causes a re-render.

## Using a notifier outside React

A notifier is a plain object, so you can use it anywhere:

```ts
const unsubscribe = userNotifier.subscribe((state) => {
  console.log('user changed', state);
});

userNotifier.setName('Ada');

unsubscribe();
```

- `subscribe(listener)` calls `listener` with the new state after every change and
  returns an unsubscribe function (safe to call more than once).
- `getSnapshot(notifierOrSelector)` returns the current value of any notifier or
  selector:

  ```ts
  import { getSnapshot } from '@eleven-am/notifier';

  const { name } = getSnapshot(userNotifier);
  ```

- `reset()` puts the state back to the value the notifier was created with.

## Local state per component

A normal notifier is shared: every component sees the same state. When each
component needs its own copy, for example one per card in a list, use a factory
hook:

```tsx
const useCard = UserNotifier.createFactoryHook({ name: 'New card', age: 0 });

function Card() {
  const { state, actions } = useCard((state) => state.name);

  return <input value={state} onChange={(event) => actions.setName(event.target.value)} />;
}

function Cards() {
  return (
    <>
      <Card />
      <Card />
    </>
  );
}
```

Each `Card` gets its own `UserNotifier`, created when the component mounts and
kept for as long as it stays mounted. The arguments you pass to
`createFactoryHook` are used for every instance and are fixed when you create the
hook. If the arguments need to change, create instances yourself with
`UserNotifier.build(...)` and keep them where you need them.

## Selectors

A selector computes a value from one or more notifiers (or other selectors). Read
sources with `get`:

```tsx
import { selector } from '@eleven-am/notifier';

const cartTotal = selector((get) => {
  const { items } = get(cartNotifier);
  const { rate } = get(taxNotifier);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return { subtotal, total: subtotal * (1 + rate) };
});

export const useCartTotal = cartTotal.createStateHook();

function Total() {
  const total = useCartTotal((value) => value.total);
  return <p>{total.toFixed(2)}</p>;
}
```

How a selector behaves:

- **It starts when first used**, the first time a component, a subscriber or
  `getSnapshot` reads it, not when you create it.
- **It recomputes when a source it read changes.** Sources are whatever you passed
  to `get` during the last run. If a later run stops reading a source (for example
  behind an `if`), changes to that source no longer trigger it.
- **It only notifies when the result changes.** Results are compared by content,
  the same way as the state hook.
- **It stops when nobody uses it.** When the last subscriber leaves, it releases
  its sources, and it starts again the next time it is read.
- **Selectors can read other selectors**: `get(cartTotal)` works inside another
  selector.
- **It can write to a notifier** with its second argument, `set(notifier, state)`,
  which replaces that notifier's state. Use this sparingly; methods on the
  notifier are usually clearer.

The selector object also works outside React: `subscribe(listener)`,
`getSnapshot()`, `getStatus()`, `subscribeStatus(listener)` and `destroy()`.

## Async selectors

Make the function `async` to load data from the current state. The third argument
is an `AbortSignal`:

```tsx
const searchResults = selector(async (get, set, signal) => {
  const { query } = get(searchNotifier);
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });

  return response.json() as Promise<SearchResult[]>;
});

const useSearchResults = searchResults.createStateHook();
const useSearchStatus = searchResults.createStatusHook();

function Search() {
  const results = useSearchResults();
  const { pending, error } = useSearchStatus();

  if (error) return <p>Search failed.</p>;
  if (!results) return <p>Searching…</p>;

  return <ResultList items={results} pending={pending} />;
}
```

- **The value starts as `undefined`** and stays that way until the first run
  finishes. The type says so: `useSearchResults()` returns
  `SearchResult[] | undefined`. Plain `subscribe` listeners only ever receive
  finished results.
- **Only the newest run counts.** If the query changes while a request is still
  running, that request's `signal` is aborted and its result is ignored. Passing
  `signal` to `fetch` cancels the request itself.
- **Status:** `createStatusHook()` (or `getStatus()`) returns
  `{ pending, error }`. `pending` is `true` while a run is in progress.
- **A failed run keeps the last good value.** `error` is set, the previous result
  stays on screen, and the next successful run clears the error. The same applies
  to a sync selector that throws.

## Events

`EventNotifier` is a notifier that can also send typed, one-off messages. Use it
for things that happen, as opposed to things that are:

```tsx
import { EventNotifier } from '@eleven-am/notifier';

interface ChatState {
  messages: string[];
}

interface ChatEvents {
  messageReceived: string;
  typing: { userId: string };
}

class ChatNotifier extends EventNotifier<ChatState, ChatEvents> {
  receive(message: string) {
    this.updateState({ messages: [...this.state.messages, message] });
    this.emit('messageReceived', message);
  }

  typing(userId: string) {
    this.emit('typing', { userId });
  }
}

const chat = new ChatNotifier({ messages: [] });
const useChatEvents = chat.createEventsHook();

function TypingIndicator() {
  const [typing, setTyping] = useState<string | null>(null);

  useChatEvents('typing', ({ userId }) => setTyping(userId));

  return typing ? <p>{typing} is typing…</p> : null;
}
```

- `this.emit(event, payload)` sends an event; it is `protected`, so only the
  class can send.
- `createEventsHook()` gives a hook that listens while the component is mounted.
  The callback can change between renders without resubscribing.
- `notifier.on(event, callback)` listens outside React and returns an unsubscribe
  function.
- Events are not stored. A listener only receives events sent after it started
  listening. Anything a component needs to show later belongs in state.

## Starting and stopping resources

Override `onFirstSubscriber` and `onLastSubscriber` to open a resource only while
someone is using the notifier:

```ts
class LivePricesNotifier extends Notifier<PricesState> {
  private socket?: WebSocket;

  protected onFirstSubscriber() {
    this.socket = new WebSocket('/prices');
    this.socket.onmessage = (event) => this.updateState(JSON.parse(event.data));
  }

  protected onLastSubscriber() {
    this.socket?.close();
    this.socket = undefined;
  }
}
```

Every mounted component using the state hook and every `subscribe()` call counts
as a subscriber. Re-renders do not.

## Errors

A listener that throws cannot break anything else: the method that changed the
state still completes, and every other listener still gets the update. The error
goes to `onError`, which logs it with `console.error` by default. Override it to
send errors somewhere else:

```ts
class CartNotifier extends Notifier<CartState> {
  protected onError(error: unknown) {
    monitoring.report(error);
  }
}
```

This covers state listeners and event listeners. Errors inside selectors are
reported through the selector's status instead (see
[Async selectors](#async-selectors)).

## Server rendering

When the server renders with data the client must start from, set it once in the
notifier with the protected `serverState` setter:

```ts
class UserNotifier extends Notifier<UserState> {
  hydrate(user: UserState) {
    this.serverState = user;
  }
}
```

The first value set becomes both the server snapshot used during hydration and
the current state; later calls are ignored. Without it, the server snapshot is the
initial state.

## API reference

### `Notifier<State>`

| Member | Who uses it | What it does |
| --- | --- | --- |
| `new MyNotifier(initialState)` | you | creates a shared instance |
| `MyNotifier.build(...args)` | you | same as `new`, typed for subclasses |
| `MyNotifier.createFactoryHook(...args)` | components | hook returning `{ state, actions }` for a per-component instance |
| `createStateHook()` | components | hook: `useX()` or `useX(state => picked)` |
| `createActionsHook()` | components | hook returning the bound public methods |
| `subscribe(listener)` | outside React | listen to changes; returns unsubscribe |
| `reset()` | anyone | back to the initial state |
| `this.state` / `this.state = next` | the class | read / replace state |
| `this.updateState(partial)` | the class | shallow-merge and notify |
| `this.serverState = value` | the class | set the hydration state once |
| `onFirstSubscriber()` / `onLastSubscriber()` | override | start / stop resources |
| `onError(error)` | override | where listener errors go (default `console.error`) |

### `EventNotifier<State, Events>`

Everything in `Notifier`, plus:

| Member | What it does |
| --- | --- |
| `this.emit(event, payload)` | send an event (class only) |
| `on(event, callback)` | listen; returns unsubscribe |
| `createEventsHook()` | hook: `useEvents(event, callback)` |

### `selector(fn)`

`fn(get, set, signal)` returns a value or a promise.

| Member | What it does |
| --- | --- |
| `createStateHook()` | hook: `useX()` or `useX(value => picked)` |
| `createStatusHook()` | hook returning `{ pending, error }` |
| `subscribe(listener)` | listen to new results; returns unsubscribe |
| `subscribeStatus(listener)` | listen to status changes |
| `getSnapshot()` | current value (starts the selector if needed) |
| `getStatus()` | current `{ pending, error }` |
| `getServerSnapshot()` | value computed from the notifiers' server state |
| `destroy()` | stop now: abort a running request, release all sources |

### Other exports

- `getSnapshot(notifierOrSelector)`: current value of any notifier or selector.
- Types: `UseNotifierHook`, `UseEventHook`, `Subscriber`, `Unsubscribe`,
  `Selector`, `SelectorStatus`, `ErrorHandler`.

## Rules to remember

1. Change state only inside the notifier, with `updateState` or `this.state = …`.
2. Never mutate state in place; always create new objects and arrays.
3. Create notifiers and hooks once, at module level, not inside components.
4. Shared state: a notifier instance. Per-component state: `createFactoryHook`.
5. Derived or loaded data: a selector. Pass its `signal` to `fetch`.
6. Things that happen: events. Things that are: state.
7. Handle the `undefined` first value of async selectors.

## Upgrading to 0.1

0.1.0 fixes several bugs and changes three behaviours:

- **`onError` is now a built-in hook.** If one of your notifiers already has a
  public method called `onError`, rename it: it now receives listener errors and is
  no longer part of the actions.
- **Async selectors are typed `T | undefined`** for their value. This was always
  true at runtime; TypeScript now makes you handle it.
- **Selectors start when first used**, not when created. A selector that nothing
  reads no longer runs, so do not rely on one for side effects.

Also fixed: components could miss an update that happened while they were
mounting; a throwing listener broke the method that changed state; every
re-render restarted selectors (async selectors refetched on each render); inline
pick functions returned a new object every render; old async runs were never
cancelled; selectors kept listening to sources they no longer read. Comparisons
are about twice as fast, and the package is compiled for ES2022.

## License

MIT © [Roy OSSAI](https://github.com/eleven-am)
