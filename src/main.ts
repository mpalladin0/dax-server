import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Uncomment these lines to use the Redis adapter:
  // const redisIoAdapter = new RedisIoAdapter(app);
  // await redisIoAdapter.connectToRedis();
  // app.useWebSocketAdapter(rediswIoAdapter);

  await app.listen(process.env.PORT || 3030);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
