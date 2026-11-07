import { describe, expect, it, vi } from "vitest";
import {
	createFavoritesLoader,
	DEFAULT_BASE_URL,
	fetchAllSounds,
	fetchFavorites,
	fetchSoundsByMode,
	normalizeBaseUrl,
	play,
	playRandom,
	SoundboredApiError,
	stop
} from "../src/api.js";

const TEST_BASE_URL = "https://soundbored.example.com";

describe("normalizeBaseUrl", () => {
	it("returns empty default when blank and strips trailing slashes", () => {
		expect(normalizeBaseUrl()).toBe(DEFAULT_BASE_URL);
		expect(normalizeBaseUrl("   ")).toBe(DEFAULT_BASE_URL);
		expect(normalizeBaseUrl("https://soundbored.example.com/")).toBe(TEST_BASE_URL);
		expect(normalizeBaseUrl("https://soundbored.example.com///")).toBe(TEST_BASE_URL);
	});
});

describe("API client requests and error handling", () => {
	it("throws unconfigured without calling fetch when token or baseUrl is empty", async () => {
		const fetchFn = vi.fn();
		await expect(fetchFavorites({ baseUrl: TEST_BASE_URL, token: "  ", fetchFn })).rejects.toMatchObject({
			kind: "unconfigured"
		});
		await expect(fetchFavorites({ baseUrl: "  ", token: "tok", fetchFn })).rejects.toMatchObject({
			kind: "unconfigured"
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("fetches favorites with Bearer header and normalized URL", async () => {
		const mockData = [{ id: 455, display_name: "Bitconnect" }];
		const fetchFn = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: mockData }), { status: 200 })
		);

		const res = await fetchFavorites({
			baseUrl: "https://soundbored.example.com/",
			token: "secret-token",
			fetchFn
		});

		expect(res).toEqual(mockData);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn.mock.calls[0][0]).toBe("https://soundbored.example.com/api/sounds/favorites");
		expect(fetchFn.mock.calls[0][1]?.headers).toMatchObject({
			Authorization: "Bearer secret-token"
		});
	});

	it("fetches all sounds via GET /api/sounds when mode is 'all'", async () => {
		const mockAll = [
			{ id: 1, display_name: "Sound A" },
			{ id: 2, display_name: "Sound B" }
		];
		const fetchFn = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ data: mockAll }), { status: 200 })
		);

		const res = await fetchSoundsByMode("all", {
			baseUrl: "https://soundbored.example.com/",
			token: "secret-token",
			fetchFn
		});

		expect(res).toEqual(mockAll);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(fetchFn.mock.calls[0][0]).toBe("https://soundbored.example.com/api/sounds");

		const directRes = await fetchAllSounds({
			baseUrl: TEST_BASE_URL,
			token: "secret-token",
			fetchFn: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockAll }), { status: 200 }))
		});
		expect(directRes).toEqual(mockAll);
	});

	it("treats HTTP 202 as success for play, playRandom, and stop", async () => {
		const fetchFn = vi.fn().mockImplementation(() =>
			Promise.resolve(new Response(JSON.stringify({ data: { status: "accepted" } }), { status: 202 }))
		);
		const config = { baseUrl: TEST_BASE_URL, token: "tok", fetchFn };

		await expect(play(455, config)).resolves.toBeUndefined();
		expect(fetchFn).toHaveBeenLastCalledWith(
			"https://soundbored.example.com/api/sounds/455/play",
			expect.objectContaining({ method: "POST" })
		);

		await expect(playRandom(true, config)).resolves.toBeUndefined();
		expect(fetchFn).toHaveBeenLastCalledWith(
			"https://soundbored.example.com/api/sounds/random/play?favorites=true",
			expect.objectContaining({ method: "POST" })
		);

		await expect(playRandom(false, config)).resolves.toBeUndefined();
		expect(fetchFn).toHaveBeenLastCalledWith(
			"https://soundbored.example.com/api/sounds/random/play",
			expect.objectContaining({ method: "POST" })
		);

		await expect(stop(config)).resolves.toBeUndefined();
		expect(fetchFn).toHaveBeenLastCalledWith(
			"https://soundbored.example.com/api/sounds/stop",
			expect.objectContaining({ method: "POST" })
		);
	});

	it("maps 401 to unauthorized and 404 to not_found", async () => {
		const fetch401 = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
		await expect(stop({ baseUrl: TEST_BASE_URL, token: "bad", fetchFn: fetch401 })).rejects.toMatchObject({
			kind: "unauthorized",
			status: 401
		});

		const fetch404 = vi.fn().mockResolvedValue(new Response("{}", { status: 404 }));
		await expect(play(999, { baseUrl: TEST_BASE_URL, token: "ok", fetchFn: fetch404 })).rejects.toMatchObject({
			kind: "not_found",
			status: 404
		});
	});

	it("maps network errors and timeouts to network kind", async () => {
		const fetchNetErr = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		await expect(stop({ baseUrl: TEST_BASE_URL, token: "ok", fetchFn: fetchNetErr })).rejects.toMatchObject({
			kind: "network"
		});

		const fetchHang = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
			return new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					reject(new Error("The operation was aborted"));
				});
			});
		});

		await expect(
			stop({ baseUrl: TEST_BASE_URL, token: "ok", timeoutMs: 20, fetchFn: fetchHang })
		).rejects.toBeInstanceOf(SoundboredApiError);
	});
});

describe("createFavoritesLoader single-flight and TTL cache", () => {
	it("collapses 18 concurrent calls into a single fetch and re-fetches after TTL", async () => {
		let now = 1000;
		const fetcher = vi.fn().mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 10));
			return [{ id: 1, display_name: "Sound 1" }];
		});

		const loader = createFavoritesLoader({
			ttlMs: 2000,
			nowFn: () => now,
			fetcher
		});

		const config = { baseUrl: TEST_BASE_URL, token: "tok" };

		// Simulate 18 slots firing onWillAppear simultaneously
		const results = await Promise.all(
			Array.from({ length: 18 }, () => loader.getFavorites(config))
		);

		expect(fetcher).toHaveBeenCalledTimes(1);
		for (const res of results) {
			expect(res).toEqual([{ id: 1, display_name: "Sound 1" }]);
		}

		// Within 2000ms TTL -> still 1 call
		now = 2500;
		await loader.getFavorites(config);
		expect(fetcher).toHaveBeenCalledTimes(1);

		// Past 2000ms TTL -> triggers a new fetch
		now = 3500;
		await loader.getFavorites(config);
		expect(fetcher).toHaveBeenCalledTimes(2);

		// Switching mode ("all") within TTL triggers a separate fetch for "all"
		await loader.getFavorites(config, false, "all");
		expect(fetcher).toHaveBeenCalledTimes(3);
	});
});
