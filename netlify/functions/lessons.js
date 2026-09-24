import { openStore } from "../shared/db.js";
import { handleLessons } from "../shared/lessons.js";

export const config = { path: "/api/lessons" };

export default async (req) => handleLessons(req, openStore(), { parentCode: process.env.PRECEPTEUR_CODE_PARENT });
