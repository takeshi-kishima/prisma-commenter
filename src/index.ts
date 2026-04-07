import { config } from "dotenv";
import { run } from "./cli.js";

// Load .env from current working directory (same behavior as Prisma CLI)
config();

run(process.argv);
