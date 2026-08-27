// ═══════════════════════════════════════════════════════════════
//  ⚡ VORTEX VPN BOT v4.0 — فروش اختصاصی کانفیگ VPN
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

// ─── Bot ───
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

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
    return { ok: true, username, subscriptionUrl: data.subscription_url, data: data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
function toPersianDigits(n) { return String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function toPersianNumber(n) { return toPersianDigits(n.toLocaleString('en-US')); }
function getPersianDate() { return new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
function isAdmin(userId) { return ADMIN_ID && userId === ADMIN_ID; }

async function isUserChannelMember(userId) {
  try {
    const member = await bot.getChatMember(currentChannelUsername, userId);
    return ['member', 'administrator', 'creator', 'owner'].includes(member.status);
  } catch { return false; }
}

// ═══════════════════════════════════════════
//  KEYBOARDS
// ═══════════════════════════════════════════
function mainMenuKB(userId) {
  const rows = [
    [{ text: '🛒 خرید سرویس' }, { text: '📦 سرویس‌های من' }],
    [{ text: '👤 حساب کاربری' }, { text: '💬 پشتیبانی' }],
    [{ text: '🤝 دعوت دوستان' }, { text: '📜 قوانین' }],
  ];
  if (isAdmin(userId)) rows.push([{ text: '🛠 پنل مدیریت' }]);
  return { reply_markup: { keyboard: rows, resize_keyboard: true } };
}

function backKB() {
  return { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منو', callback_data: 'back:menu' }]] } };
}

function serverSelectionKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '🌐 همه سرورها (پیشنهاد ویژه)', callback_data: 'srv:all' }],
    [{ text: '🔙 بازگشت', callback_data: 'back:menu' }],
  ]}};
}

function volumeKB() {
  return { reply_markup: { inline_keyboard: [
    [
      { text: `📦 ۲۰ گیگ — ${toPersianNumber(ALL_SERVERS_PRICE_20)} ت`, callback_data: 'vol:20' },
    ],
    [
      { text: `📦 ۱۰ گیگ — ${toPersianNumber(ALL_SERVERS_PRICE_10)} ت`, callback_data: 'vol:10' },
    ],
    [
      { text: `📦 ۵ گیگ — ${toPersianNumber(ALL_SERVERS_PRICE_5)} ت`, callback_data: 'vol:5' },
    ],
    [{ text: '🔙 بازگشت', callback_data: 'back:servers' }],
  ]}};
}

function timeKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '♾ نامحدود (پیشنهاد ویژه)', callback_data: 'time:unlimited' }],
    [{ text: '📅 ۳۰ روزه', callback_data: 'time:30' }],
    [{ text: '📅 ۱۵ روزه', callback_data: 'time:15' }],
    [{ text: '🔙 بازگشت', callback_data: 'back:volumes' }],
  ]}};
}

function confirmKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '✅ تأیید و پرداخت', callback_data: 'inv:confirm' }],
    [{ text: '❌ انصراف', callback_data: 'inv:cancel' }],
  ]}};
}

function accountKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '📊 جزئیات سفارشات', callback_data: 'acc:orders' }],
    [{ text: '🎟 کد دعوت من', callback_data: 'acc:referral' }],
    [{ text: '🔙 بازگشت به منو', callback_data: 'back:menu' }],
  ]}};
}

function adminPanelKB() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '📡 تنظیم کانال', callback_data: 'adm:channel' }, { text: '👥 عضویت اجباری', callback_data: 'adm:membership' }],
    [{ text: '💰 قیمت‌ها', callback_data: 'adm:prices' }, { text: '💳 شماره کارت', callback_data: 'adm:card' }],
    [{ text: '📋 لیست کاربران', callback_data: 'adm:users' }],
    [{ text: '🔙 بازگشت', callback_data: 'back:menu' }],
  ]}};
}

