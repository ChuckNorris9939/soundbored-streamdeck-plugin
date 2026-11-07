import streamDeck, { type KeyDownEvent } from "@elgato/streamdeck";
import {
	createFavoritesLoader,
	DEFAULT_BASE_URL,
	DEFAULT_TTL_MS,
	fetchSoundsByMode,
	type GlobalSettings,
	play,
	type Sound,
	SoundboredApiError,
	type SoundMode
} from "./api.js";
import {
	calculatePageCount,
	clampPage,
	formatPageLabel,
	getSoundForSlot,
	nextPageIndex,
	orderSlots,
	prevPageIndex
} from "./paging.js";
import { DEFAULT_MAX_CHARS, formatTitle } from "./title.js";

export const DEFAULT_SLOT_MAX_LINES = 4;

export type KeyActionInstance = KeyDownEvent["action"];

export interface SlotEntry {
	id: string;
	action: KeyActionInstance;
	column: number;
	row: number;
	soundId?: number;
}

const slots = new Map<string, SlotEntry>();
const pageActions = new Map<string, KeyActionInstance>();
const modeActions = new Map<string, KeyActionInstance>();
const manualRefreshCallbacks = new Map<string, () => Promise<void>>();

let currentPage = 0;
let currentMode: SoundMode = "favorites";
let currentMaxLines = DEFAULT_SLOT_MAX_LINES;
let currentMaxChars = DEFAULT_MAX_CHARS;
let lastCredentialsKey = "";
let lastKnownSounds: Sound[] = [];
let lastLoadSucceeded = false;
let lastErrorLog: { message: string; at: number } | null = null;

export const favoritesLoader = createFavoritesLoader({
	fetcher: async (config, mode) => {
		const data = await fetchSoundsByMode(mode, config);
		streamDeck.logger.info(
			`Loaded ${data.length} sound(s) in mode '${mode}'`
		);
		return data;
	}
});

/**
 * Returns the currently active sound mode ("favorites" or "all").
 */
export function getCurrentMode(): SoundMode {
	return currentMode;
}

/**
 * Sets the active sound mode ("favorites" or "all") and re-renders if changed.
 */
export async function setCurrentMode(mode: SoundMode): Promise<void> {
	if (currentMode === mode) {
		await renderModeActions();
		return;
	}
	currentMode = mode;
	currentPage = 0;
	await renderModeActions();
	if (slots.size > 0 || pageActions.size > 0) {
		await refreshAndRender({ forceRefresh: false });
	}
}

/**
 * Reads global settings from Stream Deck, applying defaults if unset.
 */
export async function getEffectiveGlobalSettings(): Promise<GlobalSettings> {
	const raw = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	const maxLines =
		typeof raw.maxLines === "number" && Number.isFinite(raw.maxLines)
			? Math.max(1, Math.min(6, Math.round(raw.maxLines)))
			: DEFAULT_SLOT_MAX_LINES;
	const maxChars =
		typeof raw.maxChars === "number" && Number.isFinite(raw.maxChars)
			? Math.max(5, Math.min(16, Math.round(raw.maxChars)))
			: DEFAULT_MAX_CHARS;

	currentMaxLines = maxLines;
	currentMaxChars = maxChars;

	return {
		baseUrl: raw.baseUrl && raw.baseUrl.trim().length > 0 ? raw.baseUrl : DEFAULT_BASE_URL,
		token: raw.token ?? "",
		maxLines,
		maxChars
	};
}

function logDeduplicated(level: "warn" | "error", message: string): void {
	const now = Date.now();
	if (lastErrorLog && lastErrorLog.message === message && now - lastErrorLog.at < DEFAULT_TTL_MS) {
		return;
	}
	lastErrorLog = { message, at: now };
	if (level === "warn") {
		streamDeck.logger.warn(message);
	} else {
		streamDeck.logger.error(message);
	}
}

/**
 * Logs an API error according to Section 9 of the specification.
 */
export function logApiError(err: unknown, context?: "slot" | "random" | "stop" | "favorites" | "page" | "mode"): void {
	if (err instanceof SoundboredApiError) {
		switch (err.kind) {
			case "unconfigured":
				logDeduplicated("warn", "Configure server URL and API token first");
				return;
			case "unauthorized":
				logDeduplicated("error", "Invalid API token — check plugin settings");
				return;
			case "not_found":
				if (context === "random") {
					logDeduplicated("warn", "No sounds available to pick from");
				} else if (context === "slot") {
					logDeduplicated("warn", "Sound not found (404) — refreshing sounds");
				} else {
					logDeduplicated("warn", err.message);
				}
				return;
			case "network":
			case "http":
				logDeduplicated("error", err.message);
				return;
		}
	}
	const message = err instanceof Error ? err.message : String(err);
	logDeduplicated("error", `Unexpected error: ${message}`);
}

