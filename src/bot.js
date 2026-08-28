// ═══════════════════════════════════════════════════════════════
//  ⚡ VORTEX VPN BOT v5.2 — فروش اختصاصی کانفیگ VPN
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const { handleSupportCommand } = require('./support');
const db = require('./database');

// ─── Configuration ───
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const ADMIN_ID = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;
const ALL_SERVERS_PRICE_20 = Number(process.env.ALL_SERVERS_PRICE_20 || 0);
const ALL_SERVERS_PRICE_10 = Number(process.env.ALL_SERVERS_PRICE_10 || 0);
const ALL_SERVERS_PRICE_5 = Number(process.env.ALL_SERVERS_PRICE_5 || 0);
const CARD_NUMBER = process.env.CARD_NUMBER || '';
const MARZBAN_URL = process.env.MARZBAN_URL || '';
const MARZBAN_USERNAME = process.env.MARZBAN_USERNAME || '';
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD || '';

if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

// ─── Anti-crash ───
process.on('uncaughtException', (e) => console.error('⚠️ Uncaught:', e.message));
process.on('unhandledRejection', (e) => console.error('⚠️ Unhandled:', e?.message || e));

// ─── Bot ───
const bot = new TelegramBot(BOT_TOKEN, { polling: { interval: 500, autoStart: true } });

// ─── Safe API wrappers ───
async function safeSend(chatId, text, opts = {}) {
  try { return await bot.sendMessage(chatId, text, opts); } catch (e) { console.error(`❌ send(${chatId}):`, e.message); return null; }
}
async function safeEdit(chatId, msgId, text, extra = {}) {
  try { return await bot.editMessageText(text, { chat_id: chatId, message_id: msgId, ...extra }); } catch (e) { return null; }
}
async function safeAnswer(qid, opts = {}) {
  try { return await bot.answerCallbackQuery(qid, opts); } catch { return null; }
}
async function safeDelete(chatId, msgId) {
  try { return await bot.deleteMessage(chatId, msgId); } catch { return null; }
}

// ─── State ───
const seenUsers = new Set();
let currentChannelUsername = CHANNEL_USERNAME;
let membershipRequired = true;
let membershipPromptVersion = 0;
const userMembershipPromptVersion = new Map();
const adminStates = new Map();
const userInvoices = new Map();
const awaitingReceipts = new Map();

// ─── Load DB ───
db.load();
const _saved = db.getState();
for (const uid of Object.keys(_saved.users)) seenUsers.add(Number(uid));
for (const [uid, data] of Object.entries(_saved.invoices)) userInvoices.set(Number(uid), data);
for (const [uid, data] of Object.entries(_saved.awaitingReceipts)) awaitingReceipts.set(Number(uid), data);
if (_saved.settings.channel) currentChannelUsername = _saved.settings.channel;
if (_saved.settings.membership !== undefined) membershipRequired = _saved.settings.membership === 'true';
console.log(`💾 Loaded: ${seenUsers.size} users, ${userInvoices.size} invoices`);

function reloadState() {
  db.load();
  const s = db.getState();
  seenUsers.clear(); userInvoices.clear(); awaitingReceipts.clear();
  for (const uid of Object.keys(s.users)) seenUsers.add(Number(uid));
  for (const [uid, data] of Object.entries(s.invoices)) userInvoices.set(Number(uid), data);
  for (const [uid, data] of Object.entries(s.awaitingReceipts)) awaitingReceipts.set(Number(uid), data);
  if (s.settings.channel) currentChannelUsername = s.settings.channel;
  if (s.settings.membership !== undefined) membershipRequired = s.settings.membership === 'true';
  console.log(`🔄 Reloaded: ${seenUsers.size} users, ${userInvoices.size} invoices`);
}

