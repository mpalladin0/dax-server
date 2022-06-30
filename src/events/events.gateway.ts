import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import * as THREE from "three";

const desktopConnections = new Set<string>();
const sessions = new Map<string, Room>();

/**
 * <Room ID, Room Object>
 */
const roomsMap = new Map<string, Room>();

/** <socket.id, user> */
const usersMap = new Map<string, User>();

const userFromSocket = (socket: Socket) => usersMap.get(socket.id);

class Controller {
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
  }
}

class User {
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

    console.log(`[New User] User with id ${id} created and added to usersMap.`);
  }

  public joinRoom = ({ id }: { id: string }) => {
    this.socket.forEach((socket) => {
      console.log(`[Join Attempt] ${this.id} attempting to join ${id}`);
      socket.join(id);
    });

    this.currentRoom = roomsMap.get(id);
    console.log(
      `[Join Success] ${this.id} joined room ${this.currentRoom.roomId}`
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
    socket.join(roomId);

    this.controller = new Controller({
      controllerId: controllerId,
      socket: socket,
      user: this,
    });

    this.server.to(roomId).emit("controller paired", roomId);

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
class Room {
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

    server.on("sound ended", () => this.stop());
  }

  public readonly start = () => {
    console.log("!! Starting sound");
    if (this.clock.running) {
      console.log("! Already plaing");
      this.server
        .to(this.roomId)
        .emit("start sound", this.getCurrentPlaybackTime());
    } else {
      console.log("! Not running, starting from 0");
      this.server.to(this.roomId).emit("start sound", 0);
      this.clock.start();
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

/**
 * <User IP, Room Id>
 */
const activeRooms = new Map<string, string>();

// const memoDesktopConnections = () => {
//   let cache = {};

//   return (ip, socket: Socket, server: Server) => {
//     if (ip in cache) {
//       const user = users.get(ip);
//       user.sockets.add(socket);

//       user.sockets.forEach((socket) => {
//         if (!socket.connected) {
//           socket.disconnect();
//           user.sockets.delete(socket);
//         }
//       });

//       if (user.currentRoom) {
//         user.sockets.forEach((socket) => {
//           socket.join(user.currentRoom.id);
//         });
//       }

//       return cache[ip];
//     } else {
//       let state = ip;
//       cache[ip] = state;

//       console.log(
//         "User doesn't exist, creating a new object to represent them."
//       );
//       const user = new User({
//         ip,
//         firstSocket: socket,
//         server: server,
//       });

//       users.set(ip, user);

//       return true;
//     }
//   };
// };

// const addDesktopConnection = memoDesktopConnections();

const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);

const usingXRViewer = (
  userAgent: Socket["request"]["headers"]["user-agent"]
) => {
  const searchFor = ["WebXRViewer"];

  return searchFor.some((el) => {
    return userAgent.includes(el);
  });
};

const ipFromHeaders = (socket: Socket) =>
  socket.request.headers["x-forwarded-for"] as string;

@WebSocketGateway({
  cors: {
    origin: "*",
  },
  allowEIO3: true,
  allowUpgrades: true,
})
export class EventsGateway {
  // <Id, isPaired>
  controller_mobile = new Map();
  controller_desktop = new Map();

  available_mobile = new Set();
  available_desktop = new Set();

  paired = new Map();

  activeDesktopConnections = new Set();

  // sessions = new Map<string, Session>();

  @WebSocketServer()
  server: Server;

  constructor() {
    // this.server.use(wrap(sessionMiddleware));
    // this.hanldeOnConnection();
  }

  @SubscribeMessage("mobile connection")
  onMobileConnection(@ConnectedSocket() socket: Socket): void {
    console.log("[Dax] New MOBILE_CONTROLLER connection " + socket.id);

    if (this.controller_mobile.has(socket.id)) {
      return;
    }
    this.controller_mobile.set(socket.id, false);
    this.available_mobile.add(socket.id);

    // console.log(usingXRViewer(socket.request.headers["user-agent"]));

    this.server.emit("new mobile connection");

    this.server.emit("phone paired to desktop", socket.id);
  }

  @SubscribeMessage("desktop connection")
  async onDesktopConnection(@ConnectedSocket() socket: Socket) {
    const userId = socket.request.headers.userid as string;
    const user = usersMap.get(userId);

    if (!user) {
      const newUser = new User({
        id: userId,
        server: this.server,
        socket: socket,
      });
      console.log(`[Dax] User created on desktop connection: `, newUser.id);
      // socket.on("desktop")
    } else {
      console.log(`[Dax] User found with matching id: ${user.id}\n`);
      // user.socket.forEach((socket) => socket.disconnect());
      user.socket.clear();
      user.socket.add(socket);

      if (user.currentRoom) {
        user.joinRoom({
          id: user.currentRoom.roomId,
        });

        const arr = Array.from(
          this.server.sockets.adapter.rooms.get(user.currentRoom.roomId)
        );

        arr.forEach((socketId) => {
          const socket = this.server.sockets.sockets.get(socketId);

          console.log(
            "THIS SOCKET BELONGS TO USER",
            socket.id,
            socket.connected
          );
        });

        console.log("ROOMS OF USER", arr);

        if (user.controller) {
          if (user.unpairController()) {
            console.log("Controller unpaired.");
          } else {
            if (user.controller) {
              console.log("Controller unpaired.");
            }
            console.log("Error: Controller remained paired.");
          }
        }
      }
      // console.log(user.socket.size);
    }

    // user = users.get(userId)!;

    // // console.log("[Req] ", request.session);
    // // console.log("[Dax] New DESKTOP_CONNECTION connection " + socket.id);
    // if (this.controller_desktop.has(socket.id)) {
    //   return;
    // }
    // this.controller_desktop.set(socket.id, false);
    // this.available_desktop.add(socket.id);

    // const ip = socket.request.headers["x-forwarded-for"] as string;
    // addDesktopConnection(ip, socket, this.server);

    // console.log("Checking desktop connection for rooms..");

    // const user = users.get(ip);
    // if (!user) return;

    // const room = user.currentRoom;
    // if (!room) return;

    // console.log(`[Dax] ${user.ip} room: ${room.id}`);

    // console.log(ip);
    // if (desktopConnections.has(ip)) {
    //   memoizeDesktopConnections();
    //   console.log("returning user");
    // } // logic for returning user
    // else {
    //   console.log("new user");
    //   desktopConnections.add(ip);
    // }

    // console.log(socket.request.headers);

    // contains

    // const ip = socket.request.headers["x-forwarded-for"] as string;
    // this.activeDesktopConnections.add(ip);

    // if (this.activeDesktopConnections.has(ip)) {
    //   if (this.activeSessions.has(ip)) {
    //     console.log("Returning user to active session...");

    //     console.log(ip + ": ", this.activeSessions.get(ip).uuid);
    //   } else {
    //     console.log("Creating new session for ", ip);
    //     this.activeSessions.set(ip, new SessionRoom(socket));
    //   }
    // }

    // for (let header in socket.request.headers) {
    //   if (header === "x-forwarded-for") {
    //     console.log(socket.request.headers[header]);
    //   }
    // }

    // const has = contains(socket.request.headers, "x-forwarded-for");
    // console.log(has);

    // @ts-ignore
    // const session = socket.request.headers;
    // console.log(session);

    // const room = new Room(socket);

    // const convertBlock = (buffer) => {
    //   // incoming data is an ArrayBuffer
    //   const incomingData = new Uint8Array(buffer); // create a uint8 view on the ArrayBuffer
    //   let i,
    //     l = incomingData.length; // length, we need this for the loop
    //   let outputData = new Float32Array(incomingData.length); // create the Float32Array for output
    //   for (i = 0; i < l; i++) {
    //     outputData[i] = (incomingData[i] - 128) / 128.0; // convert audio to float
    //   }
    //   return outputData; // return the Float32Array
    // };

    // const url = "https://dax.michaelpalladino.io/assets/sounds/alright.mp3";
    // https.get(url, (stream) => {
    //   stream.on("data", (chunk) => {
    //     const toFloatArr = convertBlock(chunk);
    //     this.server.emit("audio buffer", toFloatArr);
    //   });
    // });

    // const buffer = new Audio(
    //   "https://dax.michaelpalladino.io/assets/sounds/alright.mp3"
    // );

    // console.log(ctx);

    // buffer.load();
    // buffer.onload = (e) => {
    //   console.log(e);
    // };

    // if (this.sessions.has(socket.id))
    //   this.server.emit(
    //     "returning to session",
    //     socket.id,
    //     this.sessions.get(socket.id).sessionId
    //   );

    // if (!this.sessions.has(socket.id)) {
    //   const session = new Session();
    //   session.listeners.add(socket.id);

    //   this.sessions.set(socket.id, session);

    //   this.server.emit("session created", socket.id, session);
    // }

    // this.server.emit("audio buffer")

    // this.server.emit("new DESKTOP_CONTROLLER avaliable", socket.id)
  }

  @SubscribeMessage("rooms of user")
  onRoomsOfUser(
    @ConnectedSocket() socket: Socket,
    @MessageBody() userId: string
  ): void {
    const user = usersMap.get(userId);
    if (!user) return;

    if (user.currentRoom) {
      console.log(`[Room] ${user.id} has a room, sending it back.`);
      this.server.to(socket.id).emit("rooms of user", user.currentRoom);
    }

    // const ip = ipFromHeaders(socket);

    // if (user.currentRoom) {
    //   console.log(`[Dax] ${ip} already has a room, sending it back..`);
    //   console.log(`---> Host: `, user.currentRoom.host.ip);
    //   this.server.emit(
    //     "rooms of user",
    //     socket.id,
    //     users.get(ip).currentRoom.id
    //   );
    // }

    // if (user.currentRoom) {
    //   const room = user.currentRoom;
    //   roomsMap.delete(room.roomId);
    //   user.currentRoom = null;
    // } else {
    //   console.log("no rooms");
    // }
  }

  @SubscribeMessage("create room")
  onCreateRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    console.log("????");
    const { roomId, userId } = payload;
    console.log(`[Room] Creating room: ${roomId} for user ${userId}`);

    if (roomsMap.get(roomId)) {
      this.server.emit("room created", roomId);
    }

    const room = new Room({
      host: usersMap.get(userId)!,
      roomId,
      server: this.server,
    });

    this.server.emit("room created", room.roomId);
    // const ip = ipFromHeaders(socket);
    // const user = usersMap.get(ip);
    // if (!user) throw new Error("User not found by ip " + ip);
    // console.log(socket.id, "Requesting to create a room..", user.id);
    // const createRoom = () => {
    //   const room = new Room(roomId, this.server, user);
    //   console.log("[Dax] Creating new room for ", ip);
    //   console.log("[Dax] Room ID: ", room.id);
    //   console.log("[Dax] Sending ", ip, " to ", room.id);
    //   user.joinRoom({
    //     id: room.id,
    //   });
    //   socket.join(roomId);
    //   roomsMap.set(roomId, room);
    //   this.server.emit("room created", roomId);
    // };
    // check if user already has a room
    // if (user.currentRoom) {
    //   console.log("[Dax] User already has a room: ", user.currentRoom.roomId);
    //   console.log("---> Current host: ", user.currentRoom.host.id);
    //   return;
    // } else createRoom();
    // console.log(room.id);
  }

  @SubscribeMessage("join room")
  async onJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { roomId: string; userId: string },
    retryAttempts: number = 1
  ) {
    const userIdFromSocket = socket.handshake.headers.userid as string;
    let { roomId, userId } = payload;

    userId = userIdFromSocket;

    // const user = usersMap.get(userId);
    // if (!user) {
    //   if (retryAttempts < 4) {
    //     setTimeout(
    //       () => this.onJoinRoom(socket, payload, retryAttempts++),
    //       100
    //     );
    //     console.log(
    //       `[Join Attempt - Error] User ${userId} not found while attempting to join a room by id ${roomId}, trying again in 100ms. Attempt: ${retryAttempts}`
    //     );
    //   } else {
    //     throw new Error(
    //       `[Join Attempt - Failure] FAILURE: User ${userId} not found while attempting to join a room by id ${roomId}. Max attempts exceeded. Attempt: ${retryAttempts}`
    //     );
    //   }
    // }

    const room = roomsMap.get(roomId);

    if (!room) {
      console.log(`[Room - Creating] ID ${roomId}`);
      const user = usersMap.get(userId);

      if (!user) {
        if (retryAttempts < 4) {
          setTimeout(
            () => this.onJoinRoom(socket, payload, retryAttempts++),
            100
          );
          console.log(
            `[Join Attempt - Error] User ${userId} not found while attempting to join a room by id ${roomId}, trying again in 100ms. Attempt: ${retryAttempts}`
          );
        } else {
          throw new Error(
            `[Join Attempt - Failure] FAILURE: User ${userId} not found while attempting to join a room by id ${roomId}. Max attempts exceeded. Attempt: ${retryAttempts}`
          );
        }

        return;
      }

      const room = new Room({
        roomId,
        host: user,
        server: this.server,
      });

      user.currentRoom = room;

      // user.currentRoom = room;

      console.log(`[Room - Created] ID: ${room.roomId}, Host: ${room.host.id}`);

      return;
    }

    if (room) {
      const user = usersMap.get(userId);
      user.joinRoom({
        id: roomId,
      });
    }

    // if (room && user) {
    //   console.log("Room & User");
    //   user.joinRoom({ id: room.roomId });
    //   return;
    // }

    // console.log(
    //   `[onJoinRoom] User ${user.id} requesting to join room ${roomId}`
    // );

    // const user = userFromSocket(socket)!;
    // console.log(roomId);
    // const room = rooms.get(id)
    // if (room) {
    //   const user = users.get(socket.id)
    // }
    //   const room = rooms.get(id);
    //   const ip = ipFromHeaders(socket);
    //   const user = users.get(ip);
    //   if (!room) return;
    //   if (room.isActive) {
    //     user.joinRoom({ id });
    //   } else {
    //     // logic for if a room isnt active...
    //   }
    // }
  }

  @SubscribeMessage("destroy room")
  onDestroyRoom(@ConnectedSocket() socket: Socket) {}

  @SubscribeMessage("pair controller to room")
  onPairControllerToRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() roomId: string
  ): void {
    console.log(`[Controller] Requesting to pair to ${roomId}`);
    const room = roomsMap.get(roomId);

    if (!room) {
      console.log("[Error] Room not found: ", roomId);
      return;
    }

    room.host.pairController({
      controllerId: randomUUID(),
      roomId,
      socket,
    });

    // this.server.to(roomId).emit("controller paired", roomId);

    // controller.socket
    //   .to(roomId)
    //   .emit("controller paired", controller.controllerId);
    this.server.to(socket.id).emit("controller paired", roomId);
    socket.join(roomId);

    // this.server.emit("controller paired", roomId);

    // socket.join(roomId);

    // const controller = new Controller({
    //   id: randomUUID(),
    //   socket: socket,
    //   user: room.host,
    // });

    // console.log(
    //   `[Controller - Created] ID: ${controller.id}, Socket: ${socket.id}, Host: ${controller.belonngsTo.id}`
    // );

    // socket.conn.on("close", () => {
    //   // console.log(
    //   //   `[Controller Disconnected] From room: ${roomId}. Cleaning up..`
    //   // );
    //   // socket.leave(roomId);
    //   // socket.disconnect();
    //   // this.server.to(roomId).emit("controller disconnected");
    // });
    // socket.on("disconnect", () => {
    //   this.server.to(roomId).emit("controller disconnected");
    // });
    // this.server
    //   .to(roomId)
    //   .emit("controller paired", controller.controllerId, roomId);
  }

  // @SubscribeMessage("pair controller")
  // onPairController(@ConnectedSocket() socket: Socket): void {
  //   const ip = ipFromHeaders(socket);
  //   const user = users.get(ip);

  //   user.pair({
  //     controllerId: randomUUID(),
  //     socket,
  //   });
  // }

  @SubscribeMessage("device motion data")
  onDeviceMotionData(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: typeof DeviceMotionEvent
  ): void {
    const xyz = data[0];
    const alpha_beta_gamma = data[1];

    console.log(data);
    this.server.emit("device-motion-data-frame", xyz, alpha_beta_gamma);
  }

  @SubscribeMessage("device orientation data")
  onDeviceOrientationData(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: any
  ): void {
    // console.log(data)
    // const beta = Math.trunc(data[1])
    // const gamma = Math.trunc(data[2])
    // [data[0], data[1], data[2]] = [Math.round(data[0]), Math.round(data[1]), Math.round(data[2])]

    const roundedAlpha = Math.round(data[0]);
    const roundedBeta = Math.round(data[1]);
    const roundedGamma = Math.round(data[2]);

    const roundedData = [roundedAlpha, roundedBeta, roundedGamma];

    // @depcreciated
    this.server.emit("device-orientation-data-frame", roundedData);

    /** New for rewrite */
    this.server.emit(
      "orientation from server",
      roundedAlpha,
      roundedBeta,
      roundedGamma
    );
  }

  @SubscribeMessage("screen tap")
  onScreenTap(@MessageBody() data: any): void {
    console.log("[From Controller] Screen tapped!", data);
  }

  @SubscribeMessage("finger tap on")
  onFingerTapOn(
    @ConnectedSocket() socket: Socket,
    @MessageBody() roomId: string
  ): void {
    console.log("[From Controller] Finger on:", socket.id, `. Room: ${roomId}`);

    this.server.to(roomId).emit("finger on screen", socket.id);
    // this.server.emit("finger on screen", socket.id);
  }

  @SubscribeMessage("finger tap off")
  onFingerTapOff(
    @ConnectedSocket() socket: Socket,
    @MessageBody() roomId: string
  ): void {
    // console.log(
    //   "[From Controller] Finger off:",
    //   socket.id,
    //   `. Room: ${roomId}`
    // );

    this.server.to(roomId).emit("finger off screen", socket.id);

    // this.server.emit("finger off screen", socket.id);
  }

  @SubscribeMessage("sound elapsed time")
  onSoundElapsedTime(
    @ConnectedSocket() socket: Socket,
    @MessageBody() elapsedTime: number
  ): void {
    console.log(elapsedTime);
  }

  @SubscribeMessage("is phone supported")
  onUnsupportedPhone(
    @MessageBody() isSupported: boolean,
    @ConnectedSocket() socket: Socket
  ): void {
    // console.log("[From Controller] Supported device: ", isSupported, socket.id);
    this.server.emit("is phone supported", isSupported, socket.id);
  }

  @SubscribeMessage("play sound")
  onPlaySound(
    @ConnectedSocket() socket: Socket,
    @MessageBody() userId: string
  ): void {
    console.log("[From Controller] Requesting to play sound:", socket.id);

    const user = usersMap.get(userId);
    if (!user) {
      console.log("User not found!");

      return;
    }

    user.currentRoom.start();

    // const ip = ipFromHeaders(socket);
    // const user = usersMap.get(ip);

    // user.currentRoom.start();

    // if (!user) throw new Error("User not found");

    // const clock = new THREE.Clock();
    // clock.start();
    // checkTime();

    // function checkTime() {
    //   console.log(clock.getElapsedTime());
    //   setImmediate(checkTime);
    // }

    // this.server.to(user.currentRoom.id).emit("start sound");
  }

  @SubscribeMessage("get elapsed time")
  onGetElapsedTime(@ConnectedSocket() socket: Socket): void {
    const ip = ipFromHeaders(socket);
    const user = usersMap.get(ip);

    const time = user.currentRoom.getCurrentPlaybackTime();
    console.log(time);

    this.server.to(user.currentRoom.roomId).emit("elapsed time", time);
  }

  @SubscribeMessage("xr active")
  onXrActive(
    @MessageBody() roomId: string,
    @ConnectedSocket() socket: Socket
  ): void {
    // console.log(socket.listenerCount("xr active"));
    // socket..local.allSockets()("xr active");
    // socket.join(roomId);
    // socket.to(roomId).emit("xr active");
    // socket.to(roomId).emit("xr active");
    // console.log("[From Controller] XR state is active ", socket.id);

    this.server.emit("xr active");

    console.log(`[Dax] Informing room ${roomId} about XR state.`);
    this.server.to(roomId).emit("xr active", socket.id);
  }

  @SubscribeMessage("xr inactive")
  onXrInactiveg(
    @MessageBody() roomId: string,
    @ConnectedSocket() socket: Socket
  ): void {
    // console.log("[From Controller] XR state is inactive ", socket.id);

    socket.emit("xr inactive", socket.id);

    this.server.to(roomId).emit("xr inactive", socket.id);
  }

  @SubscribeMessage("debug")
  onDebug(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    console.log(socket.id, payload);
  }

  @SubscribeMessage("sound placement from controller")
  onSoundPlacementFromController(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    if (!payload) return;
    const { room, position } = payload;
    console.log(room, position);
    // const { roomId, boxPositionPayload } = payload
    // console.log(
    //   `[Room ${payload.roomId}] Sound placement:, ${payload.boxPositionPayload}}`
    // );
    // socket.emit("sound placement from server", position);
    // this.server.emit("sound placement from server", position);

    this.server.to(room).emit("sound placement from controller", position);
  }

  @SubscribeMessage("add MOBILE_CONTROLLER to pairing pool")
  onAdd_MOBILE_CONTROLLER(@ConnectedSocket() socket: Socket): void {
    console.log(
      "[DAX] MOBILE_CONTROLLER requesting to be added to pairing pool: ",
      socket.id
    );
  }

  @SubscribeMessage("add DESKTOP_CONTROLLER to pairing pool")
  onAdd_DESKTOP_CONTROLLER(@ConnectedSocket() socket: Socket): void {
    console.log(
      "[DAX] DESKTOP_CONTROLLER requesting to be added to pairing pool: ",
      socket.id
    );

    this.available_desktop.add(socket.id);

    // console.log(this.available_desktop)
  }

  @SubscribeMessage("PAIR MOBILE_CONTROLLER WITH")
  on_PAIR_MOBILE_CONTROLLER_WITH(
    @ConnectedSocket() socket: Socket,
    @MessageBody() desktopId: string
  ): void {
    console.log(
      "[DAX] MOBILE_CONTROLLER requesting to be paired to: ",
      desktopId
    );

    // this.paired.set(socket.id, desktopId)

    // this.available_desktop.delete(desktopId)
    // this.available_mobile.delete(socket.id)

    // this.server.emit("Succesfully paired MOBILE_CONTROLLER to DESKTOP_CONTROLLER", desktopId, socket.id)
  }

  /**
   * Use 2nd order ODE to estimate x, y, z
   */
  private estimateSpace(
    x: number,
    y: number,
    z: number,
    acceleration: number,
    velocity: number,
    position: number
  ) {
    const estimated = {
      x: 0,
      y: 0,
      z: 0,
    };
  }

  // @SubscribeMessage("sound added from desktop")
  // onSoundAddedFromDesktop(
  //   @ConnectedSocket() socket: Socket,
  //   @MessageBody() payload: any,
  // ): void {
  //   console.log("[From Desktop] Sound added ", payload)
  //   this.server.emit("add sound", payload)
  // }

  @SubscribeMessage("sound moved from desktop")
  onSoundMovedFromDesktop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    // console.log(payload)
    this.server.emit("move sound", payload);
  }

  @SubscribeMessage("sound moved from phone")
  onSoundMovedFromPhone(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    // console.log(payload)
    this.server.emit("move sound on desktop from phone", payload);
    // this.server.emit("move sound", payload)
  }

  @SubscribeMessage("selecting")
  onSelecting(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    // console.log("[From Phone] Selecting ", payload)
    // this.server.emit("add sound", payload)
  }

  @SubscribeMessage("all sound positions")
  onAllSoundPositions(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    // console.log("[From Desktop] All sound positions ", payload)

    this.server.emit("add sound", payload);
  }

  @SubscribeMessage("phone needs all sound positions from desktop")
  onPhoneNeedsAllSoundPositionsFromFromDesktop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    // console.log("[From Phone] Requesting all the sounds you have ")

    this.server.emit("phone needs all sound positions");
  }

  @SubscribeMessage("sound selected from phone to be moved")
  onSoundSelectedFromPhoneToBeMoved(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    this.server.emit("select sound from phone", payload);
  }

  @SubscribeMessage("sound selected from desktop")
  onSelectedFromDesktop(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    console.log(payload);
    this.server.emit("select sound", payload);
  }

  // @SubscribeMessage('connected to server')
  // onConnection(
  //   @ConnectedSocket() socket: Socket
  // ): void {
  //   console.log("New client connected", socket.id);
  // }

  // @SubscribeMessage("device motion")
  // onDeviceMotion(
  //   @ConnectedSocket() socket: Socket,
  //   @MessageBody() data: any,
  // ): any {

  //   console.log("[From Controller] Device Motion ", { data })
  //   this.server.emit("device motion", data)
  // }

  // @SubscribeMessage("device orientation")
  // onDeviceOrientation(
  //   @ConnectedSocket() socket: Socket,
  //   @MessageBody() data: any,
  // ): any {

  //   // console.log("[From Controller] Device Orientation ", { data })
  // }

  // @SubscribeMessage('pair to audio player')
  // onPairRequest_to_AudioPlayer(
  //   @ConnectedSocket() socket: Socket
  // ): void {
  //   if (!this.controller_ready.has(socket)) {
  //     console.log("[From Controller] Requesting to pair to a player: ", socket.id)
  //     this.controller_ready.add(socket)
  //   }

  //   if (this.dax_ready.size > 0) {
  //     const it = this.dax_ready.entries();
  //     for (const entry of it) {
  //       this.paired.set(socket, entry)
  //       break;
  //     }

  //     if (this.dax_ready.size >0) {
  //       console.log("READY TO GO!!!!")
  //       this.server.emit("paired", this.dax_ready)
  //     }
  //   }

  // }

  // @SubscribeMessage('ready to pair to controller')
  // readyToPairToController(
  //   @ConnectedSocket() socket: Socket
  // ): void {
  //   if (!this.dax_ready.has(socket)) {
  //     console.log("[From DAX] Ready to pair to a Controller: ", socket.id)
  //     this.dax_ready.add(socket)
  //     this.server.emit("")
  //   }
  // }

  // // @SubscribeMessage('ready to pair with controller')
  // // async readyToPair_WithController(
  // //   @ConnectedSocket() client: Socket,
  // //   @MessageBody() data: number
  // // ): Promise<number> {
  // //   console.log("[Sever] Server ready to pair with Controller", client.id);

  // //   if (!this.client_ready.has(client)) {
  // //     this.client_ready.add(client);
  // //     this.server.emit("discover")
  // //     this.Discover(client, "server");

  // //   }
  // //   return data;
  // // }

  // // @SubscribeMessage('ready to pair with server')
  // // async readyToPair_WithServer(
  // //   @ConnectedSocket() client: Socket,
  // //   @MessageBody() data: number
  // // ): Promise<number> {
  // //   console.log("[Sever] Controller ready to pair with Server", client.id);

  // //   if (!this.controller_ready.has(client)) {
  // //     this.controller_ready.add(client);
  // //     this.Discover(client, "controller");
  // //   }
  // //   return data;
  // // }

  // // @SubscribeMessage('discover')
  // // private async Discover(
  // //   @ConnectedSocket() socket: Socket,
  // //   type: string,
  // // ): Promise<void> {
  // //   console.log("[Sever] Starting device disovery...")
  // //   switch (type) {
  // //     case "controller":

  // //         this.paired.set(socket, this.client_ready.entries()[0])
  // //         const remove = this.client_ready.entries()[0];
  // //         this.client_ready.delete(remove);

  // //     break
  // //     case "server":

  // //     break
  // //     default:
  // //       throw new Error(`Unknown type ${type}`)
  // //   }

  // //   this.paired.forEach((key, value) => {
  // //     console.log(key, value)
  // //   })

  // // }
}
