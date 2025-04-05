import { join } from "node:path";
import { Cache } from "./handlers/cache";
import { Router } from "./handlers/router";
import { Console } from "./utils";
export const console = new Console();

const PORT = process.env.PORT || 3000;
const DBName = process.env.DBName ?? "db.sqlite";
export const routers = join(__dirname, "routes");
export const dbPath = join(__dirname, "..",  DBName);

export const cache = new Cache(dbPath);
cache.startTimer();

new Router({
  dir: routers,
  port: PORT,
}).start();
