import { ConfigStorage, Environment, MatterController, WebSocketControllerHandler } from "@matter-server/controller";
import { StaticFileHandler } from "./server/StaticFileHandler.js";
import { WebServer } from "./server/WebServer.js";

const env = Environment.default;

let controller: MatterController;
let server: WebServer;
let config: ConfigStorage;

async function start() {
    config = await ConfigStorage.create(env);
    controller = await MatterController.create(env, config);

    const host = env.vars.get("server.host", "localhost");
    const port = env.vars.get("server.port", 5580);

    server = new WebServer({ host, port }, [
        new WebSocketControllerHandler(controller.commandHandler, config),
        new StaticFileHandler(),
    ]);

    await server.start();
}

async function stop() {
    await server?.stop();
    await controller?.stop();
    await config?.close();
    process.exit(0);
}

start().catch(err => {
    console.error(err);
    process.exit(1);
});

process.on("SIGINT", () => void stop().catch(err => console.error(err)));
process.on("SIGTERM", () => void stop().catch(err => console.error(err)));
