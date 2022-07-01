import { Server, Socket } from "socket.io";
import { Controller } from "./Controller";
import { Room, roomsMap } from "./Room";

export const usersMap = new Map<string, User>();

export class User {
  public readonly id: string;
  public currentRoom: Room = null;
  public readonly socket = new Set<Socket>();
  private readonly server: Server;
  controller: Controller;

  // public controller;

  constructor({
    id,
    socket,
    server,
  }: {
    id: string;
    socket: Socket;
    server: Server;
  }) {
    this.id = id;
    this.socket.add(socket);
    this.server = server;

    usersMap.set(id, this);
    console.log(`[Dax] User created: ${id}`);
  }

  public joinRoom = ({ id }: { id: string }) => {
    if (id === undefined) return;
    this.socket.forEach((socket) => {
      console.log(`[Join Attempt] ${this.id} attempting to join ${id}`);
      socket.join(id);
    });

    this.currentRoom = roomsMap.get(id);
    console.log(
      `[User: Join Success] ${this.id} joined room ${this.currentRoom.roomId}`
    );
  };

  public pairController = ({
    controllerId,
    socket,
    roomId,
  }: {
    controllerId: string;
    socket: Socket;
    roomId: string;
  }) => {
    if (roomId === null || roomId === undefined) {
      console.log("[Controller - Error] Room ID cannot be null or undefined.");
      return;
    }

    this.controller = new Controller({
      controllerId: controllerId,
      socket: socket,
      user: this,
    });

    // socket.join(roomId);
    // this.server.to(roomId).emit("controller paired", roomId);

    return this.controller;
  };

  public unpairController = () => {
    if (this.controller && this.currentRoom) {
      this.controller.socket.leave(this.currentRoom.roomId);
      this.controller.socket.removeAllListeners();
      this.controller.socket.disconnect();
      this.controller = null;

      return true;
    } else {
      return false;
    }
  };
}
