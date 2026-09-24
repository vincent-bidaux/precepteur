import { openStore } from "../shared/db.js";
import { handleJobs } from "../shared/jobs.js";
import { anthropicClient } from "../shared/ai.js";

export const config = { path: "/api/jobs" };

export default async (req) => handleJobs(req, openStore(), { client: anthropicClient(), parentCode: process.env.PRECEPTEUR_CODE_PARENT });
