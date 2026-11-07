import { describe, expect, it } from "vitest";
import { formatTitle } from "../src/title.js";

describe("formatTitle", () => {
	it("returns empty string for empty or whitespace input", () => {
		expect(formatTitle("")).toBe("");
		expect(formatTitle("   ")).toBe("");
	});

	it("keeps short single words intact", () => {
		expect(formatTitle("Airhorn")).toBe("Airhorn");
		expect(formatTitle("soundpad")).toBe("soundpad");
	});

	it("splits a single 10-char word like 'Bitconnect' across 2 lines when spare lines exist", () => {
		expect(formatTitle("Bitconnect")).toBe("Bitcon\nnect");
	});

	it("wraps underscore-separated names like 'DRUM_AND_BASS' onto separate lines", () => {
		expect(formatTitle("DRUM_AND_BASS")).toBe("DRUM\nAND\nBASS");
	});

	it("keeps short words on the same line when they fit within visual width", () => {
		expect(formatTitle("Oh Yeah")).toBe("Oh Yeah");
		expect(formatTitle("alpha beta go now")).toBe("alpha\nbeta go\nnow");
		expect(formatTitle("hello Tatooine")).toBe("hello\nTatooine");
	});

	it("wraps 'Saxophones getting louder' across 3 lines with 'Saxopho…' on line 1", () => {
		const formatted = formatTitle("Saxophones getting louder");
		expect(formatted).toBe("Saxopho…\ngetting\nlouder");
	});

	it("limits output to at most 3 lines and appends ellipsis when overflowing", () => {
		const formatted = formatTitle("One Two Three Four Five Six Seven");
		const lines = formatted.split("\n");
		expect(lines).toHaveLength(3);
		expect(lines[2].endsWith("…")).toBe(true);
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(9);
		}
	});
});
