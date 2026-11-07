# Soundbored Stream Deck plugin

A Stream Deck plugin (`com.soundbored.streamdeck`) for controlling a self-hosted Soundbored Discord soundboard. It populates keys dynamically from your Soundbored server and plays audio directly into your active Discord voice channel.

## Installation (end users, no Node.js required)

Every push to `main` builds a ready-to-use installer via GitHub Actions and publishes it under **Releases**.

### Option A: One-click installer (`.streamDeckPlugin`)

1. Open the **Releases** page of this repository and download `com.soundbored.streamdeck.streamDeckPlugin`.
2. Double-click the downloaded file. The Elgato Stream Deck application installs and starts the plugin automatically.

### Option B: Manual folder copy (`.sdPlugin.zip`)

1. Download `com.soundbored.streamdeck.sdPlugin.zip` from **Releases**.
2. Extract the `com.soundbored.streamdeck.sdPlugin` folder into your Stream Deck plugins directory:
   - Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\`
   - macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
3. Restart the Elgato Stream Deck application.

## Configuring the plugin in Stream Deck

1. Open the Stream Deck software and find the **Soundbored** category in the right sidebar.
2. Drag your desired actions onto the canvas. A typical 20-key Virtual Stream Deck setup places `Play Random`, `Stop`, `Manual Sound`, and a folder on the main screen, with `Sound Slot` keys, `Previous Page`, `Next Page`, and `Toggle Favorites / All` inside the folder.
3. Click any Soundbored key to open the Property Inspector at the bottom of the Stream Deck window:
   - Enter your **Server URL** (your Soundbored instance address) and **API Token** (created in the Soundbored web UI under *Settings -> API Tokens*). These are stored as global plugin settings inside Stream Deck and shared across all Soundbored keys.
   - Adjust **Text Lines** (1 to 6, default 4) and **Chars / Line** (6 to 15, default 9) to match your key size. Changes apply immediately across all keys.

## Features and actions

The plugin registers six actions under the **Soundbored** category:

- `Sound Slot` (`com.soundbored.streamdeck.slot`): Automatically fills placed slots in top-to-bottom, left-to-right order from the active sound list (Favorites or All Sounds). Empty slots remain blank and ignore key presses.
- `Manual Sound` (`com.soundbored.streamdeck.custom`): Pins a specific sound to a single key, with a live search filter in the Property Inspector and an optional custom key title.
- `Toggle Favorites / All` (`com.soundbored.streamdeck.mode`): Switches both the `Sound Slot` grid and `Play Random` between your personal Favorites (`GET /api/sounds/favorites`) and the full sound library (`GET /api/sounds`, sorted alphabetically).
- `Previous Page` (`com.soundbored.streamdeck.prev-page`) and `Next Page` (`com.soundbored.streamdeck.page`): Cycles backward and forward through pages when you have more sounds than placed slots. `Next Page` displays the current page ratio (`1/1`, `1/23`, etc.).
- `Play Random` (`com.soundbored.streamdeck.random`): Triggers `POST /api/sounds/random/play`, scoped to either Favorites or All Sounds based on the active mode.
- `Stop` (`com.soundbored.streamdeck.stop`): Stops current playback in Discord (`POST /api/sounds/stop`).

## Development setup (building from source)

If you want to modify the plugin code locally:

1. Install Node.js 24+ and dependencies:

```bash
npm install
npm install -g @elgato/cli
```

2. Build the plugin bundle:

```bash
npm run build
```

3. Enable developer mode, link the plugin into the Stream Deck app, and start it:

```bash
streamdeck dev
streamdeck link com.soundbored.streamdeck.sdPlugin
streamdeck restart com.soundbored.streamdeck
```

4. Package a `.streamDeckPlugin` installer locally:

```bash
npm run pack
```

5. Run tests and validation:

```bash
npm test
npm run typecheck
streamdeck validate com.soundbored.streamdeck.sdPlugin
```
