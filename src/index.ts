import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { run } from "./cli.js";

// Load .env from current working directory and expand variable references
// (same behavior as Prisma CLI, e.g. DATABASE_URL=mysql://${MYSQL_USER}:...)
expand(config());

run(process.argv);
