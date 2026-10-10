---
title: React 19 use() Hook Pattern Reference
---

# React 19 use()

`use` reads a Promise or context during component render. A pending Promise
suspends to the nearest Suspense boundary; a rejected Promise is handled by an
Error Boundary. `use` can be conditional, but must remain inside a component or
hook and must not be called inside a try/catch.

## Stable promises

Do not create a fresh Promise during render, including `use(fetch(url))`.
The same resource must supply the same Promise across render retries.
`useMemo` inside the suspending component is not a reliable Promise cache:
React can discard it when the initial mount suspends.

This example receives a stable Promise from its caller rather than fetching:

```tsx
import { Suspense, use } from 'react';

interface User {
  name: string;
}

function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <p>{user.name}</p>;
}

function Profile({ userPromise }: { userPromise: Promise<User> }) {
  return (
    <Suspense fallback={<p role="status">Loading profile...</p>}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

An outer Error Boundary must handle rejection. The caller owns Promise lifetime,
resource identity, invalidation, and retry behavior; `use` does not supply them.

## Repository applicability

nUIget already receives backend data through asynchronous webview messages and
manages explicit loading/error state. Do not replace this with `use` or add a
data-fetching library merely to modernize code. Context reads with `use` are
optional; existing `useContext` is valid.

See [React use](https://react.dev/reference/react/use).
