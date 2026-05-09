import mongoose from 'mongoose';
import { getConfig } from '../config';
import { logger } from '../shared/logger';

let connectedUrl: string | undefined;

export async function connectMongo(url?: string): Promise<typeof mongoose> {
  const target = url ?? getConfig().mongo.url;
  if (mongoose.connection.readyState === 1 && connectedUrl === target) {
    return mongoose;
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(target, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });
  connectedUrl = target;
  logger().info({ url: target.replace(/:\/\/[^@]*@/, '://***@') }, 'mongo connected');
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    connectedUrl = undefined;
  }
}

export function mongoReadyState(): number {
  return mongoose.connection.readyState;
}
