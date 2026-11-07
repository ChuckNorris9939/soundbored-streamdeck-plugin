export const DEFAULT_MAX_CHARS = 9;
export const DEFAULT_MAX_LINES = 3;

/**
 * Estimates visual width of a string in Stream Deck's proportional key font,
 * where uppercase letters and wide glyphs (M, W) take ~1.25x the width of lowercase letters.
 */
export function visualLength(text: string): number {
	let total = 0;
	for (const ch of text) {
		if (/[A-ZÄÖÜMW]/.test(ch)) {
			total += 1.25;
		} else {
			total += 1;
		}
	}
	return total;
}

/**
 * Truncates a string so that its visual width plus `…` fits cleanly inside a Stream Deck key.
 */
function truncateWithEllipsis(text: string, maxChars: number): string {
	// Target at most (maxChars - 2) characters (e.g. 7 chars + '…' for maxChars=9)
	// and ensure uppercase-heavy strings don't exceed visual width.
	const maxSliceChars = Math.max(1, maxChars - 2);
	const maxVisual = Math.max(1, maxChars - 1.25);

	let result = "";
	let count = 0;
	for (const ch of text) {
		if (count >= maxSliceChars) {
			break;
		}
		if (visualLength(result + ch) > maxVisual && count > 0) {
			break;
		}
		result += ch;
		count++;
	}

	return `${result.trimEnd()}…`;
}

/**
 * Formats a sound's display name for a narrow Stream Deck key title.
 * - Splits words on whitespace and underscores (`_`)
 * - Wraps on word boundaries up to `maxLines` lines of roughly `maxChars` visual width
 * - Splits single overlong words across unused lines when spare lines are available
 * - Hard-truncates anything that still does not fit and appends `…`
 */
export function formatTitle(
	displayName: string,
	maxChars: number = DEFAULT_MAX_CHARS,
	maxLines: number = DEFAULT_MAX_LINES
): string {
	// Normalize underscores into spaces so names like HUND_UND_KATZE wrap cleanly on word boundaries
	const normalized = displayName.replace(/_+/g, " ").trim();
	if (!normalized) {
		return "";
	}

	const words = normalized.split(/\s+/);
	const rawLines: string[] = [];

	for (const word of words) {
		if (rawLines.length === 0) {
			rawLines.push(word);
			continue;
		}

		const currentLine = rawLines[rawLines.length - 1];
		const combined = `${currentLine} ${word}`;
		if (combined.length <= maxChars && visualLength(combined) <= maxChars) {
			rawLines[rawLines.length - 1] = combined;
		} else {
			rawLines.push(word);
		}
	}

	// If we have spare lines available (fewer lines than maxLines) and an unbroken overlong word,
	// split it across the available lines so names like "Bitconnect" don't get cut off unnecessarily.
	while (rawLines.length < maxLines) {
		const overlongIndex = rawLines.findIndex(
			(line) => !line.includes(" ") && (line.length > maxChars || visualLength(line) > maxChars)
		);
		if (overlongIndex === -1) {
			break;
		}
		const word = rawLines[overlongIndex];
		const maxChunk = Math.max(2, maxChars - 2);
		const splitAt = Math.min(maxChunk, Math.ceil(word.length * 0.6));
		const firstPart = word.slice(0, splitAt);
		const secondPart = word.slice(splitAt);
		rawLines.splice(overlongIndex, 1, firstPart, secondPart);
	}

	const hasOverflowLines = rawLines.length > maxLines;
	const visibleLines = rawLines.slice(0, maxLines);

	return visibleLines
		.map((line, index) => {
			const isLastVisibleLine = index === maxLines - 1;
			const needsOverflowEllipsis = isLastVisibleLine && hasOverflowLines;

			if (line.length > maxChars || visualLength(line) > maxChars) {
				return truncateWithEllipsis(line, maxChars);
			}

			if (needsOverflowEllipsis) {
				if (line.length + 1 <= maxChars - 1 && visualLength(line) + 1.25 <= maxChars) {
					return `${line}…`;
				}
				return truncateWithEllipsis(line, maxChars);
			}

			return line;
		})
		.join("\n");
}
