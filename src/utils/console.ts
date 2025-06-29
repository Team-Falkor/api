import type { ColorOptions } from "../@types";
import { Colors } from "./colors";

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR" | "DEBUG" | "LOG";
type TimestampFormat = "iso" | "locale" | "time" | "custom";

interface LoggerConfig {
	includeTimestamp: boolean;
	timestampFormat: TimestampFormat;
	customTimestampFormat?: () => string;
	includeLevel: boolean;
	customLevel?: string;
	colorOptions: ColorOptions;
	prefix?: string;
	suffix?: string;
	indentLevel: number;
	silent: boolean;
}

class ConsoleBuilder {
	private config: LoggerConfig = {
		includeTimestamp: false,
		timestampFormat: "iso",
		includeLevel: true,
		colorOptions: {},
		indentLevel: 0,
		silent: false,
	};

	// Timestamp methods
	withTimestamp(format: TimestampFormat = "iso"): ConsoleBuilder {
		this.config.includeTimestamp = true;
		this.config.timestampFormat = format;
		return this;
	}

	withCustomTimestamp(formatter: () => string): ConsoleBuilder {
		this.config.includeTimestamp = true;
		this.config.timestampFormat = "custom";
		this.config.customTimestampFormat = formatter;
		return this;
	}

	withoutTimestamp(): ConsoleBuilder {
		this.config.includeTimestamp = false;
		return this;
	}

	// Level methods
	withLevel(customLevel?: string): ConsoleBuilder {
		this.config.includeLevel = true;
		this.config.customLevel = customLevel;
		return this;
	}

	withoutLevel(): ConsoleBuilder {
		this.config.includeLevel = false;
		return this;
	}

	// Color and styling methods
	withColor(options: ColorOptions): ConsoleBuilder {
		this.config.colorOptions = { ...this.config.colorOptions, ...options };
		return this;
	}

	withBold(): ConsoleBuilder {
		this.config.colorOptions.bold = true;
		return this;
	}

	withDim(): ConsoleBuilder {
		this.config.colorOptions.dim = true;
		return this;
	}

	withItalic(): ConsoleBuilder {
		this.config.colorOptions.italic = true;
		return this;
	}

	withUnderline(): ConsoleBuilder {
		this.config.colorOptions.underline = true;
		return this;
	}

	// Prefix and suffix methods
	withPrefix(prefix: string): ConsoleBuilder {
		this.config.prefix = prefix;
		return this;
	}

	withSuffix(suffix: string): ConsoleBuilder {
		this.config.suffix = suffix;
		return this;
	}

	// Indentation methods
	withIndent(level: number = 1): ConsoleBuilder {
		this.config.indentLevel = level;
		return this;
	}

	indent(): ConsoleBuilder {
		this.config.indentLevel += 1;
		return this;
	}

	outdent(): ConsoleBuilder {
		this.config.indentLevel = Math.max(0, this.config.indentLevel - 1);
		return this;
	}

	// Silent mode
	silent(): ConsoleBuilder {
		this.config.silent = true;
		return this;
	}

	// Private helper methods
	private formatTimestamp(): string {
		if (!this.config.includeTimestamp) return "";

		const now = new Date();
		switch (this.config.timestampFormat) {
			case "iso":
				return `[${now.toISOString()}]`;
			case "locale":
				return `[${now.toLocaleString()}]`;
			case "time":
				return `[${now.toLocaleTimeString()}]`;
			case "custom":
				return this.config.customTimestampFormat
					? `[${this.config.customTimestampFormat()}]`
					: "";
			default:
				return `[${now.toISOString()}]`;
		}
	}

	private formatLevel(level: LogLevel): string {
		if (!this.config.includeLevel) return "";
		return this.config.customLevel
			? `[${this.config.customLevel}]`
			: `[${level}]`;
	}

	private formatMessage(message: string): string {
		let formattedMessage = message;

		// Add indentation
		if (this.config.indentLevel > 0) {
			const indent = "  ".repeat(this.config.indentLevel);
			formattedMessage = indent + formattedMessage;
		}

		// Add prefix
		if (this.config.prefix) {
			formattedMessage = this.config.prefix + formattedMessage;
		}

		// Add suffix
		if (this.config.suffix) {
			formattedMessage = formattedMessage + this.config.suffix;
		}

		return formattedMessage;
	}

	private getDefaultLevelColors(level: LogLevel): ColorOptions {
		switch (level) {
			case "INFO":
				return { color: "CYAN" };
			case "SUCCESS":
				return { color: "GREEN", bold: true };
			case "WARN":
				return { color: "YELLOW", bold: true };
			case "ERROR":
				return { color: "RED", bold: true };
			case "DEBUG":
				return { color: "MAGENTA", dim: true };
			default:
				return {};
		}
	}

	private executeLog(
		level: LogLevel,
		message: string,
		optionalParams: unknown[],
		consoleMethod: (...args: unknown[]) => void,
	): void {
		if (this.config.silent) return;

		const timestamp = this.formatTimestamp();
		const levelText = this.formatLevel(level);
		const formattedMessage = this.formatMessage(message);

		const parts: string[] = [];

		// Add timestamp
		if (timestamp) {
			parts.push(Colors.coloredText(timestamp, { dim: true }));
		}

		// Add level with colors
		if (levelText) {
			const levelColors = {
				...this.getDefaultLevelColors(level),
				...this.config.colorOptions,
			};
			parts.push(Colors.coloredText(levelText, levelColors));
		}

		// Add formatted message
		parts.push(Colors.coloredText(formattedMessage, this.config.colorOptions));

		consoleMethod(...parts, ...optionalParams);
	}

