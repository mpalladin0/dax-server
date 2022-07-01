import { Socket } from "socket.io";
import { User, usersMap } from "../User";

export const userFromSocket = (s: Socket): User | object => {
  const userId = s.handshake.headers.userid as string;
  if (!userId) {
    return {
      status: "error",
      nessage: "userid not provided or found",
    };
  }

  const user = usersMap.get(userId);
  if (!user) {
    return {
      status: "error",
      message: "user does not exist",
    };
  }

  return user;
};
