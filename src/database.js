const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'data.db');
let db;

function init() {
  if (db) { try { db.close(); } catch(e) {} }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT
    );
    CREATE TABLE IF NOT EXISTS invoices (
      user_id INTEGER PRIMARY KEY,
      server_name TEXT,
      user_name TEXT,
      time_label TEXT,
      volume_label TEXT,
      amount REAL,
      last_message_id INTEGER,
      stage TEXT
    );
    CREATE TABLE IF NOT EXISTS awaiting_receipts (
      user_id INTEGER PRIMARY KEY,
      server_name TEXT,
      amount REAL
    );
  `);
  console.log('📦 Database initialized:', DB_PATH);
}

// Close and reopen database (used after restoring a backup file)
function reinit() {
  console.log('🔄 Reinitializing database connection...');
  if (db) {
    try { db.close(); } catch(e) { console.error('Error closing old db:', e.message); }
    db = null;
  }
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  console.log('📦 Database reconnected:', DB_PATH);
}

function loadState() {
  const settings = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    settings[row.key] = row.value;
  }

  const users = db.prepare('SELECT user_id FROM users').all().map(r => r.user_id);

  const invoices = {};
  for (const row of db.prepare('SELECT * FROM invoices').all()) {
    invoices[row.user_id] = {
      serverName: row.server_name,
      userName: row.user_name,
      timeLabel: row.time_label,
      volumeLabel: row.volume_label,
      amount: row.amount,
      lastInvoiceMessageId: row.last_message_id,
      stage: row.stage,
    };
  }

  const awaitingReceipts = {};
  for (const row of db.prepare('SELECT * FROM awaiting_receipts').all()) {
    awaitingReceipts[row.user_id] = {
      serverName: row.server_name,
      amount: row.amount,
    };
  }

  return { settings, users, invoices, awaitingReceipts };
}

function saveSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function saveUser(userId, username, firstName) {
  db.prepare('INSERT OR REPLACE INTO users (user_id, username, first_name) VALUES (?, ?, ?)').run(userId, username || '', firstName || '');
}

function saveInvoice(userId, data) {
  db.prepare(`INSERT OR REPLACE INTO invoices (user_id, server_name, user_name, time_label, volume_label, amount, last_message_id, stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    userId, data.serverName || '', data.userName || '', data.timeLabel || '', data.volumeLabel || '', data.amount || 0, data.lastInvoiceMessageId || null, data.stage || ''
  );
}

function removeInvoice(userId) {
  db.prepare('DELETE FROM invoices WHERE user_id = ?').run(userId);
}

function saveAwaitingReceipt(userId, data) {
  db.prepare('INSERT OR REPLACE INTO awaiting_receipts (user_id, server_name, amount) VALUES (?, ?, ?)').run(userId, data.serverName || '', data.amount || 0);
}

function removeAwaitingReceipt(userId) {
  db.prepare('DELETE FROM awaiting_receipts WHERE user_id = ?').run(userId);
}

function getAllUsers() {
  return db.prepare('SELECT * FROM users ORDER BY rowid DESC').all();
}

function getAllInvoices() {
  return db.prepare('SELECT * FROM invoices ORDER BY rowid DESC').all();
}

module.exports = {
  init, reinit, loadState,
  saveSetting, saveUser,
  saveInvoice, removeInvoice,
  saveAwaitingReceipt, removeAwaitingReceipt,
  getAllUsers, getAllInvoices,
};
