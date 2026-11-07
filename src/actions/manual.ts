import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import { play } from "../api.js";
import {
	favoritesLoader,
	formatWithCurrentSettings,
	getEffectiveGlobalSettings,
	logApiError,
	registerManualKey,
	unregisterManualKey
} from "../state.js";

export type ManualSoundSettings = {
	soundId?: number;
	soundName?: string;
	customLabel?: string;
};

type ManualPIRequest = {
	action?: string;
	force?: boolean;
};

@action({ UUID: "com.soundbored.streamdeck.custom" })
export class ManualSoundAction extends SingletonAction<ManualSoundSettings> {
	private async renderKey(
		keyAction: KeyAction<ManualSoundSettings>,
		settings: ManualSoundSettings
	): Promise<void> {
		const rawLabel = (settings.customLabel ?? "").trim() || (settings.soundName ?? "").trim();
		if (!rawLabel) {
			await keyAction.setTitle("Select\nSound");
			return;
		}
		await keyAction.setTitle(formatWithCurrentSettings(rawLabel));
	}

	private async sendSoundListToPI(force = false): Promise<void> {
		try {
			const settings = await getEffectiveGlobalSettings();
			const sounds = await favoritesLoader.getFavorites(settings, force, "all");
			await streamDeck.ui.sendToPropertyInspector({
				event: "soundList",
				sounds: sounds.map((s) => ({
					id: s.id,
					display_name: s.display_name,
					is_favorite: !!s.is_favorite
				}))
			});
		} catch (err) {
			logApiError(err, "favorites");
			const msg = err instanceof Error ? err.message : String(err);
			await streamDeck.ui.sendToPropertyInspector({
				event: "soundListError",
				message: msg
			});
		}
	}

	override async onWillAppear(ev: WillAppearEvent<ManualSoundSettings>): Promise<void> {
		try {
			if (!ev.action.isKey()) {
				return;
			}
			await getEffectiveGlobalSettings();
			const keyAction = ev.action;
			registerManualKey(keyAction.id, async () => {
				const latestSettings = await keyAction.getSettings();
				await this.renderKey(keyAction, latestSettings);
			});
			await this.renderKey(keyAction, ev.payload.settings);
		} catch (err) {
			streamDeck.logger.error(`Error in ManualSoundAction.onWillAppear: ${String(err)}`);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent<ManualSoundSettings>): Promise<void> {
		try {
			unregisterManualKey(ev.action.id);
		} catch (err) {
			streamDeck.logger.error(`Error in ManualSoundAction.onWillDisappear: ${String(err)}`);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ManualSoundSettings>): Promise<void> {
		try {
			if (!ev.action.isKey()) {
				return;
			}
			await this.renderKey(ev.action, ev.payload.settings);
		} catch (err) {
			streamDeck.logger.error(`Error in ManualSoundAction.onDidReceiveSettings: ${String(err)}`);
		}
	}

	override async onPropertyInspectorDidAppear(
		_ev: PropertyInspectorDidAppearEvent<ManualSoundSettings>
	): Promise<void> {
		try {
			await this.sendSoundListToPI(false);
		} catch (err) {
			streamDeck.logger.error(`Error in ManualSoundAction.onPropertyInspectorDidAppear: ${String(err)}`);
		}
	}

	override async onSendToPlugin(
		ev: SendToPluginEvent<ManualPIRequest, ManualSoundSettings>
	): Promise<void> {
		try {
			if (ev.payload && typeof ev.payload === "object" && ev.payload.action === "loadSounds") {
				await this.sendSoundListToPI(!!ev.payload.force);
			}
		} catch (err) {
			streamDeck.logger.error(`Error in ManualSoundAction.onSendToPlugin: ${String(err)}`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<ManualSoundSettings>): Promise<void> {
		try {
			const { soundId } = ev.payload.settings;
			if (typeof soundId !== "number" || !Number.isFinite(soundId)) {
				streamDeck.logger.warn("Manual Sound key pressed, but no sound is selected yet.");
				await ev.action.showAlert();
				return;
			}

			const globalSettings = await getEffectiveGlobalSettings();
			await play(soundId, globalSettings);
			await ev.action.showOk();
		} catch (err) {
			logApiError(err, "slot");
			try {
				await ev.action.showAlert();
			} catch {
				// Ignore secondary alert error
			}
		}
	}
}
