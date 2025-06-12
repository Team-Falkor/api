import type {
  CargoQueryPageId,
  ParseQueryPageContent,
  SaveLocationsObject,
} from "./types";

const PCGW_API_ENDPOINT = "https://www.pcgamingwiki.com/w/api.php";

function normalizeOsKey(rawKey: string): string {
  const lowerKey = rawKey.toLowerCase().trim();

  if (lowerKey.includes("windows") || lowerKey.includes("microsoft")) return "windows";
  if (lowerKey.includes("linux") || lowerKey.includes("steam play")) return "linux";
  if (lowerKey.includes("mac") || lowerKey.includes("os x") || lowerKey.includes("macos")) return "mac";
  
  return lowerKey.replace(/[^a-zA-Z0-9]/g, "");
}

function resolveWikiTemplates(text: string): string {
  return text
    .replace(/\{\{p\|userprofile\}\}/gi, "%USERPROFILE%")
    .replace(/\{\{p\|localappdata\}\}/gi, "%LOCALAPPDATA%")
    .replace(/\{\{p\|appdata\}\}/gi, "%APPDATA%")
    .replace(/\{\{p\|documents\}\}/gi, "%USERPROFILE%\\Documents")
    .replace(/\{\{p\|steam\}\}/gi, "<Steam-folder>")
    .replace(/\{\{p\|game\}\}/gi, "<Game-folder>")
    .replace(/\{\{p\|home\}\}/gi, "~")
    .replace(/\{\{p\|library\}\}/gi, "~/Library")
    .replace(/\{\{p\|osxhome\}\}/gi, "~")
    .replace(/\{\{p\|xdgconfighome\}\}/gi, "~/.config")
    .replace(/\{\{p\|xdgdatahome\}\}/gi, "~/.local/share")
    .trim();
}

function extractBalancedBraces(text: string, startIndex: number): string {
  let braceCount = 0;
  let i = startIndex;
  
  while (i < text.length) {
    if (text.substring(i, i + 2) === '{{') {
      braceCount++;
      i += 2;
    } else if (text.substring(i, i + 2) === '}}') {
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

export async function getSaveGameLocation(
  steamId: string
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

    const saveGameSectionRegex = /===\s*Save game data location\s*===([\s\S]*?)(?:===|$)/i;
    const saveGameSectionMatch = wikitext.match(saveGameSectionRegex);

    if (!saveGameSectionMatch) {
      return {};
    }

    const saveGameContent = saveGameSectionMatch[1];
    const locations: SaveLocationsObject = {};

    // Find all {{Game data/saves templates
    const gameDataSavesRegex = /\{\{Game data\/saves\s*\|\s*([^|]+?)\s*\|/gi;
    let match;

    while ((match = gameDataSavesRegex.exec(saveGameContent)) !== null) {
      const osName = match[1].trim();
      const templateStart = match.index;
      
      const fullTemplate = extractBalancedBraces(saveGameContent, templateStart);
      
      const templateParts = fullTemplate.split('|');
      if (templateParts.length >= 3) {
        const pathContent = templateParts.slice(2).join('|').replace(/\}\}$/, '').trim();
        
        if (pathContent) {
          const resolvedPath = resolveWikiTemplates(pathContent);
          const normalizedOs = normalizeOsKey(osName);
          locations[normalizedOs] = resolvedPath;
        }
      }
    }

    // Fallback for direct {{Game data|OS|<code>path</code>}} patterns
    const directDataRegex = /\{\{Game data\|([^|]+)\|<code>([^<]+)<\/code>\}\}/gi;
    
    while ((match = directDataRegex.exec(saveGameContent)) !== null) {
      const osName = match[1].trim();
      const pathContent = match[2].trim();

      if (pathContent) {
        const resolvedPath = resolveWikiTemplates(pathContent);
        const normalizedOs = normalizeOsKey(osName);
        
        if (!locations[normalizedOs]) {
          locations[normalizedOs] = resolvedPath;
        }
      }
    }

    return locations;
  } catch (error) {
    console.error("An unexpected error occurred:", error);
    throw error;
  }
}
