import { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { stop } from "../api.js";
import { getEffectiveGlobalSettings, logApiError } from "../state.js";

@action({ UUID: "com.soundbored.streamdeck.stop" })
export class StopAction extends SingletonAction {
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			const settings = await getEffectiveGlobalSettings();
			await stop(settings);
			await ev.action.showOk();
		} catch (err) {
			logApiError(err, "stop");
			try {
				await ev.action.showAlert();
			} catch {
				// Ignore secondary alert error
			}
		}
	}
}
