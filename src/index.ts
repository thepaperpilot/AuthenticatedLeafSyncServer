import { StorageManager } from "@muni-town/leaf/storage";
import { denoKvStorageAdapter } from "@muni-town/leaf/storage/deno-kv";
import { SuperPeer1 } from "@muni-town/leaf/sync1";
import { handleRequest as handlePeerRequest } from "@muni-town/leaf/sync1/ws-server";
import bcrypt from "bcrypt";
import { error } from "itty-router";

let usersKv: Deno.Kv | undefined;
export async function getUsersKv() {
  usersKv ??= await Deno.openKv(Deno.env.get("USERS_DB_FILE") || "./users.db");
  return usersKv;
}

export function closeUsersKv() {
  usersKv?.close();
  usersKv = undefined;
}

export async function addUser(username: string, password: string) {
  const kv = await getUsersKv();
  const existingUser = await kv.get<string>(["users", username]);

  if (existingUser.value) {
    console.log(`User "${username}" already exists.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await kv.set(["users", username], hashedPassword);
}

export async function removeUser(username: string) {
  await (await getUsersKv()).delete(["users", username]);
}

export async function verifyUser(username: string, password: string) {
  const kv = await getUsersKv();
  const existingUser = await kv.get<string>(["users", username]);

  if (!existingUser.value) {
    // User does not exist.
    return false;
  }

  const hashedPassword = existingUser.value;
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Handle an HTTP request, upgrading it to a websocket connection, and hosting the super peer binary
 * protocol over it.
 */
export async function handleRequest(
  superPeer: SuperPeer1,
  request: Request,
): Promise<Response> {
  // Get the authorization token from the header
  const credentials = request.headers
    .get("Sec-WebSocket-Protocol")
    ?.split("authorization,")[1]
    ?.trim();
  const [username, password] = credentials?.split("-") ?? [];
  const authenticated = await verifyUser(username ?? "", password ?? "");
  if (!authenticated) {
    return error(401, "You are not authorized to connect to this sync server");
  }

  return handlePeerRequest(superPeer, request);
}

/** Start a websocket sync server */
export async function startServer(opts: { port: number; dbFile: string }) {
  const db = await Deno.openKv(opts.dbFile);

  const superPeer = new SuperPeer1(
    new StorageManager(denoKvStorageAdapter(db)),
  );
  const server = Deno.serve({ port: opts.port }, (req) => {
    return handleRequest(superPeer, req);
  });
  server.finished.then(() => db.close());

  return server;
}

if (import.meta.main) {
  const [command, ...args] = Deno.args;
  if (command === "add_user" && args.length >= 2) {
    addUser(args[0], args[1]);
  } else if (command === "remove_user" && args.length >= 1) {
    removeUser(args[0]);
  } else {
    const port = parseInt(Deno.env.get("PORT") || "8000");
    const dbFile = Deno.env.get("DB_FILE") || "./data.sqlite";

    startServer({ port, dbFile });
  }
}
