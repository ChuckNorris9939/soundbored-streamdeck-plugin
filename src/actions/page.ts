import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import { handlePagePress, registerPageAction, unregisterPageAction } from "../state.js";

@action({ UUID: "com.soundbored.streamdeck.page" })
export class NextPageAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		try {
			if (!ev.action.isKey()) {
				return;
			}
			await registerPageAction(ev.action);
		} catch (err) {
			streamDeck.logger.error(`Error in NextPageAction.onWillAppear: ${String(err)}`);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
		try {
			unregisterPageAction(ev.action.id);
		} catch (err) {
			streamDeck.logger.error(`Error in NextPageAction.onWillDisappear: ${String(err)}`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await handlePagePress(ev.action);
		} catch (err) {
			streamDeck.logger.error(`Error in NextPageAction.onKeyDown: ${String(err)}`);
		}
	}
}
