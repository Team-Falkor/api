import type { BackgroundColor, ForegroundColor } from "./definitions";

/**
 * Defines options for styling console text.
 */
export interface ColorOptions {
	color?: ForegroundColor;
	bgColor?: BackgroundColor;
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
	invert?: boolean; // Inverts foreground and background colors
	hidden?: boolean; // Makes text invisible
	strikethrough?: boolean; // Draws a line through the text
}
