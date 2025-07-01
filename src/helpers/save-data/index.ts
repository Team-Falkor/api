import type {
	CargoQueryPageId,
	ParseQueryPageContent,
	SaveLocationsObject,
} from "./types";

const PCGW_API_ENDPOINT = "https://www.pcgamingwiki.com/w/api.php";

/**
 * Normalizes raw OS names from the wiki into standardized lowercase keys.
 */
function normalizeOsKey(rawKey: string): string {
	const lowerKey = rawKey.toLowerCase().trim();

	if (lowerKey.includes("windows") || lowerKey.includes("microsoft")) {
		return "windows";
	}
	if (lowerKey.includes("linux") || lowerKey.includes("steam play")) {
		return "linux";
	}
	if (
		lowerKey.includes("mac") ||
		lowerKey.includes("os x") ||
		lowerKey.includes("macos")
	) {
		return "mac";
	}

	return lowerKey.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Resolves common PCGamingWiki path templates into environment variables.
 */
function resolveWikiTemplates(text: string): string {
	return text
		.replace(/\{\{p\|userprofile\}\}/gi, "%USERPROFILE%")
		.replace(/\{\{p\|localappdata\}\}/gi, "%LOCALAPPDATA%")
		.replace(/\{\{p\|appdata\}\}/gi, "%APPDATA%")
		.replace(/\{\{p\|documents\}\}/gi, "%USERPROFILE%\\Documents")
		.replace(/\{\{p\|userprofile\\Documents\}\}/gi, "%USERPROFILE%\\Documents")
		.replace(
			/\{\{p\|userprofile\\\\Documents\}\}/gi,
			"%USERPROFILE%\\Documents",
		)
		.replace(/\{\{p\|steam\}\}/gi, "<Steam-folder>")
		.replace(/\{\{p\|game\}\}/gi, "<Game-folder>")
		.replace(/\{\{p\|ubisoftconnect\}\}/gi, "<UbisoftConnect-folder>")
		.replace(/\{\{p\|uid\}\}/gi, "<User-ID>")
		.replace(/\{\{p\|home\}\}/gi, "~")
		.replace(/\{\{p\|library\}\}/gi, "~/Library")
		.replace(/\{\{p\|osxhome\}\}/gi, "~")
		.replace(/\{\{p\|xdgconfighome\}\}/gi, "~/.config")
		.replace(/\{\{p\|xdgdatahome\}\}/gi, "~/.local/share")
		.replace(/\{\{p\|programdata\}\}/gi, "%PROGRAMDATA%")
		.trim();
}

/**
 * Extracts a full template string by finding its matching closing braces.
 */
function extractBalancedBraces(text: string, startIndex: number): string {
	let braceCount = 0;
	let i = startIndex;

	while (i < text.length) {
		if (text.substring(i, i + 2) === "{{") {
			braceCount++;
			i += 2;
		} else if (text.substring(i, i + 2) === "}}") {
			braceCount--;
			i += 2;
			if (braceCount === 0) {
				return text.substring(startIndex, i);
			}
		} else {
			i++;
		}
	}

	return text.substring(startIndex);
}

/**
 * Analyzes a path string that may contain '|' as an alternative segment
 * within a larger path structure, and reconstructs all full distinct paths.
 *
 * Example: "C:\Path\A|B\Subpath" should yield "C:\Path\A\Subpath", "C:\Path\B\Subpath"
 *
 * @param path The resolved path string which might contain '|'.
 * @returns An array of full, distinct paths.
 */
function extractCommonPathParts(path: string): string[] {
	if (!path.includes("|")) {
		// If no '|' separator, it's already a single path. Clean and return.
		return [path.replace(/\\+/g, "\\").replace(/\\$/, "")];
	}

	const segments = path.split("|");
	if (segments.length === 0) {
		return [];
	}

	let commonPrefix = "";
	let commonSuffix = "";

	// Determine commonPrefix: The part of the first segment (before the first '|')
	// up to and including its last path separator.
	const firstFullPartBeforePipe = segments[0];
	const lastSlashInFirstPart = Math.max(
		firstFullPartBeforePipe.lastIndexOf("\\"),
		firstFullPartBeforePipe.lastIndexOf("/"),
	);
	if (lastSlashInFirstPart !== -1) {
		commonPrefix = firstFullPartBeforePipe.substring(
			0,
			lastSlashInFirstPart + 1,
		);
	}

	// Determine commonSuffix: The part of the last segment (after the last '|')
	// from and including its first path separator to the end.
	const lastFullPartAfterPipe = segments[segments.length - 1];
	const firstSlashInLastPart = Math.max(
		lastFullPartAfterPipe.indexOf("\\"),
		lastFullPartAfterPipe.indexOf("/"),
	);
	if (firstSlashInLastPart !== -1) {
		commonSuffix = lastFullPartAfterPipe.substring(firstSlashInLastPart);
	}

	const fullPaths: string[] = [];

	segments.forEach((segment, index) => {
		let variableCore = segment;

		// For the first segment, remove the determined common prefix from its start
		if (index === 0 && variableCore.startsWith(commonPrefix)) {
			variableCore = variableCore.substring(commonPrefix.length);
		}

		// For the last segment, remove the determined common suffix from its end
		if (index === segments.length - 1 && variableCore.endsWith(commonSuffix)) {
			variableCore = variableCore.substring(
				0,
				variableCore.length - commonSuffix.length,
			);
		}

		// Ensure no leading/trailing backslashes remain on the variable core that might
		// cause double slashes after concatenation.
		variableCore = variableCore.replace(/^\\+/, "").replace(/\\+$/, "");

		// Reconstruct the full path
		let constructedPath = `${commonPrefix}${variableCore}${commonSuffix}`;

		// Final cleanup: normalize multiple slashes and remove any trailing slash
		constructedPath = constructedPath.replace(/\\+/g, "\\");
		constructedPath = constructedPath.replace(/\\$/, "");

		if (constructedPath.trim() !== "") {
			fullPaths.push(constructedPath);
		}
	});

	return fullPaths;
}

/**
 * Fetches and parses save game file locations for a given Steam ID from PCGamingWiki.
 * @param steamId The Steam Application ID of the game.
 * @returns A promise that resolves to an object with OS keys and arrays of save path strings.
 */
export async function getSaveGameLocation(
	steamId: string,
): Promise<SaveLocationsObject> {
	try {
		const cargoQueryUrl = new URL(PCGW_API_ENDPOINT);
		cargoQueryUrl.search = new URLSearchParams({
			action: "cargoquery",
			tables: "Infobox_game",
			fields: "Infobox_game._pageID=PageID",
			where: `Infobox_game.Steam_AppID HOLDS "${steamId}"`,
			format: "json",
		}).toString();

		const cargoResponse = await fetch(cargoQueryUrl.toString());

		if (!cargoResponse.ok) {
			throw new Error(`Failed to fetch page ID: ${cargoResponse.status}`);
		}

		const cargoData = (await cargoResponse.json()) as CargoQueryPageId;
		const pageId = cargoData.cargoquery[0]?.title.PageID;

		if (!pageId) {
			throw new Error(`No PCGamingWiki page found for Steam ID: ${steamId}`);
		}

		const parseQueryUrl = new URL(PCGW_API_ENDPOINT);
		parseQueryUrl.search = new URLSearchParams({
			action: "parse",
			pageid: pageId,
			prop: "wikitext",
			format: "json",
		}).toString();

		const parseResponse = await fetch(parseQueryUrl.toString());

		if (!parseResponse.ok) {
			throw new Error(`Failed to fetch page content: ${parseResponse.status}`);
		}

		const parseData = (await parseResponse.json()) as ParseQueryPageContent;
		const wikitext = parseData.parse.wikitext["*"];

		const saveGameSectionRegex =
			/===\s*Save game data location\s*===([\s\S]*?)(?:===|$)/i;
		const saveGameSectionMatch = wikitext.match(saveGameSectionRegex);

		if (!saveGameSectionMatch) {
			return {};
		}

		const saveGameContent = saveGameSectionMatch[1];
		const locations: SaveLocationsObject = {};

		const gameDataSavesRegex = /\{\{Game data\/saves\s*\|\s*([^|]+?)\s*\|/gi;
		let match: RegExpExecArray | null;

		match = gameDataSavesRegex.exec(saveGameContent);
		while (match !== null) {
			const osName = match[1].trim();
			const templateStart = match.index;

			const fullTemplate = extractBalancedBraces(
				saveGameContent,
				templateStart,
			);

			const templateParts = fullTemplate.split("|");
			if (templateParts.length >= 3) {
				const pathContent = templateParts
					.slice(2)
					.join("|")
					.replace(/\}\}$/, "")
					.trim();

				if (pathContent) {
					const resolvedPath = resolveWikiTemplates(pathContent);

					// Apply the Ubisoft Connect fix. This cleans up instances where
					// a pipe `|` directly precedes the <UbisoftConnect-folder> template,
					// which isn't part of the common-segment-common pattern but a formatting quirk.
					// Only remove the pipe, preserve any backslashes.
					const preCleanedPath = resolvedPath.replace(
						/\|(<UbisoftConnect-folder>)/g,
						"\\$1",
					);

					const normalizedOs = normalizeOsKey(osName);

					if (!locations[normalizedOs]) {
						locations[normalizedOs] = [];
					}

					const allResolvedPaths = extractCommonPathParts(preCleanedPath);

					allResolvedPaths.forEach((finalPath) => {
						if (finalPath) {
							locations[normalizedOs].push(finalPath);
						}
					});
				}
			}
			match = gameDataSavesRegex.exec(saveGameContent);
		}

		const directDataRegex =
			/\{\{Game data\|([^|]+)\|<code>([^<]+)<\/code>\}\}/gi;

		match = directDataRegex.exec(saveGameContent);
		while (match !== null) {
			const osName = match[1].trim();
			const pathContent = match[2].trim();

			if (pathContent) {
				const resolvedPath = resolveWikiTemplates(pathContent);

				// Apply the same pre-cleaning for direct data paths
				const preCleanedPath = resolvedPath.replace(
					/\|(<UbisoftConnect-folder>)/g,
					"\\$1",
				);

				const normalizedOs = normalizeOsKey(osName);

				if (!locations[normalizedOs]) {
					locations[normalizedOs] = [];
				}

				const allResolvedPaths = extractCommonPathParts(preCleanedPath);

				allResolvedPaths.forEach((finalPath) => {
					if (finalPath) {
						locations[normalizedOs].push(finalPath);
					}
				});
			}
			match = directDataRegex.exec(saveGameContent);
		}

		return locations;
	} catch (error) {
		console.error("An unexpected error occurred:", error);
		throw error;
	}
}
