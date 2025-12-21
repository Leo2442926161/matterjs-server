import { MatterClient } from "../../../client/client.js";

export const showCommissionNodeDialog = async (client: MatterClient) => {
    await import("./commission-node-dialog.js");
    const dialog = document.createElement("commission-node-dialog");
    dialog.client = client;
    document.querySelector("matter-dashboard-app")?.renderRoot.appendChild(dialog);
};
