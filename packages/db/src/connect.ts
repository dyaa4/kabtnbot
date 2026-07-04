import mongoose from 'mongoose';

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  // Tests rely on unique indexes being active immediately.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
