import { Redis } from "ioredis";
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL is not set");
}
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});
redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
redis.on("connect", () => {
  console.log("[redis] connected");
});