// ═══════════════════════════════════════════
//  MARZBAN API
// ═══════════════════════════════════════════
async function getMarzbanToken() {
  if (!MARZBAN_URL || !MARZBAN_USERNAME || !MARZBAN_PASSWORD) return { ok: false, error: 'Marzban not configured' };
  try {
    const baseUrl = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/api/admin/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: MARZBAN_USERNAME, password: MARZBAN_PASSWORD }).toString(),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, token: data.access_token || data.token };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function createMarzbanUserFromInvoice(targetUserId, invoice) {
  const tokenResult = await getMarzbanToken();
  if (!tokenResult.ok) return tokenResult;
  const base = `vortex-${invoice.userName || targetUserId}`.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  const username = base.length >= 3 ? base : `vx-${targetUserId}`;
  const volumeGB = invoice.volumeLabel?.includes('20') ? 20 : invoice.volumeLabel?.includes('10') ? 10 : 5;
  const dataLimit = volumeGB * 1024 * 1024 * 1024;
  let expireDays = 365;
  if (invoice.timeLabel?.includes('30')) expireDays = 30;
  else if (invoice.timeLabel?.includes('15')) expireDays = 15;
  const expireAt = Math.floor(Date.now() / 1000) + expireDays * 86400;
  try {
    const baseUrl = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/api/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenResult.token}` },
      body: JSON.stringify({ username, data_limit: dataLimit, expire: expireAt, note: `Telegram:${targetUserId}` }),
    });
    if (!res.ok) { const t = await res.text(); return { ok: false, error: `HTTP ${res.status}: ${t}` }; }
    const data = await res.json();
    return { ok: true, username, subscriptionUrl: data.subscription_url, data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
function toPersianDigits(n) { return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function toPersianNumber(n) { return toPersianDigits(n.toLocaleString('en-US')); }
function isAdmin(userId) { return ADMIN_ID && userId === ADMIN_ID; }

async function isUserChannelMember(userId) {
  try {
    const member = await bot.getChatMember(currentChannelUsername, userId);
    return ['member', 'administrator', 'creator', 'owner'].includes(member.status);
  } catch { return false; }
}

// ═══════════════════════════════════════════
//  KEYBOARDS (all inline, no reply keyboards!)
// ═══════════════════════════════════════════
function homeInlineKB(userId) {
  const rows = [
    [{ text: '🛒 خرید سرویس', callback_data: 'nav:buy' }],
    [{ text: '📦 سرویس‌های من', callback_data: 'nav:myorders' }, { text: '👤 حساب کاربری', callback_data: 'nav:account' }],
    [{ text: '💬 پشتیبانی', callback_data: 'nav:support' }, { text: '📜 قوانین', callback_data: 'nav:rules' }],
    [{ text: '🤝 دعوت دوستان', callback_data: 'nav:referral' }],
  ];
  if (isAdmin(userId)) rows.push([{ text: '🛠 پنل مدیریت', callback_data: 'nav:admin' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function serverSelectionKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '🌐 همه سرورها (پیشنهاد ویژه)', callback_data: 'buy:all' }],
    [{ text: '🔙 بازگشت', callback_data: 'nav:home' }],
  ]}};
}

function volumeKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: `📦 ۲۰ گیگ — ${toPersianNumber(ALL_SERVERS_PRICE_20)} ت`, callback_data: 'buy:vol:20' }],
    [{ text: `📦 ۱۰ گیگ — ${toPersianNumber(ALL_SERVERS_PRICE_10)} ت`, callback_data: 'buy:vol:10' }],
    [{ text: `📦 ۵ گیگ — ${toPersianNumber(ALL_SERVERS_PRICE_5)} ت`, callback_data: 'buy:vol:5' }],
    [{ text: '🔙 بازگشت', callback_data: 'buy:servers' }],
  ]}};
}

function timeKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '♾ نامحدود (پیشنهاد ویژه)', callback_data: 'buy:time:unlimited' }],
    [{ text: '📅 ۳۰ روزه', callback_data: 'buy:time:30' }],
    [{ text: '📅 ۱۵ روزه', callback_data: 'buy:time:15' }],
    [{ text: '🔙 بازگشت', callback_data: 'buy:volumes' }],
  ]}};
}

function confirmKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '✅ تأیید و پرداخت', callback_data: 'buy:confirm' }],
    [{ text: '❌ انصراف', callback_data: 'buy:cancel' }],
  ]}};
}

function accountKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '📊 جزئیات سفارشات', callback_data: 'acc:orders' }],
    [{ text: '🎟 کد دعوت من', callback_data: 'acc:referral' }],
    [{ text: '🔙 بازگشت به منو', callback_data: 'nav:home' }],
  ]}};
}

function adminPanelKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '📡 تنظیم کانال', callback_data: 'adm:channel' }, { text: '👥 عضویت اجباری', callback_data: 'adm:membership' }],
    [{ text: '💰 قیمت‌ها', callback_data: 'adm:prices' }, { text: '💳 شماره کارت', callback_data: 'adm:card' }],
    [{ text: '📋 لیست کاربران', callback_data: 'adm:users' }],
    [{ text: '🔙 بازگشت', callback_data: 'nav:home' }],
  ]}};
}

function backInlineKB(callbackData) {
  return { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: callbackData }]] }};
}

// ═══════════════════════════════════════════
//  /start HANDLER
// ═══════════════════════════════════════════
bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || '';
  const username = msg.from.username || '';

  const isFirstTime = !seenUsers.has(userId);
  if (isFirstTime) {
    seenUsers.add(userId);
    db.saveUser(userId, username, firstName);
    db.saveSetting(`user_${userId}_joined`, new Date().toISOString());
  }

  if (membershipRequired) {
    const alreadyMember = await isUserChannelMember(userId);
    if (!alreadyMember) {
      const v = membershipPromptVersion;
      if (userMembershipPromptVersion.get(userId) !== v) {
        userMembershipPromptVersion.set(userId, v);
        await safeSend(userId,
          `⚡ VorteX VPN\n\n` +
          `برای استفاده از ربات، ابتدا عضو کانال زیر بشو:\n\n` +
          `📢 ${currentChannelUsername}\n\n` +
          `بعد از عضویت، دکمه «عضو شدم ✅» رو بزنید.`,
          { reply_markup: { inline_keyboard: [
            [{ text: '📢 عضویت در کانال', url: `https://t.me/${currentChannelUsername.replace('@', '')}` }],
            [{ text: '✅ عضو شدم', callback_data: 'check_membership' }],
          ]}}
        );
      }
      return;
    }
  }

  const welcomeText = isFirstTime
    ? `⚡ <b>VorteX VPN</b>\n\n` +
      `سلام <b>${firstName}</b> عزیز 👋\n\n` +
      `به خانواده VorteX خوش اومدی!\n\n` +
      `🔥 <b>چرا VorteX؟</b>\n` +
      `• سرورهای پرسرعت و پایدار\n` +
      `• پشتیبانی ۲۴ ساعته\n` +
      `• تنوع در حجم و مدت زمان\n` +
      `• قیمت مناسب و پرداخت آسان\n\n` +
      `از منوی پایین شروع کن 👇`
    : `⚡ <b>VorteX VPN</b>\n\n` +
      `خوش برگشتی <b>${firstName}</b>! 🎉\n\n` +
      `از منوی پایین می‌تونی خرید کنی یا سرویست رو مدیریت کنی 👇`;

  await safeSend(userId, welcomeText, { parse_mode: 'HTML', ...homeInlineKB(userId) });
});

