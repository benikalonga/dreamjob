import { db } from '../db';
import { hashPassword } from '../lib/auth';
import { newId, now } from '../lib/ids';

async function main() {
  const [email, password, ...name] = process.argv.slice(2);
  if (!email || !password || password.length < 12 || !name.length) {
    console.error('Usage: npm run admin:create -- YOUR_EMAIL@fakeemail.com "YOUR_PASSWORD" YOUR_NAME');
    process.exit(1);
  }
  const id = newId();
  db.prepare("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?,?,?,?,'admin',?)").run(id, email.toLowerCase(), await hashPassword(password), name.join(' '), now());
  db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?,?)').run(id, now());
  console.log(`Admin ${email} created`);
}
void main();
