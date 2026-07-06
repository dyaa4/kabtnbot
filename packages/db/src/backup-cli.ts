import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDb, disconnectDb } from './connect.js';
import { exportBackup, importBackup, type BackupData } from './backup.js';

// Repo-root .env, same depth from src/ and dist/.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main(): Promise<void> {
  const [mode, fileArg] = process.argv.slice(2);
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (fill .env at the repo root)');
  if (mode !== 'export' && mode !== 'import') {
    throw new Error('Usage: backup-cli <export [file]> | <import <file>>');
  }

  await connectDb(uri);
  try {
    if (mode === 'export') {
      const file = fileArg ?? path.join('backups', `gamebot-backup-${timestamp()}.json`);
      mkdirSync(path.dirname(file), { recursive: true });
      const data = await exportBackup();
      writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      console.log(
        `Backup written to ${file} (${data.guild_configs.length} configs, ${data.guild_assets.length} assets, ${data.kv.length} kv)`,
      );
    } else {
      if (!fileArg) throw new Error('Usage: backup-cli import <file>');
      const data = JSON.parse(readFileSync(fileArg, 'utf8')) as BackupData;
      const counts = await importBackup(data);
      console.log(`Restored ${counts.configs} configs, ${counts.assets} assets, ${counts.kv} kv entries`);
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