// ═══════════════════════════════════════════
//  MESSAGE HANDLER (text only)
// ═══════════════════════════════════════════
bot.on('message', async (msg) => {
  if (msg.chat.type !== 'private') return;
  if (msg.from?.is_bot) return;
  const userId = msg.from?.id;
  const chatId = msg.chat.id;
  if (!userId) return;

  // ─── Receipt Photo ───
  if (msg.photo && awaitingReceipts.has(userId)) {
    const receiptData = awaitingReceipts.get(userId);
    awaitingReceipts.delete(userId);
    db.removeAwaitingReceipt(userId);
    const adminChatId = ADMIN_ID;
    if (!adminChatId) { await safeSend(chatId, '⚠️ ادمین تنظیم نشده.'); return; }

    const caption =
      `📬 <b>رسید جدید</b>\n━━━━━━━━━━━━━━━\n` +
      `👤 کاربر: <code>${userId}</code>\n` +
      `📛 نام: ${msg.from.first_name || '-'}\n` +
      `🖥 سرور: ${receiptData.serverName}\n` +
      `💰 مبلغ: ${toPersianNumber(receiptData.amount)} تومان\n` +
      `━━━━━━━━━━━━━━━`;

    try {
      await bot.sendPhoto(adminChatId, msg.photo[msg.photo.length - 1].file_id, {
        caption, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[
          { text: '✅ تأیید', callback_data: `adm:approve:${userId}` },
          { text: '❌ رد', callback_data: `adm:reject:${userId}` },
        ]]},
      });
    } catch {}

    await safeSend(chatId,
      `✅ رسید شما دریافت شد!\n\n` +
      `📦 سرویس: ${receiptData.serverName}\n` +
      `💰 مبلغ: ${toPersianNumber(receiptData.amount)} تومان\n\n` +
      `⏳ منتظر بررسی ادمین باشید.`,
      homeInlineKB(userId)
    );
    return;
  }

  // ─── Text messages ───
  const text = msg.text;
  if (!text) return;

  // ─── Admin text input ───
  if (isAdmin(userId)) {
    const st = adminStates.get(userId);
    if (st?.mode === 'awaiting_channel_id') {
      const newChannel = text.trim();
      if (!newChannel.startsWith('@') && !newChannel.startsWith('https://t.me/')) {
        return safeSend(chatId, '⚠️ فرمت صحیح: @channel_name');
      }
      currentChannelUsername = newChannel.startsWith('@') ? newChannel : '@' + newChannel.split('/').pop();
      db.saveSetting('channel', currentChannelUsername);
      adminStates.delete(userId);
      return safeSend(chatId, `✅ کانال به <b>${currentChannelUsername}</b> تغییر کرد.`, { parse_mode: 'HTML', ...adminPanelKB() });
    }
    if (st?.mode?.startsWith('editing_price_')) {
      const price = Number(text);
      if (!price || price <= 0) return safeSend(chatId, '⚠️ یک عدد صحیح وارد کنید.');
      const tier = st.mode.replace('editing_price_', '');
      db.saveSetting(`price_${tier}`, price);
      adminStates.delete(userId);
      return safeSend(chatId, `✅ قیمت ${tier} گیگ: ${toPersianNumber(price)} تومان`, adminPanelKB());
    }
    if (st?.mode === 'editing_card') {
      db.saveSetting('card', text.trim());
      adminStates.delete(userId);
      return safeSend(chatId, `✅ شماره کارت: ${text.trim()}`, adminPanelKB());
    }
  }

  // ─── Reply keyboard fallback: redirect to home ───
  if (text === '🛒 خرید سرویس' || text === '📦 سرویس‌های من' || text === '👤 حساب کاربری' ||
      text === '💬 پشتیبانی' || text === '🤝 دعوت دوستان' || text === '📜 قوانین' || text === '🛠 پنل مدیریت') {
    return safeSend(chatId, `از دکمه‌های زیر استفاده کن 👇`, homeInlineKB(userId));
  }
});

