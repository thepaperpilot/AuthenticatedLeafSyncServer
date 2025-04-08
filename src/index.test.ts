import { assertExists, assertRejects } from "@std/assert";
import {
  addUser,
  closeUsersKv,
  getUsersKv,
  removeUser,
  startServer,
} from "./index.ts";
import { assertEquals } from "@std/assert/equals";

Deno.test("user operations", async (t) => {
  const username = "fakeUsername";
  const password = "somePassword";

  await t.step("add user", async () => {
    await addUser(username, password);
    assertExists((await getUsersKv()).get(["users", username]));
  });

  await t.step("remove user", async () => {
    await removeUser(username);
    assertEquals(
      (await (await getUsersKv()).get(["users", username])).value,
      null,
    );
  });

  closeUsersKv();
});

async function testCredentials(
  address: string,
  username: string,
  password: string,
) {
  const socket = new WebSocket("ws://localhost:8000", [
    "authorization",
    `${username}-${password}`,
  ]);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  }).finally(() => socket.close());
}

Deno.test("socket connection", async (t) => {
  const username = "validUsername";
  const password = "validPassword";

  const otherUsername = "invalidUsername";
  const otherPassword = "invalidPassword";

  await addUser(username, password);
  const server = await startServer({
    port: 8000,
    dbFile: "./data/test.sqlite",
  });
  const { hostname, port } = server.addr;
  const address = `ws://${hostname}:${port}`;

  await t.step("authorized connection", async () => {
    await testCredentials(address, username, password);
  });

  await t.step("unauthorized connection", async () => {
    const socket = new WebSocket(address);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", reject);
      socket.addEventListener("error", resolve);
    });
  });

  await t.step("unrecognized credentials", async () => {
    await assertRejects(() =>
      testCredentials(address, otherUsername, otherPassword)
    );
  });

  await t.step("incorrect credentials", async () => {
    await assertRejects(() =>
      testCredentials(address, username, otherPassword)
    );
  });

  await removeUser(username);
  closeUsersKv();
  await server.shutdown();
});
