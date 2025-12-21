import { Environment, NodeId } from "@matter/main";
import { CommissioningController } from "@project-chip/matter.js";
import { ConfigStorage } from "../server/ConfigStorage.js";
import { ControllerCommandHandler } from "./ControllerCommandHandler.js";

export class MatterController {
    #env: Environment;
    #controllerInstance?: CommissioningController;
    #commandHandler?: ControllerCommandHandler;
    #config: ConfigStorage;

    static async create(environment: Environment, config: ConfigStorage) {
        const instance = new MatterController(environment, config);
        await instance.initialize();
        return instance;
    }

    constructor(environment: Environment, config: ConfigStorage) {
        this.#env = environment;
        this.#config = config;
    }

    protected async initialize() {
        this.#controllerInstance = new CommissioningController({
            environment: {
                environment: this.#env,
                id: "ha-server",
            },
            autoConnect: false, // Do not auto connect to the commissioned nodes
            adminFabricLabel: this.#config.fabricLabel,
            rootNodeId: NodeId(1),
        });
    }

    get commandHandler() {
        if (this.#controllerInstance === undefined) {
            throw new Error("Controller not initialized");
        }
        if (this.#commandHandler === undefined) {
            this.#commandHandler = new ControllerCommandHandler(
                this.#controllerInstance,
                this.#env.vars.get("ble.enable", false),
            );
        }
        return this.#commandHandler;
    }

    async stop() {
        await this.#commandHandler?.close(); // This closes also the controller instance if started
    }
}
