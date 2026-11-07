export const DEFAULT_BASE_URL = "";
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_TTL_MS = 2000;

export type SoundMode = "favorites" | "all";

export type GlobalSettings = {
	baseUrl?: string;
	token?: string;
	maxLines?: number;
	maxChars?: number;
};

export interface Sound {
	id: number;
	display_name: string;
	filename?: string;
	is_favorite?: boolean;
}

export type ApiErrorKind = "unconfigured" | "unauthorized" | "not_found" | "http" | "network";

export class SoundboredApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status?: number;

	constructor(kind: ApiErrorKind, message: string, status?: number) {
		super(message);
		this.name = "SoundboredApiError";
		this.kind = kind;
		this.status = status;
	}
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientConfig {
	baseUrl?: string;
	token?: string;
	timeoutMs?: number;
	fetchFn?: FetchLike;
}

/**
 * Normalizes the configured base URL by trimming whitespace and stripping trailing slashes
 * so `${baseUrl}/api/...` never produces `//api/...`.
 */
export function normalizeBaseUrl(rawUrl?: string): string {
	const trimmed = (rawUrl ?? "").trim();
	const effective = trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL;
	return effective.replace(/\/+$/, "");
}

/**
 * Validates settings and returns normalized `{ baseUrl, token }`, or throws `unconfigured`.
 */
export function resolveCredentials(config: ApiClientConfig): { baseUrl: string; token: string } {
	const baseUrl = normalizeBaseUrl(config.baseUrl);
	const token = (config.token ?? "").trim();
	if (!token || !baseUrl) {
		throw new SoundboredApiError("unconfigured", "Configure server URL and API token first");
	}
	return { baseUrl, token };
}

async function request(
	path: string,
	method: "GET" | "POST",
	config: ApiClientConfig
): Promise<Response> {
	const { baseUrl, token } = resolveCredentials(config);
	const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchFn: FetchLike = config.fetchFn ?? globalThis.fetch;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetchFn(`${baseUrl}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json"
			},
			signal: controller.signal
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new SoundboredApiError("network", `Network error or timeout: ${reason}`);
	} finally {
		clearTimeout(timer);
	}

	if (response.status === 401) {
		throw new SoundboredApiError("unauthorized", "Invalid API token — check plugin settings", 401);
	}

	if (response.status === 404) {
		throw new SoundboredApiError("not_found", `Resource not found (${path})`, 404);
	}

	if (!response.ok) {
		throw new SoundboredApiError("http", `Unexpected HTTP status ${response.status}`, response.status);
	}

	return response;
}

/**
 * GET /api/sounds/favorites
 */
export async function fetchFavorites(config: ApiClientConfig): Promise<Sound[]> {
	const response = await request("/api/sounds/favorites", "GET", config);
	const body = (await response.json()) as { data?: unknown };
	if (!body || !Array.isArray(body.data)) {
		return [];
	}
	return body.data as Sound[];
}

/**
 * GET /api/sounds (all sounds, sorted alphabetically by display_name for easier browsing)
 */
export async function fetchAllSounds(config: ApiClientConfig): Promise<Sound[]> {
	const response = await request("/api/sounds", "GET", config);
	const body = (await response.json()) as { data?: unknown };
	if (!body || !Array.isArray(body.data)) {
		return [];
	}
	const sounds = [...(body.data as Sound[])];
	sounds.sort((a, b) =>
		(a.display_name ?? "").localeCompare(b.display_name ?? "", "de", {
			sensitivity: "base",
			numeric: true
		})
	);
	return sounds;
}

/**
 * Fetches sounds according to the selected mode ("favorites" or "all").
 */
export async function fetchSoundsByMode(mode: SoundMode, config: ApiClientConfig): Promise<Sound[]> {
	return mode === "favorites" ? fetchFavorites(config) : fetchAllSounds(config);
}

/**
 * POST /api/sounds/:id/play
 */
export async function play(id: number, config: ApiClientConfig): Promise<void> {
	await request(`/api/sounds/${encodeURIComponent(String(id))}/play`, "POST", config);
}

/**
 * POST /api/sounds/random/play(?favorites=true)
 */
export async function playRandom(favoritesOnly: boolean, config: ApiClientConfig): Promise<void> {
	const query = favoritesOnly ? "?favorites=true" : "";
	await request(`/api/sounds/random/play${query}`, "POST", config);
}

/**
 * POST /api/sounds/stop
 */
export async function stop(config: ApiClientConfig): Promise<void> {
	await request("/api/sounds/stop", "POST", config);
}

/**
 * Creates a single-flight + short-TTL cached sounds loader (Section 7.2).
 */
export function createFavoritesLoader(options?: {
	ttlMs?: number;
	nowFn?: () => number;
	fetcher?: (config: ApiClientConfig, mode: SoundMode) => Promise<Sound[]>;
}) {
	const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
	const nowFn = options?.nowFn ?? Date.now;
	const fetcher = options?.fetcher ?? ((config, mode) => fetchSoundsByMode(mode, config));

	let inFlight: { key: string; promise: Promise<Sound[]> } | null = null;
	let cache: { at: number; key: string; data: Sound[] } | null = null;

	function cacheKey(config: ApiClientConfig, mode: SoundMode): string {
		return `${mode}|${normalizeBaseUrl(config.baseUrl)}|${(config.token ?? "").trim()}`;
	}

	return {
		async getFavorites(
			config: ApiClientConfig,
			forceRefresh = false,
			mode: SoundMode = "favorites"
		): Promise<Sound[]> {
			const key = cacheKey(config, mode);
			if (!forceRefresh && cache && cache.key === key && nowFn() - cache.at < ttlMs) {
				return cache.data;
			}
			if (!forceRefresh && inFlight && inFlight.key === key) {
				return inFlight.promise;
			}

			const promise = fetcher(config, mode)
				.then((data) => {
					cache = { at: nowFn(), key, data };
					return data;
				})
				.finally(() => {
					if (inFlight?.promise === promise) {
						inFlight = null;
					}
				});

			inFlight = { key, promise };
			return promise;
		},

		invalidate(): void {
			cache = null;
			inFlight = null;
		}
	};
}
