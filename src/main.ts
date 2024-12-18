import { join } from "node:path";
import { Cache } from "./handlers/cache";
import { Router } from "./handlers/router";

const PORT = process.env.PORT || 3000;
const routers = join(__dirname, "routes");
const cachePath = join(__dirname, "..", "cache.json");

new Router({
  dir: routers,
  port: PORT,
}).start();

export const cache = new Cache(cachePath);
cache.startTimer();
