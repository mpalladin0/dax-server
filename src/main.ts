import { NestFactory } from "@nestjs/core";
import * as session from "express-session";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    session({
      secret: "randomsecret",
      resave: false,
      saveUninitialized: false,
    })
  );

  // Uncomment these lines to use the Redis adapter:
  // const redisIoAdapter = new RedisIoAdapter(app);
  // await redisIoAdapter.connectToRedis();
  // app.useWebSocketAdapter(rediswIoAdapter);

  await app.listen(process.env.PORT || 3030);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
