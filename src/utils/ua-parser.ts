export class SimpleUAParser {
	private userAgent: string;

	constructor(userAgent: string) {
		this.userAgent = userAgent.toLowerCase();
	}

	getDevice(): { type: string } {
		if (this.userAgent.includes("mobile")) return { type: "mobile" };
		if (this.userAgent.includes("tablet")) return { type: "tablet" };
		if (this.userAgent.includes("smarttv")) return { type: "tv" };
		return { type: "desktop" };
	}

	getBrowser(): { name: string } {
		if (this.userAgent.includes("edg")) return { name: "Edge" };
		if (this.userAgent.includes("chrome")) return { name: "Chrome" };
		if (this.userAgent.includes("safari")) return { name: "Safari" };
		if (this.userAgent.includes("firefox")) return { name: "Firefox" };
		if (this.userAgent.includes("msie") || this.userAgent.includes("trident"))
			return { name: "Internet Explorer" };
		return { name: "Unknown" };
	}
}
