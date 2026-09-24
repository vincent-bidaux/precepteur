import { handleGrade } from "../shared/grade.js";

export const config = { path: "/api/grade" };

export default async (req) => handleGrade(req);
