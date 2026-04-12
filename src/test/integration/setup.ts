/**
 * Shared setup for integration tests.
 * Configures MSW server with NuGet API handlers.
 */
import { setupServer } from 'msw/node';
import { nugetHandlers } from './msw-handlers';

/**
 * MSW server instance shared across all integration tests.
 * Start in beforeAll, reset handlers in afterEach, close in afterAll.
 */
export const server = setupServer(...nugetHandlers);

/**
 * Standard test lifecycle hooks for integration tests.
 * Call these in your test file's beforeAll/afterEach/afterAll.
 */
export function setupIntegrationTest() {
    beforeAll(() => {
        server.listen({ onUnhandledRequest: 'warn' });
    });

    afterEach(() => {
        server.resetHandlers();
    });

    afterAll(() => {
        server.close();
    });
}