/**
 * Returns registered slots sorted top-to-bottom (`row`), then left-to-right (`column`).
 */
export function getOrderedSlots(): SlotEntry[] {
	return orderSlots(slots.values());
}

/**
 * Updates all visible Mode Toggle buttons (`Favs` vs `All`).
 */
export async function renderModeActions(): Promise<void> {
	const isAll = currentMode === "all";
	const stateIndex = isAll ? 1 : 0;
	const label = isAll ? "All" : "Favs";

	const promises: Promise<void>[] = [];
	for (const action of modeActions.values()) {
		promises.push(action.setState(stateIndex));
		promises.push(action.setTitle(label));
	}
	await Promise.allSettled(promises);
}

/**
 * Renders all currently visible slots and page indicator keys from `sounds`.
 */
export async function renderSlotsAndPages(sounds: readonly Sound[]): Promise<void> {
	const ordered = getOrderedSlots();
	const slotCount = ordered.length;
	const pageCount = calculatePageCount(sounds.length, slotCount);

	currentPage = clampPage(currentPage, pageCount);

	const titlePromises: Promise<void>[] = [];

	for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
		const entry = ordered[slotIndex];
		const sound = getSoundForSlot(sounds, currentPage, slotCount, slotIndex);

		if (sound) {
			entry.soundId = sound.id;
			titlePromises.push(
				entry.action.setTitle(formatTitle(sound.display_name, currentMaxChars, currentMaxLines))
			);
		} else {
			entry.soundId = undefined;
			titlePromises.push(entry.action.setTitle(""));
		}
	}

	const pageLabel = formatPageLabel(currentPage, pageCount);
	for (const pageAction of pageActions.values()) {
		titlePromises.push(pageAction.setTitle(pageLabel));
	}

	await Promise.allSettled(titlePromises);
}

/**
 * Clears all visible slot titles and sound assignments (used when loading fails).
 */
async function clearSlotsOnError(): Promise<void> {
	const promises: Promise<void>[] = [];
	for (const entry of slots.values()) {
		entry.soundId = undefined;
		promises.push(entry.action.setTitle(""));
	}
	for (const pageAction of pageActions.values()) {
		promises.push(pageAction.setTitle("1/1"));
	}
	await Promise.allSettled(promises);
}

let inFlightRefresh: Promise<boolean> | null = null;

/**
 * Fetches sounds for `currentMode` (using the single-flight + 2s TTL cache) and renders all visible slots and page keys.
 */
export async function refreshAndRender(options?: {
	forceRefresh?: boolean;
	alertAction?: KeyActionInstance;
}): Promise<boolean> {
	if (options?.forceRefresh) {
		favoritesLoader.invalidate();
	}

	if (!inFlightRefresh) {
		inFlightRefresh = (async () => {
			try {
				const settings = await getEffectiveGlobalSettings();
				lastCredentialsKey = `${settings.baseUrl ?? ""}|${settings.token ?? ""}`;
				const sounds = await favoritesLoader.getFavorites(
					settings,
					options?.forceRefresh ?? false,
					currentMode
				);
				lastKnownSounds = sounds;
				lastLoadSucceeded = true;
				return true;
			} catch (err) {
				lastLoadSucceeded = false;
				lastKnownSounds = [];
				logApiError(err, "favorites");
				await clearSlotsOnError();
				return false;
			} finally {
				inFlightRefresh = null;
			}
		})();
	}

	const ok = await inFlightRefresh;
	if (ok) {
		await renderSlotsAndPages(lastKnownSounds);
	} else if (options?.alertAction) {
		await options.alertAction.showAlert();
	}
	return ok;
}

/**
 * Registers a visible `slot` action instance and triggers a single-flight refresh & render.
 */
export async function registerSlot(action: KeyActionInstance, column: number, row: number): Promise<void> {
	slots.set(action.id, {
		id: action.id,
		action,
		column,
		row,
		soundId: undefined
	});
	await refreshAndRender({ alertAction: action });
}

/**
 * Unregisters a disappearing `slot` action instance.
 * Resets `currentPage` to 0 when all slots have disappeared (folder closed).
 */
export async function unregisterSlot(actionId: string): Promise<void> {
	slots.delete(actionId);
	if (slots.size === 0) {
		currentPage = 0;
	} else if (lastLoadSucceeded) {
		await renderSlotsAndPages(lastKnownSounds);
	}
}

/**
 * Handles pressing a `slot` key.
 */
