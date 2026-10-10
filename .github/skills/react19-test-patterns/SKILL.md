---
name: react19-test-patterns
description: 'React 19 test compatibility patterns for Vitest and React Testing Library, preserving StrictMode behavior and cleanup assertions.'
---

# React 19 Test Migration Patterns

Reference for all test file migrations required by React 19.

## Priority Order

Fix test files in this order; each layer depends on the previous:

1. **`act` import**  fix first, it unblocks everything else
2. **`Simulate` → `fireEvent`**  fix immediately after act
3. **Full react-dom/test-utils cleanup**  remove remaining imports
4. **StrictMode call counts**  measure actual, don't guess
5. **Async act wrapping**  for remaining "not wrapped in act" warnings
6. **Custom render helper**  verify once per codebase, not per test

---

## 1. act() Import Fix

```jsx
// Before (deprecated import):
import { act } from 'react-dom/test-utils';

// After:
import { act } from 'react';
```

If mixed with other test-utils imports:
```jsx
// Before:
import { act, Simulate, renderIntoDocument } from 'react-dom/test-utils';

// After  split the imports:
import { act } from 'react';
import { fireEvent, render } from '@testing-library/react'; // replaces Simulate + renderIntoDocument
```

---

## 2. Simulate → fireEvent

```jsx
// Before  Simulate REMOVED in React 19:
import { Simulate } from 'react-dom/test-utils';
Simulate.click(element);
Simulate.change(input, { target: { value: 'hello' } });
Simulate.submit(form);
Simulate.keyDown(element, { key: 'Enter', keyCode: 13 });

// After:
import { fireEvent } from '@testing-library/react';
fireEvent.click(element);
fireEvent.change(input, { target: { value: 'hello' } });
fireEvent.submit(form);
fireEvent.keyDown(element, { key: 'Enter', keyCode: 13 });
```

---

## 3. react-dom/test-utils Full API Map

| Old (react-dom/test-utils) | New location |
|---|---|
| `act` | `import { act } from 'react'` |
| `Simulate` | `fireEvent` from `@testing-library/react` |
| `renderIntoDocument` | `render` from `@testing-library/react` |
| `findRenderedDOMComponentWithTag` | `getByRole`, `getByTestId` from RTL |
| `findRenderedDOMComponentWithClass` | `getByRole` or `container.querySelector` |
| `scryRenderedDOMComponentsWithTag` | `getAllByRole` from RTL |
| `isElement`, `isCompositeComponent` | Remove  not needed with RTL |
| `isDOMComponent` | Remove |

---

## 4. StrictMode Call Count Fixes

React 19 development StrictMode still re-runs renders and performs an extra
effect setup/cleanup cycle when enabled at the root. A subtree-only StrictMode
boundary does not re-run initial effects in the same way. Inspect the test's
render wrapper and cleanup before changing assertions; do not reduce expected
counts simply because the project uses React 19.

**Strategy: verify behavior, not just the observed count.**
```bash
npm run test:frontend -- path/to/Component.test.tsx
```

Test that subscriptions are cleaned up and events are handled once after the
setup/cleanup/setup sequence. Keep assertions for intentional StrictMode behavior.
Use Vitest and the repository's React Testing Library helpers, not Jest CLI flags.

See [React StrictMode](https://react.dev/reference/react/StrictMode) and
[useEffect troubleshooting](https://react.dev/reference/react/useEffect#my-effect-runs-twice-when-the-component-mounts).
