export {
    AssetsReader,
    assetsPathFor,
    computeTransitiveFrameworks,
    lockFilePathFor,
    type AssetsJson,
} from './assets';
export {
    BUILD_PROPS_FILE,
    BUILD_TARGETS_FILE,
    CENTRAL_PROPS_FILE,
    findCentralPropsPath,
    findFilesUpwards,
    findNearestFile,
    nearestStopDir,
    parseBooleanProperty,
    parseCentralPackageVersions,
    type CentralPackageVersion,
} from './central';
export {
    EvaluationError,
    MsBuildProjectEvaluator,
    type EvaluatorDeps,
} from './evaluator';
export {
    ProjectContextProvider,
    SDK_TOO_OLD_MESSAGE,
    type ProjectContextDeps,
    type ProjectContextResult,
} from './context';
export {
    PROJECT_FILE_EXCLUDE,
    PROJECT_FILE_GLOB,
    classifyProject,
    findProjects,
    type FileSearch,
    type ProjectKind,
    type WorkspaceFolderInfo,
} from './discovery';
export {
    StaticProjectInspector,
    UNSUPPORTED_MESSAGES,
    type InspectorOptions,
} from './inspector';
export { getProjectDependencyMap, getProjectReferences } from './references';
export { GLOBAL_JSON_FILE, computeRevision, revisionInputs } from './revision';
export {
    XmlParseError,
    attr,
    childText,
    elements,
    lastPropertyValue,
    parseMsBuildXml,
    rootProject,
    type XmlObject,
} from './xml';
