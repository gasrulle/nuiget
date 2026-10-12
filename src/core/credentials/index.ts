export {
    DefaultCredentialProvider,
    FAILURE_TTL_MS,
    PLUGIN_TIMEOUT_MS,
    SUCCESS_TTL_MS,
    type CredentialProviderOptions,
} from './DefaultCredentialProvider';
export {
    TOKEN_USERNAME,
    basicAuthHeader,
    credentialForUrl,
    findCredentialPlugin,
    isAzureArtifactsUrl,
    isSupportedCredentialProviderHost,
    matchExternalFeedEndpoint,
    normalizeSourceUrl,
    parsePluginOutput,
    type UsernamePassword,
} from './helpers';