export async function handleSlotPress(action: KeyActionInstance): Promise<void> {
	const entry = slots.get(action.id);
	if (!entry) {
		return;
	}

	// If sounds failed to load previously (e.g. bad token or offline), retry and show alert on failure
	if (!lastLoadSucceeded) {
		await refreshAndRender({ forceRefresh: true, alertAction: action });
		return;
	}

	// Pressing a blank key when sounds are loaded must do nothing at all
	if (entry.soundId === undefined) {
		return;
	}

	try {
		const settings = await getEffectiveGlobalSettings();
		await play(entry.soundId, settings);
		await action.showOk();
	} catch (err) {
		logApiError(err, "slot");
		await action.showAlert();

		// Section 9: 404 on a slot press -> showAlert(), then re-fetch and re-render
		if (err instanceof SoundboredApiError && err.kind === "not_found") {
			await refreshAndRender({ forceRefresh: true });
		}
	}
}

/**
 * Registers a visible `page` action instance.
 */
export async function registerPageAction(action: KeyActionInstance): Promise<void> {
	pageActions.set(action.id, action);
	await refreshAndRender({ alertAction: action });
}

/**
 * Unregisters a disappearing `page` action instance.
 */
export function unregisterPageAction(actionId: string): void {
	pageActions.delete(actionId);
}

/**
 * Handles pressing the `Next Page` key.
 */
export async function handlePagePress(action: KeyActionInstance): Promise<void> {
	const ok = await refreshAndRender({ alertAction: action });
	if (!ok) {
		return;
	}

	const slotCount = slots.size;
	const pageCount = calculatePageCount(lastKnownSounds.length, slotCount);
	currentPage = nextPageIndex(currentPage, pageCount);
	await renderSlotsAndPages(lastKnownSounds);
}

/**
 * Handles pressing the `Previous Page` key.
 */
export async function handlePrevPagePress(action: KeyActionInstance): Promise<void> {
	const ok = await refreshAndRender({ alertAction: action });
	if (!ok) {
		return;
	}

	const slotCount = slots.size;
	const pageCount = calculatePageCount(lastKnownSounds.length, slotCount);
	currentPage = prevPageIndex(currentPage, pageCount);
	await renderSlotsAndPages(lastKnownSounds);
}

/**
 * Registers a visible `mode` action instance (`Favs` / `All` toggle).
 */
export async function registerModeAction(action: KeyActionInstance): Promise<void> {
	modeActions.set(action.id, action);
	await renderModeActions();
}

/**
 * Unregisters a disappearing `mode` action instance.
 */
export function unregisterModeAction(actionId: string): void {
	modeActions.delete(actionId);
}

/**
 * Handles pressing the `Toggle Mode` (`Favs` / `All`) key.
 */
export async function handleModePress(action: KeyActionInstance): Promise<void> {
	const nextMode: SoundMode = currentMode === "favorites" ? "all" : "favorites";
	currentMode = nextMode;
	currentPage = 0;

	await renderModeActions();

	if (slots.size > 0 || pageActions.size > 0) {
		await refreshAndRender({ alertAction: action });
	}
}

/**
 * Formats a label using the current global maxChars and maxLines settings.
 */
export function formatWithCurrentSettings(label: string): string {
	return formatTitle(label, currentMaxChars, currentMaxLines);
}

/**
 * Registers a callback for a Manual Sound key so it re-renders when global text settings change.
 */
export function registerManualKey(id: string, renderFn: () => Promise<void>): void {
	manualRefreshCallbacks.set(id, renderFn);
}

/**
 * Unregisters a Manual Sound key callback.
 */
export function unregisterManualKey(id: string): void {
	manualRefreshCallbacks.delete(id);
}

async function renderManualKeys(): Promise<void> {
	await Promise.allSettled([...manualRefreshCallbacks.values()].map((fn) => fn()));
}

/**
 * Called when global settings (Server URL, API token, or title layout) are updated in the Property Inspector.
 */
export async function handleGlobalSettingsChanged(): Promise<void> {
	const settings = await getEffectiveGlobalSettings();
	const newCredsKey = `${settings.baseUrl ?? ""}|${settings.token ?? ""}`;
	const credsChanged = newCredsKey !== lastCredentialsKey;

	await renderManualKeys();

	if (!credsChanged && lastLoadSucceeded) {
		// Only maxLines / maxChars changed -> re-render existing sounds immediately without network request
		if (slots.size > 0 || pageActions.size > 0) {
			await renderSlotsAndPages(lastKnownSounds);
		}
		return;
	}

	favoritesLoader.invalidate();
	if (slots.size > 0 || pageActions.size > 0) {
		await refreshAndRender({ forceRefresh: true });
	}
}
