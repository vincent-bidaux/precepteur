import { openStore } from "../shared/db.js";
import { handleGrade } from "../shared/grade.js";
import { anthropicClient } from "../shared/ai.js";

export const config = { path: "/api/grade" };

export default async (req) => handleGrade(req, { client: anthropicClient(), store: openStore() });
