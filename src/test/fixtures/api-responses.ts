/**
 * Sample NuGet API responses for testing.
 * Shapes match the real NuGet V3 API exactly.
 */

/** Service index (https://api.nuget.org/v3/index.json) */
export const serviceIndex = {
    version: '3.0.0',
    resources: [
        { '@id': 'https://api.nuget.org/v3/registration5-semver1/', '@type': 'RegistrationsBaseUrl' },
        { '@id': 'https://api.nuget.org/v3-flatcontainer/', '@type': 'PackageBaseAddress/3.0.0' },
        { '@id': 'https://azuresearch-usnc.nuget.org/query', '@type': 'SearchQueryService' },
        { '@id': 'https://azuresearch-usnc.nuget.org/autocomplete', '@type': 'SearchAutocompleteService' },
    ],
};

/** Search result for "Newtonsoft.Json" */
export const searchResult = {
    totalHits: 1,
    data: [
        {
            id: 'Newtonsoft.Json',
            version: '13.0.3',
            description: 'Json.NET is a popular high-performance JSON framework for .NET',
            authors: ['James Newton-King'],
            totalDownloads: 3_500_000_000,
            verified: true,
            iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/icon',
            versions: [
                { version: '13.0.3', downloads: 500_000_000, '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.3.json' },
                { version: '13.0.2', downloads: 300_000_000, '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/13.0.2.json' },
                { version: '12.0.3', downloads: 200_000_000, '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/12.0.3.json' },
            ],
        },
    ],
};

/** Package metadata (registration) for Newtonsoft.Json 13.0.3 */
export const packageRegistration = {
    '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json',
    items: [
        {
            '@id': 'https://api.nuget.org/v3/registration5-semver1/newtonsoft.json/index.json#page/12.0.0/13.0.3',
            lower: '12.0.0',
            upper: '13.0.3',
            items: [
                {
                    catalogEntry: {
                        id: 'Newtonsoft.Json',
                        version: '13.0.3',
                        description: 'Json.NET is a popular high-performance JSON framework for .NET',
                        authors: 'James Newton-King',
                        licenseUrl: 'https://licenses.nuget.org/MIT',
                        projectUrl: 'https://www.newtonsoft.com/json',
                        iconUrl: 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/icon',
                        listed: true,
                        published: '2023-03-08T00:00:00+00:00',
                        dependencyGroups: [
                            {
                                targetFramework: '.NETStandard2.0',
                                dependencies: [],
                            },
                            {
                                targetFramework: 'net6.0',
                                dependencies: [],
                            },
                        ],
                    },
                },
            ],
        },
    ],
};

/** Version list (flat container) */
export const versionList = {
    versions: ['12.0.1', '12.0.2', '12.0.3', '13.0.1', '13.0.2', '13.0.3'],
};

/** Autocomplete result */
export const autocompleteResult = {
    totalHits: 3,
    data: ['Newtonsoft.Json', 'Newtonsoft.Json.Bson', 'Newtonsoft.Json.Schema'],
};

/** Vulnerability index entry */
export const vulnerabilityPage = [
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
