/**
 * MSW (Mock Service Worker) request handlers for NuGet v3 API endpoints.
 * Used by integration tests to intercept HTTP calls with realistic responses.
 */
import { http, HttpResponse } from 'msw';
import registrationResponse from '../fixtures/registration-response.json';
import searchResponse from '../fixtures/search-response.json';
import serviceIndex from '../fixtures/service-index.json';

const NUGET_API = 'https://api.nuget.org';
const NUGET_SEARCH = 'https://azuresearch-usnc.nuget.org';

/** Version list for flat container API */
const versionList = {
    versions: ['12.0.1', '12.0.2', '12.0.3', '13.0.1', '13.0.2', '13.0.3'],
};

/** Autocomplete data */
const autocompleteData = {
    totalHits: 3,
    data: ['Newtonsoft.Json', 'Newtonsoft.Json.Bson', 'Newtonsoft.Json.Schema'],
};

/** Vulnerability index */
const vulnerabilityIndex = [
    { '@name': 'vulnerability-2024', '@id': `${NUGET_API}/v3/vulnerability/2024.json` },
];

const vulnerabilityPage = [
    {
        'Newtonsoft.Json': [
            {
                url: 'https://github.com/advisories/GHSA-test-1234',
                severity: 2,
                versions: '(,13.0.2)',
            },
        ],
    },
];

/**
 * Default handlers that mock the full NuGet v3 API surface.
 * Override individual handlers in tests for error/edge-case scenarios.
 */
export const nugetHandlers = [
    // Service index
    http.get(`${NUGET_API}/v3/index.json`, () => {
        return HttpResponse.json(serviceIndex);
    }),

    // Search
    http.get(`${NUGET_SEARCH}/query`, ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get('q') ?? '';
        if (q.toLowerCase().includes('nonexistent')) {
            return HttpResponse.json({ totalHits: 0, data: [] });
        }
        return HttpResponse.json(searchResponse);
    }),

    // Autocomplete
    http.get(`${NUGET_SEARCH}/autocomplete`, ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get('q') ?? '';
        if (q.toLowerCase().includes('nonexistent')) {
            return HttpResponse.json({ totalHits: 0, data: [] });
        }
        return HttpResponse.json(autocompleteData);
    }),

    // Registration (package metadata)
    http.get(`${NUGET_API}/v3/registration5-semver1/:packageId/index.json`, ({ params }) => {
        const packageId = (params['packageId'] as string).toLowerCase();
        if (packageId === 'newtonsoft.json') {
            return HttpResponse.json(registrationResponse);
        }
        return new HttpResponse(null, { status: 404 });
    }),

    // Registration (specific version)
    http.get(`${NUGET_API}/v3/registration5-semver1/:packageId/:version.json`, ({ params }) => {
        const packageId = (params['packageId'] as string).toLowerCase();
        if (packageId === 'newtonsoft.json') {
            const entry = registrationResponse.items[0].items.find(
                (i) => i.catalogEntry.version === params['version'],
            );
            if (entry) {
                return HttpResponse.json(entry);
            }
        }
        return new HttpResponse(null, { status: 404 });
    }),

    // Flat container (versions list)
    http.get(`${NUGET_API}/v3-flatcontainer/:packageId/index.json`, ({ params }) => {
        const packageId = (params['packageId'] as string).toLowerCase();
        if (packageId === 'newtonsoft.json') {
            return HttpResponse.json(versionList);
        }
        return new HttpResponse(null, { status: 404 });
    }),

    // Vulnerability index
    http.get(`${NUGET_API}/v3/vulnerability/index.json`, () => {
        return HttpResponse.json(vulnerabilityIndex);
    }),

    // Vulnerability page
    http.get(`${NUGET_API}/v3/vulnerability/2024.json`, () => {
        return HttpResponse.json(vulnerabilityPage);
    }),
];

/**
 * Handler factories for customizing responses in specific tests.
 */
export function createSearchHandler(response: unknown) {
    return http.get(`${NUGET_SEARCH}/query`, () => {
        return HttpResponse.json(response);
    });
}

export function createServiceIndexErrorHandler(status = 500) {
    return http.get(`${NUGET_API}/v3/index.json`, () => {
        return new HttpResponse(null, { status });
    });
}

export function createRegistrationHandler(packageId: string, response: unknown) {
    return http.get(`${NUGET_API}/v3/registration5-semver1/${packageId.toLowerCase()}/index.json`, () => {
        return HttpResponse.json(response);
    });
}

export function createSlowHandler(url: string, delayMs: number) {
    return http.get(url, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return HttpResponse.json({});
    });
}
