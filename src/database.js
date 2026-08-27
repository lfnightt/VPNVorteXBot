const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'data.json');

// In-memory state
let state = {
  users: {},          // userId: { username, firstName }
  invoices: {},       // userId: { serverName, userName, timeLabel, volumeLabel, amount, lastInvoiceMessageId, stage }
  awaitingReceipts: {}, // userId: { serverName, amount }
  settings: {},       // key: value
};

// Load from disk
function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const data = JSON.parse(raw);
      state = { ...state, ...data };
      const userCount = Object.keys(state.users).length;
      const invoiceCount = Object.keys(state.invoices).length;
      const receiptCount = Object.keys(state.awaitingReceipts).length;
      console.log(`💾 Loaded from JSON: ${userCount} users, ${invoiceCount} invoices, ${receiptCount} receipts`);
    } else {
      console.log('💾 No data.json found, starting fresh');
    }
  } catch (e) {
    console.error('❌ Error loading data.json:', e.message);
  }
}

// Save to disk (atomic: write temp then rename)
function save() {
  try {
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (e) {
    console.error('❌ Error saving data.json:', e.message);
  }
}

// ─── Users ───
function saveUser(userId, username, firstName) {
  state.users[userId] = { username: username || '', firstName: firstName || '' };
  save();
}

function getUser(userId) {
  return state.users[userId] || null;
}

// ─── Invoices ───
function saveInvoice(userId, data) {
  state.invoices[userId] = {
    serverName: data.serverName || '',
    userName: data.userName || '',
    timeLabel: data.timeLabel || '',
    volumeLabel: data.volumeLabel || '',
    amount: data.amount || 0,
    lastInvoiceMessageId: data.lastInvoiceMessageId || null,
    stage: data.stage || '',
  };
  save();
}

function removeInvoice(userId) {
  delete state.invoices[userId];
  save();
}

function getInvoice(userId) {
  return state.invoices[userId] || null;
}

// ─── Awaiting Receipts ───
function saveAwaitingReceipt(userId, data) {
  state.awaitingReceipts[userId] = {
    serverName: data.serverName || '',
    amount: data.amount || 0,
  };
  save();
}

function removeAwaitingReceipt(userId) {
  delete state.awaitingReceipts[userId];
  save();
}

// ─── Settings ───
function saveSetting(key, value) {
  state.settings[key] = String(value);
  save();
}

function getSetting(key) {
  return state.settings[key] || null;
}

// ─── Full State Access ───
function getState() {
  return state;
}

// ─── Replace entire state (for restore) ───
function replaceState(newState) {
  state = { ...state, ...newState };
  save();
  console.log('🔄 State replaced and saved');
}

// ─── Get raw file buffer (for backup download) ───
function getFileBuffer() {
  if (!fs.existsSync(DB_PATH)) return null;
  return fs.readFileSync(DB_PATH);
}

// ─── Write raw file buffer (for restore upload) ───
function writeFileBuffer(buf) {
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, buf);
  fs.renameSync(tmpPath, DB_PATH);
}

module.exports = {
  load, save,
  saveUser, getUser,
  saveInvoice, removeInvoice, getInvoice,
  saveAwaitingReceipt, removeAwaitingReceipt,
  saveSetting, getSetting,
  getState, replaceState,
  getFileBuffer, writeFileBuffer,
};
