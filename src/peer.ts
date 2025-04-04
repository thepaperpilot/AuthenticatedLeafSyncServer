import { decode } from "@msgpack/msgpack";
import { SuperPeer1 } from "@muni-town/leaf/sync1";
import {
  clientMessage as leafClientMessage,
  SuperPeer1BinaryWrapper,
} from "@muni-town/leaf/sync1/proto";
import { type } from "arktype";

/**
 * A {@linkcode SuperPeer1BinaryWrapper} that can also handle an authentication message,
 and which locks sendUpdate to only those who are authenticated.
 */
export abstract class AuthenticatedSuperPeer1BinaryWrapper
  extends SuperPeer1BinaryWrapper {
  #superPeer: SuperPeer1;
  #socket: WebSocket;
  #authenticated: boolean = false;

  constructor(superPeer: SuperPeer1, socket: WebSocket) {
    super(superPeer);
    this.#superPeer = superPeer;
    this.#socket = socket;
  }

  /**
   * Returns true if the user should be able to send updates.
   */
  abstract verifyUser(
    data: { type: "authenticate"; username: string; password: string },
  ): Promise<boolean>;

  override async send(clientMessage: Uint8Array): Promise<void> {
    const data = decodeClientMessage(clientMessage);
    if (!data) return Promise.resolve();

    if (data.type == "sendUpdate") {
      if (this.#authenticated) {
        this.#superPeer.sendUpdate(data.entityId, data.update);
      }
    } else if (data.type == "authenticate") {
      if (await this.verifyUser(data)) {
        this.#authenticated = true;
      }
    } else {
      SuperPeer1BinaryWrapper.prototype.send.call(this, clientMessage);
    }

    return Promise.resolve();
  }
}

/** Type verifier for client messages. */
export const clientMessage = leafClientMessage.or({
  type: "'authenticate'",
  username: "string",
  password: "string",
});
/** The type of messages sent from the client to the server. */
export type ClientMessage = typeof clientMessage.infer;

/** Decode a binary client message. */
export function decodeClientMessage(
  msg: Uint8Array,
): ClientMessage | undefined {
  const data = clientMessage(decode(msg));
  if (data instanceof type.errors) {
    console.error(data.summary);
    return;
  }
  return data;
}