// ═══════════════════════════════════════════
//  /start HANDLER
// ═══════════════════════════════════════════
bot.onText(/\/start/, async (msg) => {
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
        await bot.sendMessage(userId,
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

  await bot.sendMessage(userId, welcomeText, { parse_mode: 'HTML', ...mainMenuKB(userId) });
});

// ═══════════════════════════════════════════
//  MESSAGE HANDLER
// ═══════════════════════════════════════════
bot.on('message', async (msg) => {
  if (msg.from?.is_bot) return;
  const userId = msg.from?.id;
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!userId || !text) return;

  // ─── Receipt Photo ───
  if (msg.photo && awaitingReceipts.has(userId)) {
    const receiptData = awaitingReceipts.get(userId);
    awaitingReceipts.delete(userId);
    db.removeAwaitingReceipt(userId);

    const adminChatId = ADMIN_ID;
    if (!adminChatId) return bot.sendMessage(chatId, '⚠️ ادمین تنظیم نشده. با پشتیبانی تماس بگیرید.');

    const caption =
      `📬 <b>رسید جدید</b>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `👤 کاربر: <code>${userId}</code>\n` +
      `📛 نام: ${msg.from.first_name || '-'}\n` +
      `🖥 سرور: ${receiptData.serverName}\n` +
      `💰 مبلغ: ${toPersianNumber(receiptData.amount)} تومان\n` +
      `━━━━━━━━━━━━━━━`;

    await bot.sendPhoto(adminChatId, msg.photo[msg.photo.length - 1].file_id, {
      caption, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [
          { text: '✅ تأیید', callback_data: `adm:approve:${userId}` },
          { text: '❌ رد', callback_data: `adm:reject:${userId}` },
        ],
      ]},
    });

    await bot.sendMessage(chatId,
      `✅ رسید شما دریافت شد!\n\n` +
      `📦 سرویس: ${receiptData.serverName}\n` +
      `💰 مبلغ: ${toPersianNumber(receiptData.amount)} تومان\n\n` +
      `⏳ منتظر بررسی ادمین باشید.\n` +
      `پس از تأیید، کانفیگ VPN برایتان ارسال می‌شود.`,
      mainMenuKB(userId)
    );
    return;
  }

  // ─── Admin States ───
  if (isAdmin(userId)) {
    const st = adminStates.get(userId);

    if (st?.mode === 'awaiting_channel_id') {
      const newChannel = text.trim();
      if (!newChannel.startsWith('@') && !newChannel.startsWith('https://t.me/')) {
        return bot.sendMessage(chatId, '⚠️ فرمت صحیح: @channel_name یا https://t.me/channel_name');
      }
      currentChannelUsername = newChannel.startsWith('@') ? newChannel : '@' + newChannel.split('/').pop();
      db.saveSetting('channel', currentChannelUsername);
      adminStates.set(userId, { mode: null });
      return bot.sendMessage(chatId, `✅ کانال به <b>${currentChannelUsername}</b> تغییر کرد.`, { parse_mode: 'HTML', ...adminPanelKB() });
    }

    if (st?.mode === 'editing_price_20') {
      const price = Number(text);
      if (!price || price <= 0) return bot.sendMessage(chatId, '⚠️ یک عدد صحیح وارد کنید.');
      db.saveSetting('price_20', price);
      adminStates.set(userId, { mode: null });
      return bot.sendMessage(chatId, `✅ قیمت ۲۰ گیگ: ${toPersianNumber(price)} تومان`, adminPanelKB());
    }
    if (st?.mode === 'editing_price_10') {
      const price = Number(text);
      if (!price || price <= 0) return bot.sendMessage(chatId, '⚠️ یک عدد صحیح وارد کنید.');
      db.saveSetting('price_10', price);
      adminStates.set(userId, { mode: null });
      return bot.sendMessage(chatId, `✅ قیمت ۱۰ گیگ: ${toPersianNumber(price)} تومان`, adminPanelKB());
    }
    if (st?.mode === 'editing_price_5') {
      const price = Number(text);
      if (!price || price <= 0) return bot.sendMessage(chatId, '⚠️ یک عدد صحیح وارد کنید.');
      db.saveSetting('price_5', price);
      adminStates.set(userId, { mode: null });
      return bot.sendMessage(chatId, `✅ قیمت ۵ گیگ: ${toPersianNumber(price)} تومان`, adminPanelKB());
    }
    if (st?.mode === 'editing_card') {
      const card = text.trim();
      db.saveSetting('card', card);
      adminStates.set(userId, { mode: null });
      return bot.sendMessage(chatId, `✅ شماره کارت: ${card}`, adminPanelKB());
    }
  }

  // ─── Main Menu ───
  if (text === '🛒 خرید سرویس') {
    return bot.sendMessage(chatId,
      `⚡ <b>خرید سرویس VPN</b>\n\n` +
      `از بین سرورهای زیر انتخاب کنید:`,
      { parse_mode: 'HTML', ...serverSelectionKB() }
    );
  }

  if (text === '📦 سرویس‌های من') {
    const invoice = userInvoices.get(userId);
    if (invoice) {
      return bot.sendMessage(chatId,
        `📦 <b>سرویس در حال پردازش</b>\n\n` +
        `🖥 سرور: ${invoice.serverName}\n` +
        `📦 حجم: ${invoice.volumeLabel}\n` +
        `⏰ مدت: ${invoice.timeLabel}\n` +
        `💰 مبلغ: ${invoice.amount ? toPersianNumber(invoice.amount) + ' تومان' : '—'}\n` +
        `📋 وضعیت: ${invoice.stage === 'receipt_sent' ? '⏳ در انتظار تأیید' : '📝 در حال تکمیل'}`,
        mainMenuKB(userId)
      );
    }
    // Check Marzban for active configs
    let marzbanInfo = '';
    if (MARZBAN_URL && MARZBAN_USERNAME) {
      try {
        const tk = await getMarzbanToken();
        if (tk.ok) {
          const base = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');
          const r = await fetch(`${base}/api/admin/user?username=vortex-${msg.from.username || userId}`, {
            headers: { Authorization: `Bearer ${tk.token}` }
          });
          if (r.ok) {
            const u = await r.json();
            if (u.username) {
              const dl = u.data_limit ? (u.data_limit / (1024**3)).toFixed(1) : '∞';
              const ul = u.used_traffic ? (u.used_traffic / (1024**3)).toFixed(1) : '0';
              const exp = u.expire ? new Date(u.expire * 1000).toLocaleDateString('fa-IR') : '∞';
              marzbanInfo = `\n\n🟢 <b>سرویس فعال:</b>\n` +
                `📦 ${ul} / ${dl} گیگ\n` +
                `⏰ انقضا: ${exp}\n` +
                (u.subscription_url ? `🔗 <a href="${u.subscription_url}">لینک اشتراک</a>` : '');
            }
          }
        }
      } catch {}
    }
    return bot.sendMessage(chatId,
      `📦 <b>سرویس‌های من</b>\n\n` +
      (marzbanInfo || '❌ سرویس فعالی ندارید.\n\nبرای خرید از منوی «🛒 خرید سرویس» استفاده کنید.'),
      { parse_mode: 'HTML', ...mainMenuKB(userId) }
    );
  }

  if (text === '👤 حساب کاربری') {
    const joinedAt = db.getState().settings[`user_${userId}_joined`];
    const orderCount = userInvoices.has(userId) ? 1 : 0;
    const pending = awaitingReceipts.has(userId) ? 1 : 0;

    return bot.sendMessage(chatId,
      `⚡ <b>حساب کاربری</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 <b>نام:</b> ${msg.from.first_name || '-'}\n` +
      `📛 <b>یوزرنیم:</b> ${msg.from.username ? '@' + msg.from.username : '—'}\n` +
      `🆔 <b>آیدی:</b> <code>${userId}</code>\n` +
      `📅 <b>عضویت:</b> ${joinedAt ? new Date(joinedAt).toLocaleDateString('fa-IR') : getPersianDate()}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>آمار حساب</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 کل سفارشات: ${orderCount}\n` +
      `⏳ در انتظار تأیید: ${pending}\n` +
      `🎟 کد دعوت: <code>VX-${userId}</code>`,
      { parse_mode: 'HTML', ...accountKB() }
    );
  }

  if (text === '💬 پشتیبانی') {
    return handleSupportCommand(bot, chatId);
  }

  if (text === '🤝 دعوت دوستان') {
    return bot.sendMessage(chatId,
      `🤝 <b>دعوت از دوستان</b>\n\n` +
      `با دعوت از دوستان خود می‌تونید از مزایای ویژه بهره‌مند بشید.\n\n` +
      `🔗 لینک دعوت شما:\n` +
      `t.me/${bot.options.username}?start=ref_${userId}\n\n` +
      `هر دوستی که از طریق لینک شما وارد بشه، ثبت می‌شه.`,
      { parse_mode: 'HTML', ...mainMenuKB(userId) }
    );
  }

  if (text === '📜 قوانین') {
    return bot.sendMessage(chatId,
      `📜 <b>قوانین و مقررات VorteX VPN</b>\n\n` +
      `۱. 🚫 استفاده از سرویس برای اعمال غیرقانونی ممنوع است\n` +
      `۲. 📵 اشتراک‌گذاری کانفیگ با دیگران ممنوع است\n` +
      `۳. 🔄 ریفراند پس از فعال‌سازی کانفیگ امکان‌پذیر نیست\n` +
      `۴. ⏰ اعتبار سرویس از زمان فعال‌سازی محاسبه می‌شود\n` +
      `۵. 💬 پشتیبانی: ساعت ۹ صبح تا ۱۲ شب\n` +
      `۶. 📦 حجم مصرفی از سرور اصلی چک می‌شود\n\n` +
      `⚡ با استفاده از سرویس، این قوانین رو می‌پذیرید.`,
      { parse_mode: 'HTML', ...mainMenuKB(userId) }
    );
  }

  if (text === '🛠 پنل مدیریت' && isAdmin(userId)) {
    return bot.sendMessage(chatId,
      `🛠 <b>پنل مدیریت</b>\n\n` +
      `از بخش‌های زیر می‌تونید ربات رو مدیریت کنید:`,
      { parse_mode: 'HTML', ...adminPanelKB() }
    );
  }
});

// ═══════════════════════════════════════════
//  CALLBACK QUERY HANDLER
// ═══════════════════════════════════════════
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message?.chat.id;
  const data = query.data;
  if (!chatId || !data) return;

  // ─── Membership Check ───
  if (data === 'check_membership') {
    const isMember = await isUserChannelMember(userId);
    if (isMember) {
      await bot.answerCallbackQuery(query.id, { text: '✅ عضویت تأیید شد!' });
      return bot.sendMessage(chatId,
        `⚡ <b>VorteX VPN</b>\n\n` +
        `عضویتت تأیید شد ✅\n\n` +
        `حالا می‌تونی از ربات استفاده کنی! 👇`,
        { parse_mode: 'HTML', ...mainMenuKB(userId) }
      );
    } else {
      return bot.answerCallbackQuery(query.id, { text: '❌ هنوز عضو کانال نشدید!', show_alert: true });
    }
  }

  // ─── Back Navigation ───
  if (data === 'back:menu') {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `⚡ <b>VorteX VPN</b>\n\n` + `از منوی پایین استفاده کن 👇`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...mainMenuKB(userId) }
    );
  }

  if (data === 'back:servers') {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `⚡ <b>خرید سرویس VPN</b>\n\n` + `از بین سرورهای زیر انتخاب کنید:`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...serverSelectionKB() }
    );
  }

  if (data === 'back:volumes') {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `⚡ <b>انتخاب حجم</b>\n\n` + `حجم مورد نظر رو انتخاب کنید:`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...volumeKB() }
    );
  }

  // ─── Buy Flow ───
  if (data === 'srv:all') {
    await bot.answerCallbackQuery(query.id);
    return bot.editMessageText(
      `⚡ <b>انتخاب حجم</b>\n\n` + `حجم اینترنت مورد نظرتون رو انتخاب کنید:`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...volumeKB() }
    );
  }

  if (data.startsWith('vol:')) {
    await bot.answerCallbackQuery(query.id);
    const vol = data.split(':')[1];
    const volLabel = vol === '20' ? '۲۰ گیگ' : vol === '10' ? '۱۰ گیگ' : '۵ گیگ';
    const price = vol === '20' ? ALL_SERVERS_PRICE_20 : vol === '10' ? ALL_SERVERS_PRICE_10 : ALL_SERVERS_PRICE_5;
    userInvoices.set(userId, {
      serverName: 'همه سرورها', userName: query.from.first_name,
      volumeLabel: volLabel, timeLabel: 'تعیین نشده', amount: price,
      lastInvoiceMessageId: null, stage: 'volume_select',
    });
    db.saveInvoice(userId, userInvoices.get(userId));
    return bot.editMessageText(
      `⚡ <b>انتخاب مدت زمان</b>\n\n` +
      `📦 حجم: ${volLabel}\n` +
      `💰 قیمت: ${toPersianNumber(price)} تومان\n\n` +
      `مدت زمان سرویس رو انتخاب کنید:`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...timeKB() }
    );
  }

  if (data.startsWith('time:')) {
    await bot.answerCallbackQuery(query.id);
    const time = data.split(':')[1];
    const timeLabel = time === 'unlimited' ? 'نامحدود' : time === '30' ? '۳۰ روزه' : '۱۵ روزه';
    const inv = userInvoices.get(userId);
    if (!inv) return;
    inv.timeLabel = timeLabel;
    inv.stage = 'invoice';
    userInvoices.set(userId, inv);
    db.saveInvoice(userId, inv);

    const invoiceText =
      `⚡ <b>فاکتور خرید</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📦 <b>جزئیات سفارش:</b>\n` +
      `🌐 سرور: ${inv.serverName}\n` +
      `📦 حجم: ${inv.volumeLabel}\n` +
      `⏰ مدت: ${timeLabel}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💰 <b>مبلغ قابل پرداخت:</b>\n` +
      `💳 ${toPersianNumber(inv.amount)} تومان\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💳 <b>شماره کارت:</b>\n` +
      `<code>${CARD_NUMBER}</code>\n\n` +
      `⚠️ پس از پرداخت، روی «تأیید و پرداخت» بزنید و رسید رو بفرستید.`;

    return bot.editMessageText(invoiceText, {
      chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...confirmKB()
    });
  }

  // ─── Invoice Confirm/Cancel ───
  if (data === 'inv:confirm') {
    await bot.answerCallbackQuery(query.id);
    const inv = userInvoices.get(userId);
    if (!inv) return;
    inv.stage = 'receipt_sent';
    userInvoices.set(userId, inv);
    db.saveInvoice(userId, inv);

    awaitingReceipts.set(userId, { serverName: inv.serverName, amount: inv.amount });
    db.saveAwaitingReceipt(userId, awaitingReceipts.get(userId));

    return bot.editMessageText(
      `⚡ <b>ارسال رسید پرداخت</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `💳 شماره کارت:\n` +
      `<code>${CARD_NUMBER}</code>\n\n` +
      `💰 مبلغ: <b>${toPersianNumber(inv.amount)} تومان</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📸 حالا یک عکس از رسید پرداخت بفرستید.\n` +
      `پس از بررسی ادمین، کانفیگ VPN برایتان ارسال می‌شود.`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' }
    );
  }

  if (data === 'inv:cancel') {
    await bot.answerCallbackQuery(query.id, { text: '❌ خرید لغو شد' });
    userInvoices.delete(userId);
    db.removeInvoice(userId);
    return bot.editMessageText(
      `❌ <b>خرید لغو شد</b>\n\n` + `هر وقت خواستی دوباره شروع کن 👇`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML', ...mainMenuKB(userId) }
    );
  }

  // ─── Account ───
  if (data === 'acc:orders') {
    await bot.answerCallbackQuery(query.id);
    const inv = userInvoices.get(userId);
    let info = inv
      ? `📦 <b>سفارش اخیر:</b>\n\n` +
        `🖥 سرور: ${inv.serverName}\n` +
        `📦 حجم: ${inv.volumeLabel}\n` +
        `⏰ مدت: ${inv.timeLabel}\n` +
        `💰 مبلغ: ${inv.amount ? toPersianNumber(inv.amount) + ' تومان' : '—'}\n` +
        `📋 وضعیت: ${inv.stage === 'receipt_sent' ? '⏳ در انتظار تأیید' : '📝 در حال تکمیل'}`
      : '📭 سفارش ثبت‌شده‌ای ندارید.';
    return bot.sendMessage(chatId, info, { parse_mode: 'HTML', ...mainMenuKB(userId) });
  }

  if (data === 'acc:referral') {
    await bot.answerCallbackQuery(query.id);
    return bot.sendMessage(chatId,
      `🎟 <b>کد دعوت شما:</b>\n\n` +
      `<code>VX-${userId}</code>\n\n` +
      `این کد رو با دوستانتون به اشتراک بذارید.`,
      { parse_mode: 'HTML', ...mainMenuKB(userId) }
    );
  }

  // ─── Admin Panel ───
  if (isAdmin(userId)) {
    if (data === 'adm:channel') {
      await bot.answerCallbackQuery(query.id);
      adminStates.set(userId, { mode: 'awaiting_channel_id' });
      return bot.sendMessage(chatId,
        `📡 <b>تنظیم کانال</b>\n\n` +
        `آیدی کانال جدید رو بفرستید:\n` +
        `فرمت: <code>@channel_name</code>`,
        { parse_mode: 'HTML', ...backKB() }
      );
    }

    if (data === 'adm:membership') {
      await bot.answerCallbackQuery(query.id);
      membershipRequired = !membershipRequired;
      db.saveSetting('membership', String(membershipRequired));
      return bot.sendMessage(chatId,
        `👥 <b>عضویت اجباری</b>\n\n` +
        `وضعیت فعلی: ${membershipRequired ? '✅ فعال' : '❌ غیرفعال'}\n\n` +
        `برای تغییر دوباره دکمه رو بزنید.`,
        { parse_mode: 'HTML', ...adminPanelKB() }
      );
    }

    if (data === 'adm:prices') {
      await bot.answerCallbackQuery(query.id);
      adminStates.set(userId, { mode: 'editing_price_20' });
      return bot.sendMessage(chatId,
        `💰 <b>تنظیم قیمت‌ها</b>\n\n` +
        `قیمت ۲۰ گیگ (تومان) رو وارد کنید:\n` +
        `(قیمت فعلی: ${toPersianNumber(ALL_SERVERS_PRICE_20)} ت)`,
        { parse_mode: 'HTML', ...backKB() }
      );
    }

    if (data === 'adm:card') {
      await bot.answerCallbackQuery(query.id);
      adminStates.set(userId, { mode: 'editing_card' });
      return bot.sendMessage(chatId,
        `💳 <b>شماره کارت</b>\n\n` +
        `شماره کارت جدید رو بفرستید:`,
        { parse_mode: 'HTML', ...backKB() }
      );
    }

    if (data === 'adm:users') {
      await bot.answerCallbackQuery(query.id);
      const userCount = seenUsers.size;
      return bot.sendMessage(chatId,
        `📋 <b>لیست کاربران</b>\n\n` +
        `تعداد کل: ${userCount} نفر\n\n` +
        `آخرین کاربران:\n` +
        [...seenUsers].slice(-5).map(id => `• <code>${id}</code>`).join('\n'),
        { parse_mode: 'HTML', ...adminPanelKB() }
      );
    }

    // ─── Admin Approve/Reject ───
    if (data.startsWith('adm:approve:')) {
      const targetUserId = Number(data.split(':')[2]);
      await bot.answerCallbackQuery(query.id, { text: '✅ تأیید شد' });

      const inv = userInvoices.get(targetUserId) || awaitingReceipts.get(targetUserId) || { serverName: 'نامشخص', amount: 0, volumeLabel: '۲۰ گیگ', timeLabel: 'نامحدود', userName: 'کاربر' };

      const marzbanResult = await createMarzbanUserFromInvoice(targetUserId, inv);

      let replyToUser = `✅ <b>پرداخت شما تأیید شد!</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
      if (marzbanResult.ok) {
        replyToUser += `🟢 <b>کانفیگ VPN شما فعال شد:</b>\n\n` +
          `📦 حجم: ${inv.volumeLabel}\n` +
          `⏰ مدت: ${inv.timeLabel}\n\n`;
        if (marzbanResult.subscriptionUrl) {
          replyToUser += `🔗 <b>لینک اشتراک:</b>\n<code>${marzbanResult.subscriptionUrl}</code>\n\n`;
          replyToUser += `👆 این لینک رو در اپلیکیشن VPN کپی و وارد کنید.\n\n`;
        }
        replyToUser += `⚠️ لینک اشتراک رو با کسی به اشتراک نذارید!\n`;
      } else {
        replyToUser += `⚠️ پرداخت تأیید شد اما فعال‌سازی خودکار با خطا مواجه شد.\n` +
          `لطفاً با پشتیبانی تماس بگیرید.\n`;
      }

      try {
        await bot.sendMessage(targetUserId, replyToUser, { parse_mode: 'HTML', ...mainMenuKB(targetUserId) });
      } catch {}

      // Update admin message
      try {
        await bot.editMessageText(
          `✅ <b>تأیید شد</b>\n\n` +
          `👤 کاربر: <code>${targetUserId}</code>\n` +
          `💰 مبلغ: ${toPersianNumber(inv.amount)} تومان\n` +
          `📦 حجم: ${inv.volumeLabel}\n` +
          `${marzbanResult.ok ? '🟢 مرزبان: فعال شد' : '⚠️ مرزبان: خطا'}`,
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' }
        );
      } catch {}
      return;
    }

    if (data.startsWith('adm:reject:')) {
      const targetUserId = Number(data.split(':')[2]);
      await bot.answerCallbackQuery(query.id, { text: '❌ رد شد' });
      try {
        await bot.sendMessage(targetUserId, `❌ <b>پرداخت شما رد شد.</b>\n\nاگر فکر می‌کنید اشتباهه با پشتیبانی تماس بگیرید.`, { parse_mode: 'HTML', ...mainMenuKB(targetUserId) });
      } catch {}
      try {
        await bot.editMessageText(
          `❌ <b>رد شد</b>\n\n👤 کاربر: <code>${targetUserId}</code>`,
          { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'HTML' }
        );
      } catch {}
      return;
    }
  }
});

// ═══════════════════════════════════════════
console.log('⚡ VorteX VPN Bot is running...');
// ═══════════════════════════════════════════

module.exports = {
  bot, seenUsers, userInvoices, awaitingReceipts,
  getChannelUsername: () => currentChannelUsername,
  getMembershipRequired: () => membershipRequired,
  getMarzbanToken, createMarzbanUserFromInvoice, reloadState,
};
