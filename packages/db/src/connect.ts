import mongoose from 'mongoose';

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  // createIndexes, NOT syncIndexes: both build every schema-declared index up
  // front (tests rely on unique indexes being active immediately), but
  // syncIndexes additionally DROPS indexes it doesn't know about — a hot-fix
  // index added manually in Atlas would silently vanish on the next deploy.
  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
