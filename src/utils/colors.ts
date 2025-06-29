import type { ColorOptions } from "../@types";

/**
 * A utility class for adding colors and styles to console output
 * using ANSI escape codes.
 */
class Colors {
	private constructor() {}

	// ANSI escape codes for foreground colors
	static readonly BLACK = "\x1b[30m";
	static readonly RED = "\x1b[31m";
	static readonly GREEN = "\x1b[32m";
	static readonly YELLOW = "\x1b[33m";
	static readonly BLUE = "\x1b[34m";
	static readonly MAGENTA = "\x1b[35m";
	static readonly CYAN = "\x1b[36m";
	static readonly WHITE = "\x1b[37m";

	// ANSI escape codes for background colors
	static readonly BG_BLACK = "\x1b[40m";
	static readonly BG_RED = "\x1b[41m";
	static readonly BG_GREEN = "\x1b[42m";
	static readonly BG_YELLOW = "\x1b[43m";
	static readonly BG_BLUE = "\x1b[44m";
	static readonly BG_MAGENTA = "\x1b[45m";
	static readonly BG_CYAN = "\x1b[46m";
	static readonly BG_WHITE = "\x1b[47m";

	// ANSI escape codes for text styles
	static readonly RESET = "\x1b[0m"; // Resets all attributes
	static readonly BOLD = "\x1b[1m"; // Bold/bright
	static readonly DIM = "\x1b[2m"; // Dim/faint
	static readonly ITALIC = "\x1b[3m"; // Italic (often not supported)
	static readonly UNDERLINE = "\x1b[4m"; // Underline
	static readonly INVERT = "\x1b[7m"; // Invert foreground/background
	static readonly HIDDEN = "\x1b[8m"; // Hidden (useful for passwords)
	static readonly STRIKETHROUGH = "\x1b[9m"; // Strikethrough (often not supported)

	/**
	 * Applies ANSI escape codes to a string to color and style it for console output.
	 *
	 * @param text The string to be colored.
	 * @param options An object containing styling options.
	 * @returns A string with ANSI escape codes for colored output.
	 */
	static coloredText(text: string, options: ColorOptions = {}): string {
		const {
			color,
			bgColor,
			bold,
			dim,
			italic,
			underline,
			invert,
			hidden,
			strikethrough,
		} = options;

		let prefix = "";

		if (bold) prefix += Colors.BOLD;
		if (dim) prefix += Colors.DIM;
		if (italic) prefix += Colors.ITALIC;
		if (underline) prefix += Colors.UNDERLINE;
		if (invert) prefix += Colors.INVERT;
		if (hidden) prefix += Colors.HIDDEN;
		if (strikethrough) prefix += Colors.STRIKETHROUGH;

		// Apply foreground color if specified and valid
		if (color && Colors[color as keyof typeof Colors]) {
			prefix += Colors[color as keyof typeof Colors];
		}

		// Apply background color if specified and valid
		if (bgColor && Colors[bgColor as keyof typeof Colors]) {
			prefix += Colors[bgColor as keyof typeof Colors];
		}

		return `${prefix}${text}${Colors.RESET}`;
	}
}

// Export the class for use in other modules
export { Colors };
