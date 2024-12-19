import { join } from "node:path";
import { Cache } from "./handlers/cache";
import { Router } from "./handlers/router";
import { Console } from "./utils";
export const console = new Console();

const PORT = process.env.PORT || 3000;
const routers = join(__dirname, "routes");
const cachePath = join(__dirname, "..", "cache.json");

export const cache = new Cache(cachePath);
cache.startTimer();

new Router({
  dir: routers,
  port: PORT,
}).start();
