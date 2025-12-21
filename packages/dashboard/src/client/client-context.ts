import { createContext } from "@lit/context";
import type { MatterClient } from "./client.js";

export const clientContext = createContext<MatterClient>("client");
