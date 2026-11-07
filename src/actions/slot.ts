import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import { handleSlotPress, registerSlot, unregisterSlot } from "../state.js";

@action({ UUID: "com.soundbored.streamdeck.slot" })
export class SoundSlotAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		try {
			if (!ev.action.isKey()) {
				return;
			}
			const coords =
				ev.action.coordinates ??
				(!ev.payload.isInMultiAction ? ev.payload.coordinates : undefined) ?? {
					column: 0,
					row: 0
				};
			await registerSlot(ev.action, coords.column, coords.row);
		} catch (err) {
			streamDeck.logger.error(`Error in SoundSlotAction.onWillAppear: ${String(err)}`);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
		try {
			await unregisterSlot(ev.action.id);
		} catch (err) {
			streamDeck.logger.error(`Error in SoundSlotAction.onWillDisappear: ${String(err)}`);
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await handleSlotPress(ev.action);
		} catch (err) {
			streamDeck.logger.error(`Error in SoundSlotAction.onKeyDown: ${String(err)}`);
		}
	}
}
