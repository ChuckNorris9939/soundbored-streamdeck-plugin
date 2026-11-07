import { describe, expect, it } from "vitest";
import {
	calculatePageCount,
	clampPage,
	formatPageLabel,
	getSoundForSlot,
	nextPageIndex,
	orderSlots,
	prevPageIndex
} from "../src/paging.js";

describe("orderSlots", () => {
	it("sorts slots top-to-bottom (row) then left-to-right (column)", () => {
		const unsorted = [
			{ id: "bottom-right", column: 4, row: 3 },
			{ id: "top-middle", column: 2, row: 0 },
			{ id: "top-left", column: 0, row: 0 },
			{ id: "row1-col1", column: 1, row: 1 },
			{ id: "row1-col0", column: 0, row: 1 }
		];

		const sorted = orderSlots(unsorted);
		expect(sorted.map((s) => s.id)).toEqual([
			"top-left",
			"top-middle",
			"row1-col0",
			"row1-col1",
			"bottom-right"
		]);
	});
});

describe("paging maths", () => {
	it("calculates pageCount with minimum of 1", () => {
		expect(calculatePageCount(0, 18)).toBe(1);
		expect(calculatePageCount(6, 0)).toBe(1);
		expect(calculatePageCount(6, 18)).toBe(1);
		expect(calculatePageCount(18, 18)).toBe(1);
		expect(calculatePageCount(19, 18)).toBe(2);
		expect(calculatePageCount(6, 4)).toBe(2);
	});

	it("wraps around on nextPageIndex and is a no-op when pageCount is 1", () => {
		// 1 page: harmless no-op
		expect(nextPageIndex(0, 1)).toBe(0);

		// 2 pages: 0 -> 1 -> 0
		expect(nextPageIndex(0, 2)).toBe(1);
		expect(nextPageIndex(1, 2)).toBe(0);

		// 3 pages: 0 -> 1 -> 2 -> 0
		expect(nextPageIndex(0, 3)).toBe(1);
		expect(nextPageIndex(1, 3)).toBe(2);
		expect(nextPageIndex(2, 3)).toBe(0);
	});

	it("wraps around backwards on prevPageIndex and is a no-op when pageCount is 1", () => {
		expect(prevPageIndex(0, 1)).toBe(0);
		expect(prevPageIndex(0, 3)).toBe(2);
		expect(prevPageIndex(2, 3)).toBe(1);
		expect(prevPageIndex(1, 3)).toBe(0);
	});

	it("clamps currentPage when favorites list shrinks", () => {
		expect(clampPage(2, 1)).toBe(0);
		expect(clampPage(2, 2)).toBe(1);
		expect(clampPage(-1, 2)).toBe(0);
		expect(clampPage(1, 3)).toBe(1);
	});

	it("formats 1-based page labels", () => {
		expect(formatPageLabel(0, 1)).toBe("1/1");
		expect(formatPageLabel(0, 2)).toBe("1/2");
		expect(formatPageLabel(1, 2)).toBe("2/2");
	});
});

describe("getSoundForSlot index mapping", () => {
	const favorites = ["s0", "s1", "s2", "s3", "s4", "s5"];

	it("maps page 0 and page 1 correctly with 4 slots and 6 favorites", () => {
		// Page 0 (first 4 sounds)
		expect(getSoundForSlot(favorites, 0, 4, 0)).toBe("s0");
		expect(getSoundForSlot(favorites, 0, 4, 3)).toBe("s3");

		// Page 1 (2 sounds + 2 empty slots)
		expect(getSoundForSlot(favorites, 1, 4, 0)).toBe("s4");
		expect(getSoundForSlot(favorites, 1, 4, 1)).toBe("s5");
		expect(getSoundForSlot(favorites, 1, 4, 2)).toBeUndefined();
		expect(getSoundForSlot(favorites, 1, 4, 3)).toBeUndefined();
	});

	it("returns undefined for out-of-range slot indices", () => {
		expect(getSoundForSlot(favorites, 0, 18, 6)).toBeUndefined();
		expect(getSoundForSlot(favorites, 0, 18, 17)).toBeUndefined();
		expect(getSoundForSlot(favorites, 0, 0, 0)).toBeUndefined();
	});
});
