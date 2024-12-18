import { fileRouter } from "@/handlers/router";
import { serve } from "bun";

const PORT = process.env.PORT || 3000;

console.log(`Server running on PORT ${PORT}`);

serve({
  port: PORT,
  fetch: (request) => fileRouter(request),
});
