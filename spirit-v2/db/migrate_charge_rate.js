'use strict';
process.chdir(__dirname + '/..');
require('dotenv').config();
const { db_ } = require('./database');

const cols = db_.all('PRAGMA table_info(staff)').map(c => c.name);
if (!cols.includes('charge_rate')) {
  db_.exec('ALTER TABLE staff ADD COLUMN charge_rate REAL NOT NULL DEFAULT 0.45');
  console.log('✅ Colonne charge_rate ajoutée à la table staff');
} else {
  console.log('ℹ️  Colonne charge_rate déjà présente');
}
