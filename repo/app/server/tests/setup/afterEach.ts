import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../../src/db/mongo';

beforeAll(async () => {
  await connectMongo();
});

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await collections[key]!.deleteMany({});
  }
});

afterAll(async () => {
  await disconnectMongo();
});
