process.chdir(__dirname);
require('dotenv').config();
const { db_ }  = require('./db/database');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const secret   = process.env.JWT_SECRET;

// Créer un user de test temporaire avec hash connu
const hash = bcrypt.hashSync('TestPass123!', 10);

// Supprimer si déjà existant
db_.run("DELETE FROM users WHERE email='test_unavail@test.local'");

const r = db_.run(
  "INSERT INTO users (email, password, role, staff_id, must_change_password) VALUES (?,?,?,?,0)",
  ['test_unavail@test.local', hash, 'admin', 1]
);
const adminUserId = r.lastInsertRowid;

// User staff (utiliser Marine, staff_id=3, créer si besoin)
db_.run("DELETE FROM users WHERE email='test_staff@test.local'");
const r2 = db_.run(
  "INSERT INTO users (email, password, role, staff_id, must_change_password) VALUES (?,?,?,?,0)",
  ['test_staff@test.local', hash, 'staff', 3]
);
const staffUserId = r2.lastInsertRowid;

console.log('Users créés: admin_id=' + adminUserId + ' staff_id=' + staffUserId);
console.log('Password: TestPass123!');
