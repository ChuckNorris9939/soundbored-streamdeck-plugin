import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import { handleModePress, registerModeAction, unregisterModeAction } from "../state.js";

@action({ UUID: "com.soundbored.streamdeck.mode" })
export class ToggleModeAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		try {
			if (!ev.action.isKey()) {
				return;
			}
			await registerModeAction(ev.action);
		} catch (err) {
			streamDeck.logger.error(`Error in ToggleModeAction.onWillAppear: ${String(err)}`);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
		try {
			unregisterModeAction(ev.action.id);
		} catch (err) {
			streamDeck.logger.error(`Error in ToggleModeAction.onWillDisappear: ${String(err)}`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await handleModePress(ev.action);
		} catch (err) {
			streamDeck.logger.error(`Error in ToggleModeAction.onKeyDown: ${String(err)}`);
		}
	}
}
