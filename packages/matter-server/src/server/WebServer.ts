import { type HttpServer, Logger, type WebServerHandler } from "@matter-server/controller";
import { createServer } from "node:http";

const logger = Logger.get("WebServer");

export class WebServer {
    #host: string;
    #port: number;
    #server?: HttpServer;
    #handler: WebServerHandler[];

    constructor(config: WebServer.Config, handler: WebServerHandler[]) {
        const { host, port } = config;
        this.#host = host;
        this.#port = port;
        this.#handler = handler;
    }

    async start() {
        const server = (this.#server = createServer());

        for (const handler of this.#handler) {
            await handler.register(this.#server);
        }

        let resolvedOrErrored = false;
        await new Promise<void>((resolve, reject) => {
            server.listen({ host: "127.0.0.1", port: this.#port }, () => {
                logger.info(`Webserver Listening on http://${this.#host}:${this.#port}`);
                if (!resolvedOrErrored) {
                    resolvedOrErrored = true;
                    resolve();
                }
            });

            server.on("error", err => {
                logger.error("Webserver error", err);
                if (!resolvedOrErrored) {
                    resolvedOrErrored = true;
                    reject(err);
                }
            });
        });
    }

    async stop() {
        this.#server?.close();
        for (const handler of this.#handler) {
            await handler.unregister();
        }
    }
}

export namespace WebServer {
    export interface Config {
        host: string;
        port: number;
    }
}