// ═══════════════════════════════════════════
//  CALLBACK QUERY HANDLER (all buttons)
// ═══════════════════════════════════════════
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message?.chat.id;
  const msgId = query.message?.message_id;
  const data = query.data;
  if (!chatId || !data) return;

  // Always answer callback immediately to remove loading spinner
  await safeAnswer(query.id);

  try {
    // ═══════════════════════════════
    //  NAVIGATION
    // ═══════════════════════════════
    if (data === 'check_membership') {
      const isMember = await isUserChannelMember(userId);
      if (isMember) {
        return safeEdit(chatId, msgId,
          `⚡ <b>VorteX VPN</b>\n\nعضویتت تأیید شد ✅\nاز منوی پایین استفاده کن 👇`,
          homeInlineKB(userId)
        );
      } else {
        return safeAnswer(query.id, { text: '❌ هنوز عضو کانال نشدید!', show_alert: true });
      }
    }

    if (data === 'nav:home' || data === 'nav:menu') {
      return safeEdit(chatId, msgId,
        `⚡ <b>VorteX VPN</b>\n\nاز منوی پایین استفاده کن 👇`,
        homeInlineKB(userId)
      );
    }

    if (data === 'nav:buy') {
      return safeEdit(chatId, msgId,
        `⚡ <b>خرید سرویس VPN</b>\n\nاز بین سرورهای زیر انتخاب کنید:`,
        serverSelectionKB()
      );
    }

    if (data === 'nav:myorders') {
      const inv = userInvoices.get(userId);
      if (inv) {
        return safeEdit(chatId, msgId,
          `📦 <b>سرویس در حال پردازش</b>\n\n🖥 سرور: ${inv.serverName}\n📦 حجم: ${inv.volumeLabel}\n⏰ مدت: ${inv.timeLabel}\n💰 مبلغ: ${inv.amount ? toPersianNumber(inv.amount) + ' تومان' : '—'}\n📋 وضعیت: ${inv.stage === 'receipt_sent' ? '⏳ در انتظار تأیید' : '📝 در حال تکمیل'}`,
          backInlineKB('nav:home')
        );
      }
      // Check Marzban
      let marzbanInfo = '';
      if (MARZBAN_URL && MARZBAN_USERNAME) {
        try {
          const tk = await getMarzbanToken();
          if (tk.ok) {
            const base = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');
            const uname = (query.from.username || String(userId)).toLowerCase().replace(/[^a-z0-9_-]/g, '');
            const r = await fetch(`${base}/api/admin/user?username=vortex-${uname}`, {
              headers: { Authorization: `Bearer ${tk.token}` }
            });
            if (r.ok) {
              const u = await r.json();
              if (u.username) {
                const dl = u.data_limit ? (u.data_limit / (1024**3)).toFixed(1) : '∞';
                const ul = u.used_traffic ? (u.used_traffic / (1024**3)).toFixed(1) : '0';
                const exp = u.expire ? new Date(u.expire * 1000).toLocaleDateString('fa-IR') : '∞';
                marzbanInfo = `\n\n🟢 <b>سرویس فعال:</b>\n📦 ${ul} / ${dl} گیگ\n⏰ انقضا: ${exp}` +
                  (u.subscription_url ? `\n🔗 <a href="${u.subscription_url}">لینک اشتراک</a>` : '');
              }
            }
          }
        } catch {}
      }
      return safeEdit(chatId, msgId,
        `📦 <b>سرویس‌های من</b>\n\n${marzbanInfo || '❌ سرویس فعالی ندارید.'}`,
        backInlineKB('nav:home')
      );
    }

    if (data === 'nav:account') {
      const joinedAt = db.getState().settings[`user_${userId}_joined`];
      const orderCount = userInvoices.has(userId) ? 1 : 0;
      const pending = awaitingReceipts.has(userId) ? 1 : 0;
      return safeEdit(chatId, msgId,
        `⚡ <b>حساب کاربری</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 <b>نام:</b> ${query.from.first_name || '-'}\n` +
        `📛 <b>یوزرنیم:</b> ${query.from.username ? '@' + query.from.username : '—'}\n` +
        `🆔 <b>آیدی:</b> <code>${userId}</code>\n` +
        `📅 <b>عضویت:</b> ${joinedAt ? new Date(joinedAt).toLocaleDateString('fa-IR') : '—'}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n📊 <b>آمار حساب</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📦 سفارشات: ${orderCount}\n⏳ در انتظار: ${pending}\n🎟 کد دعوت: <code>VX-${userId}</code>`,
        accountKB()
      );
    }

    if (data === 'acc:orders') {
      const inv = userInvoices.get(userId);
      const info = inv
        ? `📦 <b>سفارش اخیر:</b>\n\n🖥 سرور: ${inv.serverName}\n📦 حجم: ${inv.volumeLabel}\n⏰ مدت: ${inv.timeLabel}\n💰 مبلغ: ${inv.amount ? toPersianNumber(inv.amount) + ' تومان' : '—'}\n📋 وضعیت: ${inv.stage === 'receipt_sent' ? '⏳ در انتظار تأیید' : '📝 در حال تکمیل'}`
        : '📭 سفارش ثبت‌شده‌ای ندارید.';
      return safeEdit(chatId, msgId, info, backInlineKB('nav:account'));
    }

    if (data === 'acc:referral') {
      return safeEdit(chatId, msgId,
        `🎟 <b>کد دعوت شما:</b>\n\n<code>VX-${userId}</code>\n\nاین کد رو با دوستاتون به اشتراک بذارید.`,
        backInlineKB('nav:account')
      );
    }

    if (data === 'nav:support') {
      return safeEdit(chatId, msgId,
        `💬 <b>پشتیبانی</b>\n\nبرای ارتباط با پشتیبانی روی دکمه زیر کلیک کنید:`,
        { reply_markup: { inline_keyboard: [
          [{ text: '💬 ارسال پیام به پشتیبانی', url: 'https://t.me/SuppVorteX' }],
          [{ text: '🔙 بازگشت', callback_data: 'nav:home' }],
        ]}}
      );
    }

    if (data === 'nav:rules') {
      return safeEdit(chatId, msgId,
        `📜 <b>قوانین و مقررات VorteX VPN</b>\n\n` +
        `۱. 🚫 استفاده غیرقانونی ممنوع\n` +
        `۲. 📵 اشتراک‌گذاری کانفیگ ممنوع\n` +
        `۳. 🔄 ریفراند پس از فعال‌سازی ممکن نیست\n` +
        `۴. ⏰ اعتبار از زمان فعال‌سازی محاسبه می‌شود\n` +
        `۵. 💬 پشتیبانی: ۹ صبح تا ۱۲ شب\n\n` +
        `⚡ با استفاده از سرویس، قوانین رو می‌پذیرید.`,
        backInlineKB('nav:home')
      );
    }

    if (data === 'nav:referral') {
      return safeEdit(chatId, msgId,
        `🤝 <b>دعوت از دوستان</b>\n\n` +
        `با دعوت از دوستان خود از مزایای ویژه بهره‌مند بشید.\n\n` +
        `🔗 لینک دعوت شما:\n<code>t.me/${bot.options.username}?start=ref_${userId}</code>`,
        backInlineKB('nav:home')
      );
    }

    // ═══════════════════════════════
    //  BUY FLOW
    // ═══════════════════════════════
    if (data === 'buy:servers' || data === 'buy:all') {
      return safeEdit(chatId, msgId,
        `⚡ <b>انتخاب حجم</b>\n\nحجم اینترنت مورد نظرتون رو انتخاب کنید:`,
        volumeKB()
      );
    }

    if (data === 'buy:volumes') {
      return safeEdit(chatId, msgId,
        `⚡ <b>انتخاب حجم</b>\n\nحجم مورد نظر رو انتخاب کنید:`,
        volumeKB()
      );
    }

    if (data.startsWith('buy:vol:')) {
      const vol = data.split(':')[2];
      const volLabel = vol === '20' ? '۲۰ گیگ' : vol === '10' ? '۱۰ گیگ' : '۵ گیگ';
      const price = vol === '20' ? ALL_SERVERS_PRICE_20 : vol === '10' ? ALL_SERVERS_PRICE_10 : ALL_SERVERS_PRICE_5;
      userInvoices.set(userId, {
        serverName: 'همه سرورها', userName: query.from.first_name,
        volumeLabel: volLabel, timeLabel: 'تعیین نشده', amount: price,
        lastInvoiceMessageId: null, stage: 'volume_select',
      });
      db.saveInvoice(userId, userInvoices.get(userId));
      return safeEdit(chatId, msgId,
        `⚡ <b>انتخاب مدت زمان</b>\n\n📦 حجم: ${volLabel}\n💰 قیمت: ${toPersianNumber(price)} تومان\n\nمدت زمان سرویس رو انتخاب کنید:`,
        timeKB()
      );
    }

    if (data === 'buy:times') {
      return safeEdit(chatId, msgId,
        `⚡ <b>انتخاب مدت زمان</b>\n\nمدت زمان رو انتخاب کنید:`,
        timeKB()
      );
    }

    if (data.startsWith('buy:time:')) {
      const time = data.split(':')[2];
      const timeLabel = time === 'unlimited' ? 'نامحدود' : time === '30' ? '۳۰ روزه' : '۱۵ روزه';
      const inv = userInvoices.get(userId);
      if (!inv) return safeEdit(chatId, msgId, '⚠️ فاکتور منقضی شده. دوباره شروع کنید.', backInlineKB('nav:home'));
      inv.timeLabel = timeLabel;
      inv.stage = 'invoice';
      userInvoices.set(userId, inv);
      db.saveInvoice(userId, inv);

      return safeEdit(chatId, msgId,
        `⚡ <b>فاکتور خرید</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📦 <b>جزئیات سفارش:</b>\n🌐 سرور: ${inv.serverName}\n📦 حجم: ${inv.volumeLabel}\n⏰ مدت: ${timeLabel}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n💰 <b>مبلغ قابل پرداخت:</b>\n💳 ${toPersianNumber(inv.amount)} تومان\n\n` +
        `━━━━━━━━━━━━━━━━━━\n💳 <b>شماره کارت:</b>\n<code>${CARD_NUMBER}</code>\n\n` +
        `⚠️ پس از پرداخت، روی «تأیید» بزنید و رسید رو بفرستید.`,
        confirmKB()
      );
    }

    if (data === 'buy:confirm') {
      const inv = userInvoices.get(userId);
      if (!inv) return safeEdit(chatId, msgId, '⚠️ فاکتور منقضی شده.', backInlineKB('nav:home'));
      inv.stage = 'receipt_sent';
      userInvoices.set(userId, inv);
      db.saveInvoice(userId, inv);
      awaitingReceipts.set(userId, { serverName: inv.serverName, amount: inv.amount });
      db.saveAwaitingReceipt(userId, awaitingReceipts.get(userId));

      return safeEdit(chatId, msgId,
        `⚡ <b>ارسال رسید پرداخت</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `💳 شماره کارت:\n<code>${CARD_NUMBER}</code>\n\n` +
        `💰 مبلغ: <b>${toPersianNumber(inv.amount)} تومان</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📸 حالا یک <b>عکس</b> از رسید پرداخت بفرستید.\n` +
        `پس از بررسی ادمین، کانفیگ VPN برایتان ارسال می‌شود.`
      );
    }

    if (data === 'buy:cancel') {
      userInvoices.delete(userId);
      db.removeInvoice(userId);
      return safeEdit(chatId, msgId,
        `❌ <b>خرید لغو شد</b>\n\nهر وقت خواستی دوباره شروع کن 👇`,
        homeInlineKB(userId)
      );
    }

    // ═══════════════════════════════
    //  ADMIN PANEL
    // ═══════════════════════════════
    if (data === 'nav:admin' && isAdmin(userId)) {
      return safeEdit(chatId, msgId,
        `🛠 <b>پنل مدیریت</b>\n\nاز بخش‌های زیر می‌تونید ربات رو مدیریت کنید:`,
        adminPanelKB()
      );
    }

    if (isAdmin(userId)) {
      if (data === 'adm:channel') {
        adminStates.set(userId, { mode: 'awaiting_channel_id' });
        return safeEdit(chatId, msgId,
          `📡 <b>تنظیم کانال</b>\n\nآیدی کانال جدید رو بفرستید:\nفرمت: <code>@channel_name</code>`,
          backInlineKB('nav:admin')
        );
      }
      if (data === 'adm:membership') {
        membershipRequired = !membershipRequired;
        db.saveSetting('membership', String(membershipRequired));
        return safeEdit(chatId, msgId,
          `👥 <b>عضویت اجباری</b>\n\nوضعیت فعلی: ${membershipRequired ? '✅ فعال' : '❌ غیرفعال'}`,
          adminPanelKB()
        );
      }
      if (data === 'adm:prices') {
        adminStates.set(userId, { mode: 'editing_price_20' });
        return safeEdit(chatId, msgId,
          `💰 <b>قیمت ۲۰ گیگ</b>\n\nقیمت جدید (تومان) رو وارد کنید:\n فعلی: ${toPersianNumber(ALL_SERVERS_PRICE_20)} ت`,
          backInlineKB('nav:admin')
        );
      }
      if (data === 'adm:card') {
        adminStates.set(userId, { mode: 'editing_card' });
        return safeEdit(chatId, msgId,
          `💳 <b>شماره کارت</b>\n\nشماره کارت جدید رو بفرستید:`,
          backInlineKB('nav:admin')
        );
      }
      if (data === 'adm:users') {
        const userCount = seenUsers.size;
        return safeEdit(chatId, msgId,
          `📋 <b>لیست کاربران</b>\n\nتعداد کل: ${userCount} نفر`,
          adminPanelKB()
        );
      }

      if (data.startsWith('adm:approve:')) {
        const targetUserId = Number(data.split(':')[2]);
        const inv = userInvoices.get(targetUserId) || awaitingReceipts.get(targetUserId) || { serverName: 'نامشخص', amount: 0, volumeLabel: '۲۰ گیگ', timeLabel: 'نامحدود' };
        const marzbanResult = await createMarzbanUserFromInvoice(targetUserId, inv);

        let replyToUser = `✅ <b>پرداخت شما تأیید شد!</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
        if (marzbanResult.ok) {
          replyToUser += `🟢 <b>کانفیگ VPN شما فعال شد:</b>\n\n📦 حجم: ${inv.volumeLabel}\n⏰ مدت: ${inv.timeLabel}\n\n`;
          if (marzbanResult.subscriptionUrl) {
            replyToUser += `🔗 <b>لینک اشتراک:</b>\n<code>${marzbanResult.subscriptionUrl}</code>\n\n👆 این لینک رو در اپلیکیشن VPN وارد کنید.\n\n`;
          }
          replyToUser += `⚠️ لینک رو با کسی به اشتراک نذارید!`;
        } else {
          replyToUser += `⚠️ پرداخت تأیید شد اما فعال‌سازی خودکار با خطا مواجه شد.\nلطفاً با پشتیبانی تماس بگیرید.`;
        }

        await safeSend(targetUserId, replyToUser, { parse_mode: 'HTML', ...homeInlineKB(targetUserId) });

        return safeEdit(chatId, msgId,
          `✅ <b>تأیید شد</b>\n\n👤 کاربر: <code>${targetUserId}</code>\n💰 مبلغ: ${toPersianNumber(inv.amount)} تومان\n📦 حجم: ${inv.volumeLabel}\n${marzbanResult.ok ? '🟢 مرزبان: فعال شد' : '⚠️ مرزبان: خطا'}`
        );
      }

      if (data.startsWith('adm:reject:')) {
        const targetUserId = Number(data.split(':')[2]);
        await safeSend(targetUserId, `❌ <b>پرداخت شما رد شد.</b>\n\nاگر فکر می‌کنید اشتباهه با پشتیبانی تماس بگیرید.`, { parse_mode: 'HTML', ...homeInlineKB(targetUserId) });
        return safeEdit(chatId, msgId, `❌ <b>رد شد</b>\n\n👤 کاربر: <code>${targetUserId}</code>`);
      }
    }

  } catch (e) { console.error('Callback error:', e.message); }
});

// ═══════════════════════════════════════════
console.log('⚡ VorteX VPN Bot v5.2 is running...');
// ═══════════════════════════════════════════

module.exports = {
  bot, seenUsers, userInvoices, awaitingReceipts,
  getChannelUsername: () => currentChannelUsername,
  getMembershipRequired: () => membershipRequired,
  getMarzbanToken, createMarzbanUserFromInvoice, reloadState,
};
