import dotenv from "dotenv";
import { MongoClient } from "mongodb";

type Mode = "delete" | "drop";

function parseArgs(argv: string[]): { collections: string[]; mode: Mode; dryRun: boolean } {
  const collections: string[] = [];
  let mode: Mode = "delete";
  let dryRun = false;

  for (const raw of argv) {
    const a = raw.trim();
    if (!a) continue;
    if (a === "--drop") mode = "drop";
    else if (a === "--delete") mode = "delete";
    else if (a === "--dry-run") dryRun = true;
    else collections.push(a);
  }

  return { collections, mode, dryRun };
}

async function main(): Promise<void> {
  // Load env like the backend (prefer .env.local, fallback to .env).
  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env" });

  const { collections, mode, dryRun } = parseArgs(process.argv.slice(2));
  if (collections.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      [
        "Usage:",
        "  npm run db:clear -- <collection1> <collection2> ... [--delete|--drop] [--dry-run]",
        "",
        "Examples:",
        "  npm run db:clear -- bookings feedbacks",
        "  npm run db:clear -- bookings feedbacks --drop",
        "  npm run db:clear -- bookings --dry-run",
      ].join("\n")
    );
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // eslint-disable-next-line no-console
    console.error("Missing MONGODB_URI (check .env.local or .env)");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();

    // eslint-disable-next-line no-console
    console.log(`Connected to DB: ${db.databaseName}`);
    // eslint-disable-next-line no-console
    console.log(`Mode: ${mode}${dryRun ? " (dry-run)" : ""}`);

    for (const name of collections) {
      const col = db.collection(name);
      const exists = await db.listCollections({ name }).hasNext();

      if (!exists) {
        // eslint-disable-next-line no-console
        console.log(`- ${name}: not found (skip)`);
        continue;
      }

      if (dryRun) {
        const count = await col.countDocuments({});
        // eslint-disable-next-line no-console
        console.log(`- ${name}: would ${mode === "drop" ? "drop" : "delete"} (${count} docs)`);
        continue;
      }

      if (mode === "drop") {
        await col.drop();
        // eslint-disable-next-line no-console
        console.log(`- ${name}: dropped`);
      } else {
        const res = await col.deleteMany({});
        // eslint-disable-next-line no-console
        console.log(`- ${name}: deleted ${res.deletedCount ?? 0} docs`);
      }
    }
  } finally {
    await client.close();
  }
}

void main();

