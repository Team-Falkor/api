import type { PluginSetupJSON } from "@/@types";
import { providers } from "@/handlers/providers";
import type { RouterHandler } from "@/handlers/router";
import { Console } from "@/utils";

const console = new Console({
    prefix: "[Plugin Providers] ",
});

export const GET: RouterHandler = async ({ query, request, server }) => {
    // Extract search query
    const { query: searchQuery } = query;
    const searchTerm = searchQuery as string;

    // Extract the IP address from request headers
    let ip =
        server.requestIP(request)?.address;

    if (!ip) {
        return new Response("No IP address found", {
            status: 400,
        });
    }

    // Return cached response if available
    const results = providers.searchProviders(
        {
            setupJSON: {
                name: searchTerm,
            },
        },
        ip
    );

    return new Response(JSON.stringify(results), {
        headers: {
            "Content-Type": "application/json",
        },
        status: results?.success ? 200 : 404,
    });
};

export const POST: RouterHandler = async ({ request, server }) => {
    try {
        let ip = server.requestIP(request)?.address;

        if (!ip) {
            return new Response("No IP address found", {
                status: 400,
            });
        }

   

        const body: {
            setupUrl?: string, setupJSON?: PluginSetupJSON
        } = await request.json(); 


        if (!body.setupUrl ) {
            return new Response("No setup url", {
                status: 400,
            });
        }

        if (!body.setupJSON ) {
            return new Response("No setup json", {
                status: 400,
            }); 
        }

        const results = providers.addProvider(body.setupUrl, body.setupJSON, ip);

        return new Response(JSON.stringify(results), {
            headers: {
                "Content-Type": "application/json",
            },
            status: results?.success ? 200 : 404,
        });
    } catch (error) {
        console.error({error});

        return new Response("Internal server error", {
            status: 500,
        });
    }
}