import { Socket } from "socket.io";
import { User } from "./User";

export const controllerMap = new Map<string, Controller>();

export class Controller {
  public readonly controllerId: string;
  public readonly belonngsTo: User;
  public readonly socket: Socket;

  constructor({
    controllerId,
    user,
    socket,
  }: {
    controllerId: string;
    user: User;
    socket: Socket;
  }) {
    this.controllerId = controllerId;
    this.belonngsTo = user;
    this.socket = socket;

    controllerMap.set(this.controllerId, this);

    console.log(`[Controller] Created: ${controllerId}`);
    console.log(`----> Belongs to ${user.id}`);
  }
}
