import streamDeck, { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import { handlePrevPagePress } from "../state.js";

@action({ UUID: "com.soundbored.streamdeck.prev-page" })
export class PrevPageAction extends SingletonAction {
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await handlePrevPagePress(ev.action);
		} catch (err) {
			streamDeck.logger.error(`Error in PrevPageAction.onKeyDown: ${String(err)}`);
		}
	}
}
