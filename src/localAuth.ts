import { AuthenticatedSuperPeer1BinaryWrapper } from "./peer.ts";
import bcrypt from "bcrypt";

export class LocalAuthSuperPeer1BinaryWrapper
  extends AuthenticatedSuperPeer1BinaryWrapper {
  override async verifyUser(
    data: { type: "authenticate"; username: string; password: string },
  ): Promise<boolean> {
    const { username, password } = data;
    const kv = await getUsersKv();
    const existingUser = await kv.get<string>(["users", username]);

    if (!existingUser.value) {
      // User does not exist.
      return false;
    }

    const hashedPassword = existingUser.value;
    return bcrypt.compare(password, hashedPassword);
  }
}

export async function addUser(username: string, password: string) {
  const kv = await getUsersKv();
  const existingUser = await kv.get<string>(["users", username]);

  if (existingUser.value) {
    console.log(`User "${username}" already exists.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, username);
  await kv.set(["users", username], hashedPassword);
}

export async function removeUser(username: string) {
  await (await getUsersKv()).delete(["users", username]);
}

let usersKv: Deno.Kv;
async function getUsersKv() {
  usersKv ??= await Deno.openKv(Deno.env.get("USERS_DB_FILE") || "./users.db");
  return usersKv;
}
