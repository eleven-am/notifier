# Notifier

A powerful and type-safe state management solution for React applications, featuring class-based state management, selectors, and event handling.

[![npm version](https://badge.fury.io/js/%40eleven-am%2Fnotifier.svg)](https://www.npmjs.com/package/@eleven-am/notifier)
![License](https://img.shields.io/github/license/eleven-am/notifier)

## Features

- 🎯 **Type-safe**: Full TypeScript support with precise type inference
- 🏗️ **Class-based Architecture**: Clean and organized state management
- 🔄 **Selectors**: Compute derived state with memoization
- 📡 **Event System**: Built-in pub/sub pattern for component communication
- 🎣 **Custom Hooks**: Generate specialized hooks for state, actions, and events
- 🏭 **Factory Pattern**: Create local state instances from global notifiers
- 🔒 **Encapsulation**: Protected state access with controlled updates
- 🔌 **Resource Lifecycle**: Start and stop external resources with the first and last subscriber

## Installation

```bash
npm install @eleven-am/notifier
```

## Basic Usage

### 1. Create a Notifier

```typescript
import { Notifier } from '@eleven-am/notifier';

interface UserState {
  name: string;
  age: number;
}

class UserNotifier extends Notifier<UserState> {
  setName(name: string) {
    this.updateState({ name });
  }

  setAge(age: number) {
    this.updateState({ age });
  }
}

// Initialize with default state
const userNotifier = new UserNotifier({
  name: 'John Doe',
  age: 25
});
```

### 2. Create and Use Hooks

```typescript
// Create hooks for global state management
const useUser = userNotifier.createStateHook();
const useUserActions = userNotifier.createActionsHook();

// Use in components
function UserProfile() {
  // Optional transform function
  const { name, age } = useUser(state => ({
    name: state.name.toUpperCase(),
    age: state.age
  }));
  
  const { setName, setAge } = useUserActions();

  return (
    <div>
      <input 
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input 
        type="number"
        value={age}
        onChange={e => setAge(Number(e.target.value))}
      />
    </div>
  );
}
```

## Advanced Features

### Factory Pattern

The factory pattern allows you to create local instances of a notifier, enabling component-specific state management instead of global state. This is particularly useful when you need multiple independent instances of the same state structure:

```typescript
// Create a factory hook with initial state
const useUserFactory = UserNotifier.createFactoryHook({
  name: 'John Doe',
  age: 25
});

// Use in components for local state management
function UserCard() {
  // Each component gets its own instance of the state
  const { state, actions } = useUserFactory();
  const { name, age } = state;
  
  return (
    <div>
      <h2>{name}</h2>
      <p>Age: {age}</p>
      <button onClick={() => actions.setAge(age + 1)}>
        Birthday
      </button>
    </div>
  );
}

// Multiple instances with independent state
function UserList() {
  return (
    <div>
      <UserCard /> {/* Has its own state */}
      <UserCard /> {/* Has different independent state */}
      <UserCard /> {/* Has different independent state */}
    </div>
  );
}
```

The key differences between global and local state management:

```typescript
// Global State (shared across all components)
const globalUserNotifier = new UserNotifier({ name: 'John', age: 25 });
const useGlobalUser = globalUserNotifier.createStateHook();

// Local State (independent for each component)
const useLocalUser = UserNotifier.createFactoryHook({ name: 'John', age: 25 });

function App() {
  // These components share the same state
  return (
    <>
      <GlobalUserComponent />
      <GlobalUserComponent /> {/* Updates reflect in both components */}
    </>
  );
}

function LocalStateApp() {
  // These components have independent states
  return (
    <>
      <LocalUserComponent /> {/* Independent state */}
      <LocalUserComponent /> {/* Different independent state */}
    </>
  );
}
```

### Selectors

Create computed state derived from one or more notifiers:

```typescript
import { selector } from '@eleven-am/notifier';

const userDetailsSelector = selector((get, set) => {
  const user = get(userNotifier);
  const preferences = get(preferencesNotifier);
  
  return {
    fullName: `${user.name} (${preferences.nickname})`,
    isAdult: user.age >= 18
  };
});

// Create hook for the selector
const useUserDetails = userDetailsSelector.createStateHook();
```

Async selectors also expose their current execution status without replacing the
last successful value when a later calculation fails:

```typescript
const searchResults = selector(async (get) => {
  const { query } = get(searchNotifier);
  return api.search(query);
});

const useSearchResults = searchResults.createStateHook();
const useSearchStatus = searchResults.createStatusHook();

function SearchResults() {
  const results = useSearchResults();
  const { pending, error } = useSearchStatus();

  if (pending && !results) return <p>Searching…</p>;
  if (error) return <p>The latest search failed.</p>;

  return <Results items={results} />;
}
```

For non-React consumers, use `subscribeStatus()` and `getStatus()`. When no
result or status subscribers remain, the selector releases its upstream
subscriptions and reconnects automatically when it is used again.

### Subscriber Lifecycle

Notifiers that own an external resource can start it when the first direct or
React subscriber arrives and stop it after the last subscriber leaves:

```typescript
class ConnectionNotifier extends Notifier<ConnectionState> {
  private socket?: WebSocket;

  protected onFirstSubscriber() {
    this.socket = new WebSocket('/events');
  }

  protected onLastSubscriber() {
    this.socket?.close();
    this.socket = undefined;
  }
}
```

Each hook mount and direct `subscribe()` call participates in the same lifecycle.
The returned unsubscribe function is safe to call more than once.

### Event Notifier

Handle pub/sub events between components:

```typescript
import { EventNotifier } from '@eleven-am/notifier';

interface ChatState {
  messages: string[];
}

interface ChatEvents {
  messageReceived: string;
  typing: { userId: string };
}

class ChatNotifier extends EventNotifier<ChatState, ChatEvents> {
  addMessage(message: string) {
    this.updateState({
      messages: [...this.state.messages, message]
    });
    this.emit('messageReceived', message);
  }

  setTyping(userId: string) {
    this.emit('typing', { userId });
  }
}

// In components
function ChatRoom() {
  const { on } = useChatActions();
  
  // Method 1: Using the events hook
  useChatEvents('messageReceived', (message) => {
    console.log('New message:', message);
  });
  
  // Method 2: Using direct subscription
  useEffect(() => {
    const unsubscribe = on('typing', ({ userId }) => {
      console.log(`${userId} is typing...`);
    });
    
    return unsubscribe;
  }, [on]);
}
```

Events are transient, in-memory notifications. A new subscriber receives only
events emitted after it subscribes; persistent application data belongs in the
notifier state (or another durable store). Event subscriptions use the same
idempotent cleanup behavior as normal state subscriptions.

## Type Definitions

Key types for advanced usage:

```typescript
// Selector function type
type SelectorFunc<State, ReturnType> = (state: State) => ReturnType;

// Hook for accessing notifier state
type UseNotifierHook<State> = <ReturnType = State>(
  selector?: SelectorFunc<State, ReturnType>
) => ReturnType;

// Hook for accessing notifier methods
type UseActorsHook<Class extends Notifier<any>> = () => 
  PublicMethods<Class>;

// Event subscription callback
type Observer<Data> = (data: Data) => void;

// Event hook type
type UseEventHook<EventType> = <Event extends keyof EventType>(
  event: Event, 
  callback: (data: EventType[Event]) => void
) => void;
```

## Why Class-Based State Management?

The Notifier package leverages classes for state management, providing several key advantages over traditional object-based approaches:

### 1. Inheritance and Extension
```typescript
// Base authentication notifier with common functionality
class AuthNotifier extends Notifier<AuthState> {
  login(credentials: Credentials) {
    // Common login logic
  }
  
  logout() {
    // Common logout logic
  }
}

// Specialized authentication for different providers
class OAuth2Notifier extends AuthNotifier {
  login(credentials: OAuth2Credentials) {
    // OAuth2 specific logic
    super.login(credentials);
    this.handleTokenRefresh();
  }
  
  private handleTokenRefresh() {
    // Token refresh logic
  }
}

class BasicAuthNotifier extends AuthNotifier {
  login(credentials: BasicAuthCredentials) {
    // Basic auth specific logic
    super.login(credentials);
  }
}
```

### 2. Encapsulation and Privacy
```typescript
class UserNotifier extends Notifier<UserState> {
  private validateAge(age: number) {
    if (age < 0 || age > 150) {
      throw new Error('Invalid age');
    }
  }

  setAge(age: number) {
    this.validateAge(age);
    this.updateState({ age });
  }
  
  // State can only be modified through defined methods
  // No direct external state manipulation possible
}
```

### 3. Method Organization and Code Structure
```typescript
class ShoppingCartNotifier extends Notifier<CartState> {
  // Clear grouping of related functionality
  // Cart Items Management
  addItem(item: Product) { /* ... */ }
  removeItem(itemId: string) { /* ... */ }
  updateQuantity(itemId: string, quantity: number) { /* ... */ }
  
  // Cart Totals
  calculateSubtotal() { /* ... */ }
  calculateTax() { /* ... */ }
  calculateTotal() { /* ... */ }
  
  // Checkout Process
  beginCheckout() { /* ... */ }
  applyDiscount(code: string) { /* ... */ }
  completeTransaction() { /* ... */ }
}
```

### 4. Type Safety and Intellisense
```typescript
class ProductNotifier extends Notifier<ProductState> {
  // Methods and properties are properly typed
  // IDE provides excellent autocomplete and type checking
  updateStock(productId: string, quantity: number) {
    const product = this.state.products[productId];
    if (!product) throw new Error('Product not found');
    
    this.updateState({
      products: {
        ...this.state.products,
        [productId]: {
          ...product,
          stock: quantity
        }
      }
    });
  }
}
```

### 5. Testing and Mocking
```typescript
class ApiNotifier extends Notifier<ApiState> {
  protected api: ApiService;
  
  constructor(initialState: ApiState, api: ApiService) {
    super(initialState);
    this.api = api;
  }
  
  async fetchData() {
    const data = await this.api.getData();
    this.updateState({ data });
  }
}

// Easy to test with mock services
describe('ApiNotifier', () => {
  it('should fetch and update data', async () => {
    const mockApi = new MockApiService();
    const notifier = new ApiNotifier(initialState, mockApi);
    let currentData;
    const unsubscribe = notifier.subscribe((state) => {
      currentData = state.data;
    });

    await notifier.fetchData();

    expect(currentData).toEqual(expectedData);
    unsubscribe();
  });
});
```

### 6. Cross-Cutting Concerns
```typescript
class LoggingNotifier<T> extends Notifier<T> {
  protected updateState(state: Partial<T>) {
    console.log('State update:', state);
    super.updateState(state);
    console.log('New state:', this.state);
  }
}

// Easily add logging to any notifier
class UserNotifier extends LoggingNotifier<UserState> {
  // All state updates are automatically logged
  updateProfile(profile: Partial<UserState>) {
    this.updateState(profile);
  }
}
```

## Best Practices

1. **Global vs Local State**: Use regular notifier instances for global state and factory hooks for component-specific state
2. **State Updates**: Use `updateState` method for partial updates instead of directly setting state
3. **Event Cleanup**: Always unsubscribe from events in useEffect cleanup function
4. **Selector Memoization**: Use selectors for computed values that depend on multiple state sources
5. **Type Safety**: Leverage TypeScript interfaces for state and event types
6. **Encapsulation**: Keep state modifications within the notifier class methods
7. **Durability**: Treat events as transient signals; keep durable values in state or persistent storage

## Contributing

We welcome contributions! Please open an issue or submit a pull request on GitHub.

## License

MIT © [Roy OSSAI](https://github.com/eleven-am)