	// Logging methods
	info(message: string, ...optionalParams: unknown[]): void {
		this.executeLog("INFO", message, optionalParams, console.log);
	}

	success(message: string, ...optionalParams: unknown[]): void {
		this.executeLog("SUCCESS", message, optionalParams, console.log);
	}

	warn(message: string, ...optionalParams: unknown[]): void {
		this.executeLog("WARN", message, optionalParams, console.warn);
	}

	error(message: string, ...optionalParams: unknown[]): void {
		this.executeLog("ERROR", message, optionalParams, console.error);
	}

	debug(message: string, ...optionalParams: unknown[]): void {
		if (process.env.NODE_ENV !== "production") {
			this.executeLog("DEBUG", message, optionalParams, console.log);
		}
	}

	log(message: string, ...optionalParams: unknown[]): void {
		this.executeLog("LOG", message, optionalParams, console.log);
	}

	paint(text: string): string {
		const timestamp = this.formatTimestamp();
		const formattedText = this.formatMessage(text);

		const parts: string[] = [];
		if (timestamp) {
			parts.push(Colors.coloredText(timestamp, { dim: true }));
		}
		parts.push(Colors.coloredText(formattedText, this.config.colorOptions));

		return parts.join(" ");
	}

	// Utility methods for common patterns
	table(data: Record<string, unknown>[]): void {
		if (this.config.silent) return;
		console.table(data);
	}

	group(label?: string): void {
		if (this.config.silent) return;
		console.group(label);
	}

	groupEnd(): void {
		if (this.config.silent) return;
		console.groupEnd();
	}

	clear(): void {
		if (this.config.silent) return;
		console.clear();
	}

	time(label?: string): void {
		if (this.config.silent) return;
		console.time(label);
	}

	timeEnd(label?: string): void {
		if (this.config.silent) return;
		console.timeEnd(label);
	}
}

// Main Console object with builder pattern
const Console = {
	// Direct logging methods (backward compatibility)
	info(message: string, ...optionalParams: unknown[]): void {
		new ConsoleBuilder().info(message, ...optionalParams);
	},

	success(message: string, ...optionalParams: unknown[]): void {
		new ConsoleBuilder().success(message, ...optionalParams);
	},

	warn(message: string, ...optionalParams: unknown[]): void {
		new ConsoleBuilder().warn(message, ...optionalParams);
	},

	error(message: string, ...optionalParams: unknown[]): void {
		new ConsoleBuilder().error(message, ...optionalParams);
	},

	debug(message: string, ...optionalParams: unknown[]): void {
		new ConsoleBuilder().debug(message, ...optionalParams);
	},

	log(
		message: string,
		options: ColorOptions = {},
		...optionalParams: unknown[]
	): void {
		new ConsoleBuilder().withColor(options).log(message, ...optionalParams);
	},

	paint(text: string, options: ColorOptions = {}): string {
		return new ConsoleBuilder().withColor(options).paint(text);
	},

	// Builder pattern entry points
	withTimestamp(format?: TimestampFormat): ConsoleBuilder {
		return new ConsoleBuilder().withTimestamp(format);
	},

	withCustomTimestamp(formatter: () => string): ConsoleBuilder {
		return new ConsoleBuilder().withCustomTimestamp(formatter);
	},

	withLevel(customLevel?: string): ConsoleBuilder {
		return new ConsoleBuilder().withLevel(customLevel);
	},

	withoutLevel(): ConsoleBuilder {
		return new ConsoleBuilder().withoutLevel();
	},

	withColor(options: ColorOptions): ConsoleBuilder {
		return new ConsoleBuilder().withColor(options);
	},

	withBold(): ConsoleBuilder {
		return new ConsoleBuilder().withBold();
	},

	withDim(): ConsoleBuilder {
		return new ConsoleBuilder().withDim();
	},

	withItalic(): ConsoleBuilder {
		return new ConsoleBuilder().withItalic();
	},

	withUnderline(): ConsoleBuilder {
		return new ConsoleBuilder().withUnderline();
	},

	withPrefix(prefix: string): ConsoleBuilder {
		return new ConsoleBuilder().withPrefix(prefix);
	},

	withSuffix(suffix: string): ConsoleBuilder {
		return new ConsoleBuilder().withSuffix(suffix);
	},

	withIndent(level?: number): ConsoleBuilder {
		return new ConsoleBuilder().withIndent(level);
	},

	indent(): ConsoleBuilder {
		return new ConsoleBuilder().indent();
	},

	silent(): ConsoleBuilder {
		return new ConsoleBuilder().silent();
	},

	// Utility methods
	table(data: Record<string, unknown>[]): void {
		new ConsoleBuilder().table(data);
	},

	group(label?: string): void {
		new ConsoleBuilder().group(label);
	},

	groupEnd(): void {
		new ConsoleBuilder().groupEnd();
	},

	clear(): void {
		new ConsoleBuilder().clear();
	},

	time(label?: string): void {
		new ConsoleBuilder().time(label);
	},

	timeEnd(label?: string): void {
		new ConsoleBuilder().timeEnd(label);
	},
};

export { Console, ConsoleBuilder, type LogLevel, type TimestampFormat };
