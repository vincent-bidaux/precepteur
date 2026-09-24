import { openStore } from "../shared/db.js";
import { handleLog } from "../shared/log.js";

export const config = { path: "/api/log" };

export default async (req) => handleLog(req, openStore());
