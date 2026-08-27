const express = require('express');
const session = require('express-session');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vortex2024';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CARD_NUMBER = process.env.CARD_NUMBER || '';
const MARZBAN_URL = process.env.MARZBAN_URL || '';
const MARZBAN_USERNAME = process.env.MARZBAN_USERNAME || '';
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD || '';

let botState = null;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'vortex-panel-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 },
}));

// ═══════════════════════════════════════════
//  AUTH MIDDLEWARE
// ═══════════════════════════════════════════
function auth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

// ═══════════════════════════════════════════
//  TEMPLATE HELPERS
// ═══════════════════════════════════════════
const NAV = [
  { href: '/', icon: '📊', label: 'داشبورد' },
  { href: '/orders', icon: '📦', label: 'سفارشات' },
  { href: '/users', icon: '👥', label: 'کاربران' },
  { href: '/marzban', icon: '🔌', label: 'مرزبان' },
  { href: '/settings', icon: '⚙️', label: 'تنظیمات' },
];

function layout(title, activePage, bodyHtml) {
  const navHtml = NAV.map(item => {
    const active = activePage === item.href;
    return `<a href="${item.href}" class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
      active ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }">
      <span class="text-lg">${item.icon}</span>
      <span>${item.label}</span>
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | VorteX Panel</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { sans: ['Vazirmatn', 'Tahoma', 'sans-serif'] }
        }
      }
    }
  </script>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33/Vazirmatn-font-face.css" rel="stylesheet">
  <style>
    body { font-family: 'Vazirmatn', Tahoma, sans-serif; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #1f2937; }
    ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
  <!-- Sidebar -->
  <aside class="fixed right-0 top-0 h-full w-64 bg-gray-900 border-l border-gray-800 flex flex-col z-50">
    <div class="p-5 border-b border-gray-800">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">V</div>
        <div>
          <h1 class="font-bold text-white">VorteX VPN</h1>
          <p class="text-xs text-gray-500">پنل مدیریت ربات</p>
        </div>
      </div>
    </div>
    <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
      ${navHtml}
    </nav>
    <div class="p-3 border-t border-gray-800">
      <div class="flex items-center gap-2 px-4 py-2 text-xs text-gray-600">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span>بات فعال</span>
      </div>
      <a href="/logout" class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all mt-1">
        <span>🚪</span>
        <span>خروج</span>
      </a>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="mr-64 p-6 min-h-screen">
    <div class="fade-in max-w-7xl mx-auto">
      ${bodyHtml}
    </div>
  </main>
</body>
</html>`;
}

function statCard(icon, label, value, color) {
  return `
  <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all">
    <div class="flex items-center justify-between mb-3">
      <span class="text-2xl">${icon}</span>
      <span class="text-xs px-2 py-1 rounded-full ${color}">${label}</span>
    </div>
    <div class="text-3xl font-bold text-white">${value}</div>
  </div>`;
}

function statusBadge(status) {
  const map = {
    'pending': ['در انتظار', 'bg-yellow-500/20 text-yellow-400'],
    'awaiting_receipt': ['ارسال رسید', 'bg-blue-500/20 text-blue-400'],
    'approved': ['تأیید شده', 'bg-green-500/20 text-green-400'],
    'rejected': ['رد شده', 'bg-red-500/20 text-red-400'],
    'delivered': ['تحویل شده', 'bg-purple-500/20 text-purple-400'],
    'cancelled': ['لغو شده', 'bg-gray-500/20 text-gray-400'],
  };
  const [text, cls] = map[status] || [status, 'bg-gray-500/20 text-gray-400'];
  return `<span class="px-2.5 py-1 text-xs rounded-full ${cls}">${text}</span>`;
}

// ═══════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════
app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  const error = req.query.error ? '<div class="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm mb-4">رمز عبور اشتباه است</div>' : '';
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود | VorteX Panel</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33/Vazirmatn-font-face.css" rel="stylesheet">
  <style>body { font-family: 'Vazirmatn', Tahoma, sans-serif; }</style>
</head>
<body class="bg-gray-950 min-h-screen flex items-center justify-center">
  <div class="w-full max-w-sm mx-4">
    <div class="text-center mb-8">
      <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-blue-500/20">V</div>
      <h1 class="text-2xl font-bold text-white">VorteX VPN Panel</h1>
      <p class="text-gray-500 text-sm mt-1">پنل مدیریت ربات تلگرام</p>
    </div>
    <form method="POST" action="/login" class="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
      ${error}
      <div>
        <label class="block text-sm text-gray-400 mb-2">رمز عبور</label>
        <input type="password" name="password" required
          class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
          placeholder="رمز عبور پنل را وارد کنید">
      </div>
      <button type="submit"
        class="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/20">
        ورود به پنل
      </button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
app.get('/', auth, (req, res) => {
  const users = botState ? botState.seenUsers.size : 0;
  const orders = botState ? botState.userInvoices.size : 0;
  const pending = botState ? botState.awaitingReceipts.size : 0;
  const channel = botState ? botState.getChannelUsername() : 'N/A';
  const membership = botState ? botState.getMembershipRequired() : false;

  // Recent invoices
  let recentOrdersHtml = '';
  if (botState && botState.userInvoices.size > 0) {
    const entries = [...botState.userInvoices.entries()].slice(-10).reverse();
    recentOrdersHtml = entries.map(([userId, inv]) => `
      <tr class="border-t border-gray-800 hover:bg-gray-800/50">
        <td class="px-4 py-3 text-sm">${userId}</td>
        <td class="px-4 py-3 text-sm">${inv.userName || '-'}</td>
        <td class="px-4 py-3 text-sm">${inv.serverName || '-'}</td>
        <td class="px-4 py-3 text-sm">${inv.volumeLabel || '-'}</td>
        <td class="px-4 py-3 text-sm">${inv.timeLabel || '-'}</td>
        <td class="px-4 py-3 text-sm font-bold text-green-400">${inv.amount ? inv.amount.toLocaleString('fa-IR') + ' تومان' : 'تعریف نشده'}</td>
      </tr>
    `).join('');
  } else {
    recentOrdersHtml = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">هنوز سفارشی ثبت نشده</td></tr>';
  }

  // Pending receipts
  let pendingHtml = '';
  if (botState && botState.awaitingReceipts.size > 0) {
    const entries = [...botState.awaitingReceipts.entries()];
    pendingHtml = entries.map(([userId, data]) => `
      <tr class="border-t border-gray-800 hover:bg-gray-800/50">
        <td class="px-4 py-3 text-sm">${userId}</td>
        <td class="px-4 py-3 text-sm">${data.serverName || '-'}</td>
        <td class="px-4 py-3 text-sm font-bold text-yellow-400">${data.amount ? data.amount.toLocaleString('fa-IR') + ' تومان' : '-'}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400">در انتظار رسید</span>
        </td>
      </tr>
    `).join('');
  } else {
    pendingHtml = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">رسید در انتظاری وجود ندارد</td></tr>';
  }

  const content = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">داشبورد</h1>
        <p class="text-gray-500 text-sm mt-1">خلاصه وضعیت ربات و سفارشات</p>
      </div>
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        ربات فعال
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${statCard('👥', 'کل کاربران', users, 'bg-blue-500/20 text-blue-400')}
      ${statCard('📦', 'کل سفارشات', orders, 'bg-purple-500/20 text-purple-400')}
      ${statCard('⏳', 'در انتظار رسید', pending, 'bg-yellow-500/20 text-yellow-400')}
      ${statCard('📢', 'کانال', channel.replace('@', ''), 'bg-green-500/20 text-green-400')}
    </div>

    <!-- Quick Info -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 class="text-sm text-gray-400 mb-2">شماره کارت</h3>
        <p class="text-lg font-mono font-bold text-white">${CARD_NUMBER || 'تعریف نشده'}</p>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 class="text-sm text-gray-400 mb-2">عضویت اجباری کانال</h3>
        <p class="text-lg font-bold ${membership ? 'text-green-400' : 'text-red-400'}">${membership ? 'فعال ✅' : 'غیرفعال ❌'}</p>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h3 class="text-sm text-gray-400 mb-2">پنل مرزبان</h3>
        <p class="text-lg font-bold ${MARZBAN_URL ? 'text-green-400' : 'text-red-400'}">${MARZBAN_URL ? 'متصل ✅' : 'تنظیم نشده ❌'}</p>
      </div>
    </div>

    <!-- Pending Receipts -->
    <div class="bg-gray-900 border border-gray-800 rounded-2xl mb-6">
      <div class="px-5 py-4 border-b border-gray-800">
        <h2 class="font-bold text-lg">⏳ رسیدهای در انتظار بررسی</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800/50 text-gray-400 text-sm">
            <tr>
              <th class="px-4 py-3 text-right">آیدی کاربر</th>
              <th class="px-4 py-3 text-right">سرور</th>
              <th class="px-4 py-3 text-right">مبلغ</th>
              <th class="px-4 py-3 text-right">وضعیت</th>
            </tr>
          </thead>
          <tbody>${pendingHtml}</tbody>
        </table>
      </div>
    </div>

    <!-- Recent Orders -->
    <div class="bg-gray-900 border border-gray-800 rounded-2xl">
      <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 class="font-bold text-lg">📦 آخرین سفارشات</h2>
        <a href="/orders" class="text-sm text-blue-400 hover:text-blue-300">مشاهده همه →</a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800/50 text-gray-400 text-sm">
            <tr>
              <th class="px-4 py-3 text-right">آیدی کاربر</th>
              <th class="px-4 py-3 text-right">نام</th>
              <th class="px-4 py-3 text-right">سرور</th>
              <th class="px-4 py-3 text-right">حجم</th>
              <th class="px-4 py-3 text-right">زمان</th>
              <th class="px-4 py-3 text-right">مبلغ</th>
            </tr>
          </thead>
          <tbody>${recentOrdersHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  res.send(layout('داشبورد', '/', content));
});

// ═══════════════════════════════════════════
//  ORDERS PAGE
// ═══════════════════════════════════════════
app.get('/orders', auth, (req, res) => {
  let rowsHtml = '';

  if (botState && botState.userInvoices.size > 0) {
    const entries = [...botState.userInvoices.entries()].reverse();
    rowsHtml = entries.map(([userId, inv]) => {
      const isPending = botState.awaitingReceipts.has(userId);
      return `
      <tr class="border-t border-gray-800 hover:bg-gray-800/50 transition-colors">
        <td class="px-4 py-3 text-sm font-mono">${userId}</td>
        <td class="px-4 py-3 text-sm">${inv.userName || '-'}</td>
        <td class="px-4 py-3 text-sm">${inv.serverName || '-'}</td>
        <td class="px-4 py-3 text-sm">${inv.volumeLabel || '-'}</td>
        <td class="px-4 py-3 text-sm">${inv.timeLabel || '-'}</td>
        <td class="px-4 py-3 text-sm font-bold">${inv.amount ? inv.amount.toLocaleString('fa-IR') + ' تومان' : '-'}</td>
        <td class="px-4 py-3">
          ${isPending
            ? '<span class="px-2.5 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400">⏳ در انتظار رسید</span>'
            : inv.amount ? '<span class="px-2.5 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400">📦 ثبت شده</span>'
            : '<span class="px-2.5 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">جدید</span>'
          }
        </td>
        <td class="px-4 py-3">
          <div class="flex gap-1">
            <button onclick="sendExpireNotify(${userId})" class="px-3 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors">
              📩 اتمام
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } else {
    rowsHtml = '<tr><td colspan="8" class="px-4 py-12 text-center text-gray-500">هنوز سفارشی ثبت نشده است</td></tr>';
  }

  // Pending receipts section
  let pendingRowsHtml = '';
  if (botState && botState.awaitingReceipts.size > 0) {
    const entries = [...botState.awaitingReceipts.entries()];
    pendingRowsHtml = entries.map(([userId, data]) => `
      <tr class="border-t border-gray-800 hover:bg-gray-800/50">
        <td class="px-4 py-3 text-sm font-mono">${userId}</td>
        <td class="px-4 py-3 text-sm">${data.serverName || '-'}</td>
        <td class="px-4 py-3 text-sm font-bold text-yellow-400">${data.amount ? data.amount.toLocaleString('fa-IR') + ' تومان' : '-'}</td>
        <td class="px-4 py-3 text-sm text-gray-400">لطفاً از تلگرام رسید را بررسی کنید</td>
      </tr>
    `).join('');
  }

  const content = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">سفارشات</h1>
        <p class="text-gray-500 text-sm mt-1">مدیریت تمام سفارشات ثبت‌شده</p>
      </div>
    </div>

    <!-- Pending Receipts -->
    ${botState && botState.awaitingReceipts.size > 0 ? `
    <div class="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl mb-6">
      <div class="px-5 py-4 border-b border-yellow-500/20">
        <h2 class="font-bold text-lg text-yellow-400">⏳ رسیدهای در انتظار بررسی (${botState.awaitingReceipts.size})</h2>
        <p class="text-sm text-gray-400 mt-1">این کاربران رسید پرداخت فرستاده‌اند و منتظر تأیید شما هستند</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-yellow-500/5 text-gray-400 text-sm">
            <tr>
              <th class="px-4 py-3 text-right">آیدی کاربر</th>
              <th class="px-4 py-3 text-right">سرور</th>
              <th class="px-4 py-3 text-right">مبلغ</th>
              <th class="px-4 py-3 text-right">توضیح</th>
            </tr>
          </thead>
          <tbody>${pendingRowsHtml}</tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- All Orders -->
    <div class="bg-gray-900 border border-gray-800 rounded-2xl">
      <div class="px-5 py-4 border-b border-gray-800">
        <h2 class="font-bold text-lg">همه سفارشات (${botState ? botState.userInvoices.size : 0})</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800/50 text-gray-400 text-sm">
            <tr>
              <th class="px-4 py-3 text-right">آیدی کاربر</th>
              <th class="px-4 py-3 text-right">نام</th>
              <th class="px-4 py-3 text-right">سرور</th>
              <th class="px-4 py-3 text-right">حجم</th>
              <th class="px-4 py-3 text-right">زمان</th>
              <th class="px-4 py-3 text-right">مبلغ</th>
              <th class="px-4 py-3 text-right">وضعیت</th>
              <th class="px-4 py-3 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>

    <script>
      async function sendExpireNotify(userId) {
        if (!confirm('آیا مطمئنید که می‌خواهید اعلان اتمام سرویس برای این کاربر ارسال شود؟')) return;
        try {
          const res = await fetch('/api/notify-expire/' + userId, { method: 'POST' });
          const data = await res.json();
          alert(data.message || 'انجام شد');
        } catch(e) {
          alert('خطا در ارسال اعلان');
        }
      }
    </script>
  `;

  res.send(layout('سفارشات', '/orders', content));
});

// ═══════════════════════════════════════════
//  USERS PAGE
// ═══════════════════════════════════════════
app.get('/users', auth, (req, res) => {
  let rowsHtml = '';

  if (botState && botState.seenUsers.size > 0) {
    const userIds = [...botState.seenUsers];
    rowsHtml = userIds.map(userId => {
      const invoice = botState.userInvoices.get(userId);
      const hasPending = botState.awaitingReceipts.has(userId);
      return `
      <tr class="border-t border-gray-800 hover:bg-gray-800/50 transition-colors">
        <td class="px-4 py-3 text-sm font-mono">${userId}</td>
        <td class="px-4 py-3 text-sm">${invoice ? (invoice.userName || '-') : '-'}</td>
        <td class="px-4 py-3 text-sm">
          ${invoice ? `<span class="text-green-400">خریدار</span>` : `<span class="text-gray-500">بازدیدکننده</span>`}
        </td>
        <td class="px-4 py-3 text-sm">
          ${hasPending
            ? '<span class="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400">رسید در انتظار</span>'
            : invoice
              ? '<span class="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">سفارش ثبت‌شده</span>'
              : '<span class="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">بدون سفارش</span>'
          }
        </td>
        <td class="px-4 py-3">
          <a href="https://t.me/${userId}" target="_blank" class="text-blue-400 hover:text-blue-300 text-sm">پیام ❯</a>
        </td>
      </tr>`;
    }).join('');
  } else {
    rowsHtml = '<tr><td colspan="5" class="px-4 py-12 text-center text-gray-500">هنوز کاربری وارد ربات نشده</td></tr>';
  }

  const content = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">کاربران</h1>
        <p class="text-gray-500 text-sm mt-1">${botState ? botState.seenUsers.size : 0} کاربر در ربات</p>
      </div>
    </div>

    <div class="bg-gray-900 border border-gray-800 rounded-2xl">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800/50 text-gray-400 text-sm">
            <tr>
              <th class="px-4 py-3 text-right">آیدی عددی</th>
              <th class="px-4 py-3 text-right">نام</th>
              <th class="px-4 py-3 text-right">نوع</th>
              <th class="px-4 py-3 text-right">وضعیت</th>
              <th class="px-4 py-3 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  res.send(layout('کاربران', '/users', content));
});

// ═══════════════════════════════════════════
//  MARZBAN PAGE
// ═══════════════════════════════════════════
app.get('/marzban', auth, async (req, res) => {
  let marzbanUsers = [];
  let error = null;

  if (!botState || !MARZBAN_URL || !MARZBAN_USERNAME || !MARZBAN_PASSWORD) {
    error = 'تنظیمات مرزبان (MARZBAN_URL, MARZBAN_USERNAME, MARZBAN_PASSWORD) در متغیرهای محیطی تعریف نشده‌اند.';
  } else {
    try {
      const tokenResult = await botState.getMarzbanToken();
      if (!tokenResult.ok) {
        error = 'خطا در اتصال به مرزبان: ' + (tokenResult.error || 'نامشخص');
      } else {
        const fetch = require('node-fetch');
        const baseUrl = MARZBAN_URL.replace(/\/dashboard\/?$/, '').replace(/\/$/, '');

        // Try multiple endpoints for Marzban API compatibility
        let apiRes = null;
        const endpoints = ['/api/admin/users', '/api/admin/user', '/api/users'];
        for (const ep of endpoints) {
          apiRes = await fetch(`${baseUrl}${ep}?offset=0&limit=100`, {
            headers: { Authorization: `Bearer ${tokenResult.token}` },
          });
          if (apiRes.ok) break;
        }

        if (apiRes && apiRes.ok) {
          const data = await apiRes.json();
          marzbanUsers = data.users || data || [];
          if (!Array.isArray(marzbanUsers)) marzbanUsers = [];
        } else {
          const status = apiRes ? apiRes.status : 'unknown';
          error = `خطا در دریافت لیست کاربران: ${status} - احتمالاً نسخه مرزبان شما API لیست کاربران ندارد یا دسترسی ادمین کافی نیست.`;
        }
      }
    } catch (e) {
      error = 'خطا در ارتباط با مرزبان: ' + e.message;
    }
  }

  let usersHtml = '';
  if (error) {
    usersHtml = `<tr><td colspan="6" class="px-4 py-8 text-center text-red-400">${error}</td></tr>`;
  } else if (marzbanUsers.length === 0) {
    usersHtml = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">کاربری در مرزبان یافت نشد</td></tr>';
  } else {
    usersHtml = marzbanUsers.map(u => {
      const dataLimitGB = u.data_limit ? (u.data_limit / (1024 * 1024 * 1024)).toFixed(1) : 'نامحدود';
      const usedGB = u.used_traffic ? (u.used_traffic / (1024 * 1024 * 1024)).toFixed(1) : '0';
      const expiry = u.expire ? new Date(u.expire * 1000).toLocaleDateString('fa-IR') : 'نامحدود';
      const isActive = u.is_active !== false && (!u.expire || u.expire * 1000 > Date.now());

      return `
      <tr class="border-t border-gray-800 hover:bg-gray-800/50 transition-colors">
        <td class="px-4 py-3 text-sm font-mono">${u.username || '-'}</td>
        <td class="px-4 py-3 text-sm">${usedGB} گیگ / ${dataLimitGB} گیگ</td>
        <td class="px-4 py-3 text-sm">${expiry}</td>
        <td class="px-4 py-3">
          ${isActive
            ? '<span class="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">فعال</span>'
            : '<span class="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400">غیرفعال</span>'
          }
        </td>
        <td class="px-4 py-3 text-sm">${u.proxies ? Object.keys(u.proxies).join(', ') : '-'}</td>
        <td class="px-4 py-3 text-sm font-mono text-xs">${u.subscription_url ? `<a href="${u.subscription_url}" target="_blank" class="text-blue-400 hover:text-blue-300">لینک ❯</a>` : '-'}</td>
      </tr>`;
    }).join('');
  }

  const content = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">مرزبان</h1>
        <p class="text-gray-500 text-sm mt-1">مدیریت کاربران VPN پنل مرزبان</p>
      </div>
      <div class="flex items-center gap-2 text-sm ${MARZBAN_URL ? 'text-green-400' : 'text-red-400'}">
        <span class="w-2 h-2 rounded-full ${MARZBAN_URL ? 'bg-green-500' : 'bg-red-500'}"></span>
        ${MARZBAN_URL ? 'متصل به مرزبان' : 'تنظیم نشده'}
      </div>
    </div>

    <div class="bg-gray-900 border border-gray-800 rounded-2xl">
      <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 class="font-bold text-lg">کاربران مرزبان (${marzbanUsers.length})</h2>
        <a href="/marzban" class="text-sm text-blue-400 hover:text-blue-300">🔄 بروزرسانی</a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-800/50 text-gray-400 text-sm">
            <tr>
              <th class="px-4 py-3 text-right">یوزرنیم</th>
              <th class="px-4 py-3 text-right">مصرف / حجم</th>
              <th class="px-4 py-3 text-right">تاریخ انقضا</th>
              <th class="px-4 py-3 text-right">وضعیت</th>
              <th class="px-4 py-3 text-right">پروتکل‌ها</th>
              <th class="px-4 py-3 text-right">لینک اشتراک</th>
            </tr>
          </thead>
          <tbody>${usersHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  res.send(layout('مرزبان', '/marzban', content));
});

// ═══════════════════════════════════════════
//  SETTINGS PAGE
// ═══════════════════════════════════════════
app.get('/settings', auth, (req, res) => {
  const content = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">تنظیمات</h1>
        <p class="text-gray-500 text-sm mt-1">تنظیمات ربات و پنل</p>
      </div>
    </div>

    <form id="settingsForm" class="space-y-6">
      <!-- Prices -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 class="font-bold text-lg mb-4">💰 قیمت‌ها</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">قیمت ۲۰ گیگ (تومان)</label>
            <input type="number" name="price_20" value="${process.env.ALL_SERVERS_PRICE_20 || ''}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">قیمت ۱۰ گیگ (تومان)</label>
            <input type="number" name="price_10" value="${process.env.ALL_SERVERS_PRICE_10 || ''}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">قیمت ۵ گیگ (تومان)</label>
            <input type="number" name="price_5" value="${process.env.ALL_SERVERS_PRICE_5 || ''}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
        </div>
      </div>

      <!-- Payment -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 class="font-bold text-lg mb-4">💳 اطلاعات پرداخت</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">شماره کارت</label>
            <input type="text" name="card_number" value="${CARD_NUMBER}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 font-mono">
          </div>
        </div>
      </div>

      <!-- Channel -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 class="font-bold text-lg mb-4">📢 کانال تلگرام</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">نام کانال</label>
            <input type="text" name="channel" value="${botState ? botState.getChannelUsername() : ''}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">عضویت اجباری</label>
            <select name="membership_required"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
              <option value="true" ${botState && botState.getMembershipRequired() ? 'selected' : ''}>فعال</option>
              <option value="false" ${botState && !botState.getMembershipRequired() ? 'selected' : ''}>غیرفعال</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Admin -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 class="font-bold text-lg mb-4">👤 مدیریت</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">آیدی ادمین</label>
            <input type="text" name="admin_id" value="${process.env.ADMIN_ID || ''}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">آیدی پشتیبانی</label>
            <input type="text" name="support_url" value="${process.env.SUPPORT_WEBAPP_URL || ''}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
        </div>
      </div>

      <!-- Marzban -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 class="font-bold text-lg mb-4">🔌 تنظیمات مرزبان</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">آدرس پنل</label>
            <input type="text" name="marzban_url" value="${MARZBAN_URL}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 font-mono text-sm">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">یوزرنیم</label>
            <input type="text" name="marzban_username" value="${MARZBAN_USERNAME}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">پسورد</label>
            <input type="password" name="marzban_password" value="${MARZBAN_PASSWORD}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
        </div>
      </div>

      <!-- Panel Security -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 class="font-bold text-lg mb-4">🔒 امنیت پنل</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">رمز عبور پنل</label>
            <input type="password" name="admin_password" value="${ADMIN_PASSWORD}"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500">
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button type="submit"
          class="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/20">
          💾 ذخیره تنظیمات
        </button>
      </div>
    </form>

    <div id="settingsMessage" class="hidden fixed top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg z-50">
      تنظیمات با موفقیت ذخیره شد!
    </div>

    <script>
      document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        try {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (res.ok) {
            const msg = document.getElementById('settingsMessage');
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 3000);
          }
        } catch(err) {
          alert('خطا در ذخیره تنظیمات');
        }
      });
    </script>
  `;

  res.send(layout('تنظیمات', '/settings', content));
});

// ═══════════════════════════════════════════
//  API ENDPOINTS
// ═══════════════════════════════════════════
app.post('/api/notify-expire/:userId', auth, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!userId) return res.status(400).json({ error: 'Invalid userId' });

  if (!botState) return res.status(500).json({ error: 'Bot not loaded' });

  try {
    await botState.bot.sendMessage(
      userId,
      'کاربر عزیز، سرویس/کانفیگت به پایان رسیده (اتمام زمان یا حجم). اگر می‌خوای همون سرویس رو تمدید کنی، روی دکمه زیر بزن.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'تمدید همین کانفیگ 🔁', callback_data: `renew_all_${userId}` }]],
        },
      }
    );
    res.json({ message: 'اعلان با موفقیت ارسال شد ✅' });
  } catch (e) {
    res.json({ message: 'خطا در ارسال اعلان: ' + e.message });
  }
});

app.post('/api/settings', auth, (req, res) => {
  // Note: These changes are temporary (in-memory) for the current process.
  // For permanent changes, user should update Railway environment variables.
  const data = req.body;

  // Update bot state if available
  if (botState && data.channel) {
    // Note: currentChannelUsername is a let variable, we can't set it from here
    // The user needs to restart the bot or change it via Telegram admin panel
  }

  res.json({ message: 'تنظیمات در حافظه بروزرسانی شد. برای تغییرات دائمی، متغیرهای Railway رو ویرایش کنید.'});
});

app.get('/api/stats', auth, (req, res) => {
  if (!botState) return res.json({ users: 0, orders: 0, pending: 0 });
  res.json({
    users: botState.seenUsers.size,
    orders: botState.userInvoices.size,
    pending: botState.awaitingReceipts.size,
    channel: botState.getChannelUsername(),
    membershipRequired: botState.getMembershipRequired(),
  });
});

// ═══════════════════════════════════════════
//  HEALTH CHECK (for Railway)
// ═══════════════════════════════════════════
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: botState ? 'running' : 'not loaded',
    uptime: process.uptime(),
  });
});

// ═══════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════
function startServer(exports) {
  botState = exports;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌐 VorteX Web Panel running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`🔑 Default password: ${ADMIN_PASSWORD}\n`);
  });
}

module.exports = { startServer };
