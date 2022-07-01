import { Server, Socket } from "socket.io";
import * as THREE from "three";
import { Controller } from "./Controller";
import { User } from "./User";

export const roomsMap = new Map<string, Room>();

export class Room {
  private readonly clock = new THREE.Clock();
  readonly roomId: string;
  host: User;
  isPlaying = false;
  isActive = true;
  controller: Controller;
  readonly listeners = new Set<User>();
  private readonly server: Server;

  constructor({
    roomId,
    server,
    host,
  }: {
    roomId: string;
    server: Server;
    host: User;
  }) {
    roomsMap.set(roomId, this);
    this.roomId = roomId;
    this.host = host;
    this.server = server;

    this.host.joinRoom({
      id: roomId,
    });

    server.on("sound ended", () => {
      this.stop();
      this.isPlaying = false;
      console.log(`[Room] Sound ended, destroying room..`);

      server.emit("destroy room", this.roomId);
    });
  }

  public readonly start = ({ socket }: { socket: Socket }) => {
    console.log("!! Starting sound");
    if (this.clock.running) {
      this.server
        .to(this.roomId)
        .emit("start sound", this.getCurrentPlaybackTime());
      console.log("! Already plaing");
    } else {
      console.log("! Not running, starting from 0");
      this.server.to(this.roomId).emit("start sound", 0);
      this.clock.start();
      //   this.isPlaying = true;
    }
  };
  public readonly stop = () => {
    this.clock.stop();
    this.clock.elapsedTime = 0;
    this.clock.startTime = 0;
  };
  public readonly getCurrentPlaybackTime = () => {
    if (this.clock.running) return this.clock.getElapsedTime();
    else return 0;
  };
}
