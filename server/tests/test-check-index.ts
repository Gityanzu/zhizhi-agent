import * as path from 'path';
import * as fs from 'fs';

const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const match = line.match(/^([\w]+)=(.*)$/);
    if (match) {
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  });
}

import { query } from '../src/db';

async function check() {
  const r = await query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND (indexname='idx_sessions_updated' OR indexname='idx_messages_session_created')");
  console.log('Found indexes:', r.rows);
}

check();
