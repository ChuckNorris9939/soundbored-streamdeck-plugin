export interface GridPosition {
	column: number;
	row: number;
}

/**
 * Sorts slot entries by physical position: top-to-bottom (`row`), then left-to-right (`column`).
 */
export function orderSlots<T extends GridPosition>(slots: Iterable<T>): T[] {
	return [...slots].sort((a, b) => a.row - b.row || a.column - b.column);
}

/**
 * Computes the total number of pages (at least 1).
 */
export function calculatePageCount(favoritesCount: number, slotCount: number): number {
	if (slotCount <= 0 || favoritesCount <= 0) {
		return 1;
	}
	return Math.max(1, Math.ceil(favoritesCount / slotCount));
}

/**
 * Clamps `currentPage` into valid `[0, pageCount - 1]` range.
 */
export function clampPage(currentPage: number, pageCount: number): number {
	const safePageCount = Math.max(1, pageCount);
	if (currentPage < 0) {
		return 0;
	}
	if (currentPage >= safePageCount) {
		return safePageCount - 1;
	}
	return currentPage;
}

/**
 * Advances to the next page index with wrap-around.
 */
export function nextPageIndex(currentPage: number, pageCount: number): number {
	const safePageCount = Math.max(1, pageCount);
	const clamped = clampPage(currentPage, safePageCount);
	return (clamped + 1) % safePageCount;
}

/**
 * Moves to the previous page index with wrap-around.
 */
export function prevPageIndex(currentPage: number, pageCount: number): number {
	const safePageCount = Math.max(1, pageCount);
	const clamped = clampPage(currentPage, safePageCount);
	return (clamped - 1 + safePageCount) % safePageCount;
}

/**
 * Maps `(currentPage, slotCount, slotIndex)` to the corresponding item in `favorites`,
 * or `undefined` if out of range.
 */
export function getSoundForSlot<T>(
	favorites: readonly T[],
	currentPage: number,
	slotCount: number,
	slotIndex: number
): T | undefined {
	if (slotCount <= 0 || slotIndex < 0 || slotIndex >= slotCount) {
		return undefined;
	}
	const soundIndex = currentPage * slotCount + slotIndex;
	return favorites[soundIndex];
}

/**
 * Formats the 1-based page indicator label (e.g. `1/1`, `2/3`).
 */
export function formatPageLabel(currentPage: number, pageCount: number): string {
	const safePageCount = Math.max(1, pageCount);
	const clamped = clampPage(currentPage, safePageCount);
	return `${clamped + 1}/${safePageCount}`;
}
