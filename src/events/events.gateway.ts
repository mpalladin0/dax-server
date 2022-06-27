import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: "https://dax.michaelpalladino.io",
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

  @WebSocketServer()
  server: Server;

  constructor() {}

  @SubscribeMessage("mobile connection")
  onMobileConnection(@ConnectedSocket() socket: Socket): void {
    console.log("[Dax] New MOBILE_CONTROLLER connection " + socket.id);

    if (this.controller_mobile.has(socket.id)) {
      return;
    }
    this.controller_mobile.set(socket.id, false);
    this.available_mobile.add(socket.id);

    this.server.emit("new mobile connection");

    this.server.emit("phone paired to desktop", socket.id);
  }

  @SubscribeMessage("desktop connection")
  onDesktopConnection(@ConnectedSocket() socket: Socket): void {
    console.log("[Dax] New DESKTOP_CONNECTION connection " + socket.id);
    if (this.controller_desktop.has(socket.id)) {
      return;
    }
    this.controller_desktop.set(socket.id, false);

    this.available_desktop.add(socket.id);
    // this.server.emit("new DESKTOP_CONTROLLER avaliable", socket.id)
  }

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
  onFingerTapOn(@ConnectedSocket() socket: Socket): void {
    console.log("[From Controller] Finger on:", socket.id);
    this.server.emit("finger on screen", socket.id);
  }

  @SubscribeMessage("finger tap off")
  onFingerTapOff(@ConnectedSocket() socket: Socket): void {
    console.log("[From Controller] Finger off:", socket.id);
    this.server.emit("finger off screen", socket.id);
  }

  @SubscribeMessage("is phone supported")
  onUnsupportedPhone(
    @MessageBody() isSupported: boolean,
    @ConnectedSocket() socket: Socket
  ): void {
    console.log("[From Controller] Supported device: ", isSupported, socket.id);
    this.server.emit("is phone supported", isSupported, socket.id);
  }

  @SubscribeMessage("play sound")
  onPlaySound(@ConnectedSocket() socket: Socket): void {
    console.log("[From Controller] Requesting to play sound:", socket.id);
    this.server.emit("play sound", socket.id);
  }

  @SubscribeMessage("xr active")
  onXrActive(@ConnectedSocket() socket: Socket): void {
    console.log("[From Controller] XR state is active ", socket.id);

    this.server.emit("xr active", socket.id);
  }

  @SubscribeMessage("xr inactive")
  onXrInactiveg(@ConnectedSocket() socket: Socket): void {
    console.log("[From Controller] XR state is inactive ", socket.id);

    this.server.emit("xr inactive", socket.id);
  }

  @SubscribeMessage("debug")
  onDebug(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ): void {
    console.log(socket.id, payload);
  }

  @SubscribeMessage("sound placement from controller")
  onSoundPlacementFromController(@MessageBody() position: any): void {
    // console.log("[From Controller] Sound placement update", position);
    this.server.emit("sound placement from server", position);
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
