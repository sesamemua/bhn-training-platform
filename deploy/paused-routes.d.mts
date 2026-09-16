// Types for deploy/paused-routes.mjs (plain ESM so the build script can
// run it without a compile step). Keep in step with that file.

export type PauseEnv = Record<string, string | undefined>;

export interface PauseDecision {
  pause: boolean;
  reason: string;
}

export interface PausedRedirect {
  source: string;
  destination: string;
  permanent: false;
}

export const PRODUCTION_PROJECT_ID: string;
export const MAIN_CHECKOUT: string;
export const PAUSED_ROUTE_FOLDERS: readonly string[];
export const KEPT_DYNAMIC_SIBLINGS: Readonly<Record<string, readonly string[]>>;
export const EXACT_PAUSED_PAGE_PATHS: readonly string[];
export const PAUSED_LANDING_PATH: string;
export const PAUSED_PAGE_PREFIXES: readonly string[];
export const PAUSED_API_PREFIXES: readonly string[];
export const PAUSED_PREFIX_EXCEPTIONS: readonly string[];

export function pauseDecision(env?: PauseEnv, cwd?: string): PauseDecision;
export function shouldPausePillars(env?: PauseEnv, cwd?: string): boolean;
export function isMainCheckout(cwd: string): boolean;
export function pausedFoldersPresent(cwd?: string): string[];
export function folderToUrlPrefix(folder: string): string;
export function pausedPagePrefixesEnvValue(): string;
export function pausedApiPrefixesEnvValue(): string;
export function pausedRedirects(): PausedRedirect[];
export function pausedPillarsBuildConfig(
  env?: PauseEnv,
  cwd?: string,
): {
  active: boolean;
  reason: string;
  redirects: PausedRedirect[];
  env: {
    NEXT_PUBLIC_PAUSED_PREFIXES: string;
    NEXT_PUBLIC_PAUSED_API_PREFIXES: string;
  };
};
