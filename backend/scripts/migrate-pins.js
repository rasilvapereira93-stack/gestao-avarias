const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

if (!fs.existsSync(DATA_FILE)) {
  console.error('Ficheiro de dados não encontrado:', DATA_FILE);
  process.exit(1);
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 120000;
  const keylen = 32;
  const digest = 'sha256';
  const hash = crypto.pbkdf2Sync(String(pin).trim(), salt, iterations, keylen, digest).toString('hex');
  return { salt, hash, iterations, keylen, digest };
}

const raw = fs.readFileSync(DATA_FILE, 'utf8');
const db = JSON.parse(raw);

const backup = DATA_FILE + '.bak.' + new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(DATA_FILE, backup);
console.log('Backup criado em', backup);

let changed = false;
const techs = (db.config && db.config.technicians) || [];
for (const t of techs) {
  if (t.pin && typeof t.pin === 'string' && t.pin.trim() !== '') {
    t.pin = hashPin(t.pin);
    changed = true;
    console.log('Migrado PIN para técnico', t.number || t.id);
  }
  // se já estiver object (hash) assumimos migrado
}

if (changed) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log('Ficheiro atualizado com pins hasheados.');
} else {
  console.log('Nenhuma alteração necessária.');
}
