import type { MatchedRoute, Server } from "bun";

export class RouterContext {
  responseInit: ResponseInit = {};
  
  constructor(
    public request: Request,
    public matchedRoute: MatchedRoute,
    public server: Server
  ) {
  }

  get url(): URL {
    return new URL(this.request.url);
  }

  get params(): Record<string, string> {
    return this.matchedRoute.params;
  }

  get query(): Record<string, string> {
    return Object.fromEntries(this.url.searchParams);
  }

  private async getBody(): Promise<unknown> {
    try {
      return this.request.body ? await this.request.json() : void 0;
    } catch (error) {
      throw new Error("Invalid JSON");
    }
  }
}
