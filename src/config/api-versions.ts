/**
 * API version registry. Single place to see supported versions, default, and deprecation.
 * Used by the api route aggregator and optional version/deprecation middleware.
 */

export type ApiVersionId = "v1" | "v2";

export interface ApiVersionConfig {
  id: ApiVersionId;
  deprecated?: boolean;
  sunsetDate?: string; // ISO date when version will be removed
  deprecationMessage?: string;
  linkSuccessor?: ApiVersionId; // preferred successor version
}

export const API_VERSIONS: ApiVersionConfig[] = [
  {
    id: "v1",
    deprecated: false,
  },
  // When adding v2:
  // { id: "v2", deprecated: false },
];

export const SUPPORTED_VERSIONS: ApiVersionId[] = API_VERSIONS.map((v) => v.id);

export const DEFAULT_API_VERSION: ApiVersionId = "v1";

export function isVersionDeprecated(version: ApiVersionId): boolean {
  return API_VERSIONS.find((v) => v.id === version)?.deprecated ?? false;
}

export function getVersionConfig(version: ApiVersionId): ApiVersionConfig | undefined {
  return API_VERSIONS.find((v) => v.id === version);
}
