class Console {
  private prefix: string = "";
  private suffix: string = "";
  private useTimestamp: boolean = true;

  // ANSI color codes
  private colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    underline: "\x1b[4m",
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
  };

  // Log levels with styles
  private levels: Record<string, { color: string; label: string }> = {
    info: { color: this.colors.blue, label: "INFO" },
    warn: { color: this.colors.yellow, label: "WARN" },
    error: { color: this.colors.red, label: "ERROR" },
    success: { color: this.colors.green, label: "SUCCESS" },
    debug: { color: this.colors.magenta, label: "DEBUG" },
    log: { color: this.colors.white, label: "LOG" },
    trace: { color: this.colors.cyan, label: "TRACE" },
    fatal: { color: this.colors.red, label: "FATAL" },
  };

  constructor(options?: {
    prefix?: string;
    suffix?: string;
    useTimestamp?: boolean;
  }) {
    if (options?.prefix) this.prefix = options.prefix;
    if (options?.suffix) this.suffix = options.suffix;
    if (options?.useTimestamp !== undefined)
      this.useTimestamp = options.useTimestamp;
  }

  private formatMessage(level: string, ...messageParts: unknown[]): string {
    const timestamp = this.useTimestamp ? `[${new Date().toISOString()}]` : "";
    const levelInfo = this.levels[level] || {
      color: this.colors.reset,
      label: "LOG",
    };
    const message = messageParts
      .map((part) =>
        typeof part === "object" ? JSON.stringify(part) : String(part)
      )
      .join(" ");
    return `${levelInfo.color}${levelInfo.label}${this.colors.reset} ${timestamp} ${this.prefix}${message}${this.suffix}`;
  }

  log(...messageParts: unknown[]): void {
    console.log(this.formatMessage("log", ...messageParts));
  }

  info(...messageParts: unknown[]): void {
    console.log(this.formatMessage("info", ...messageParts));
  }

  warn(...messageParts: unknown[]): void {
    console.warn(this.formatMessage("warn", ...messageParts));
  }

  error(...messageParts: unknown[]): void {
    console.error(this.formatMessage("error", ...messageParts));
  }

  success(...messageParts: unknown[]): void {
    console.log(this.formatMessage("success", ...messageParts));
  }

  debug(...messageParts: unknown[]): void {
    console.debug(this.formatMessage("debug", ...messageParts));
  }

  // Utility to add text styles
  styleText(
    text: string,
    styles: ("bold" | "underline" | keyof typeof this.colors)[]
  ): string {
    const appliedStyles = styles
      .map((style) => this.colors[style] || "")
      .join("");
    return `${appliedStyles}${text}${this.colors.reset}`;
  }

  // Configuration methods
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  setSuffix(suffix: string): void {
    this.suffix = suffix;
  }

  enableTimestamp(): void {
    this.useTimestamp = true;
  }

  disableTimestamp(): void {
    this.useTimestamp = false;
  }

  addLevel(
    level: string,
    color: keyof typeof this.colors,
    label: string
  ): void {
    this.levels[level] = { color: this.colors[color], label };
  }
}

export { Console };
