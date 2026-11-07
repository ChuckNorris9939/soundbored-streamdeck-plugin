import streamDeck from "@elgato/streamdeck";
import { ManualSoundAction } from "./actions/manual.js";
import { ToggleModeAction } from "./actions/mode.js";
import { NextPageAction } from "./actions/page.js";
import { PrevPageAction } from "./actions/prev-page.js";
import { PlayRandomAction } from "./actions/random.js";
import { SoundSlotAction } from "./actions/slot.js";
import { StopAction } from "./actions/stop.js";
import { handleGlobalSettingsChanged } from "./state.js";

streamDeck.logger.setLevel("info");

streamDeck.settings.onDidReceiveGlobalSettings(() => {
	handleGlobalSettingsChanged().catch((err) => {
		streamDeck.logger.error(`Error handling global settings change: ${String(err)}`);
	});
});

streamDeck.actions.registerAction(new SoundSlotAction());
streamDeck.actions.registerAction(new ManualSoundAction());
streamDeck.actions.registerAction(new NextPageAction());
streamDeck.actions.registerAction(new PrevPageAction());
streamDeck.actions.registerAction(new ToggleModeAction());
streamDeck.actions.registerAction(new PlayRandomAction());
streamDeck.actions.registerAction(new StopAction());

streamDeck.connect();
