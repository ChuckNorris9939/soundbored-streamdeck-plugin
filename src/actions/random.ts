import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent
} from "@elgato/streamdeck";
import { playRandom } from "../api.js";
import { getCurrentMode, getEffectiveGlobalSettings, logApiError, setCurrentMode } from "../state.js";

export type RandomActionSettings = {
	favoritesOnly?: boolean;
};

@action({ UUID: "com.soundbored.streamdeck.random" })
export class PlayRandomAction extends SingletonAction<RandomActionSettings> {
	override async onWillAppear(ev: WillAppearEvent<RandomActionSettings>): Promise<void> {
		try {
			if (ev.payload.settings.favoritesOnly === undefined) {
				await ev.action.setSettings({
					...ev.payload.settings,
					favoritesOnly: getCurrentMode() === "favorites"
				});
			}
		} catch (err) {
			streamDeck.logger.error(`Error in PlayRandomAction.onWillAppear: ${String(err)}`);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RandomActionSettings>): Promise<void> {
		try {
			if (typeof ev.payload.settings.favoritesOnly === "boolean") {
				await setCurrentMode(ev.payload.settings.favoritesOnly ? "favorites" : "all");
			}
		} catch (err) {
			streamDeck.logger.error(`Error in PlayRandomAction.onDidReceiveSettings: ${String(err)}`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<RandomActionSettings>): Promise<void> {
		try {
			// Follow the active mode (Favs vs All) toggled via the Mode button
			const favoritesOnly = getCurrentMode() === "favorites";
			const settings = await getEffectiveGlobalSettings();
			await playRandom(favoritesOnly, settings);
			await ev.action.showOk();
		} catch (err) {
			logApiError(err, "random");
			try {
				await ev.action.showAlert();
			} catch {
				// Ignore secondary alert error
			}
		}
	}
}
