/**
 * KÝ TÚC XÁ 20 GIƯỜNG NGỦ - TIKTOK LIVE INTERACTIVE STREAM GAME
 * Backend Server: Express + Socket.IO + TikTokLiveConnector
 */

const dns = require('dns');
// Ưu tiên IPv4 và DNS Google/Cloudflare để kết nối TikTok Live ổn định
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

let WebcastPushConnection;
try {
  const tiktokSdk = require('tiktok-live-connector');
  WebcastPushConnection = tiktokSdk.WebcastPushConnection || tiktokSdk.TikTokLiveConnection || tiktokSdk;
} catch (err) {
  console.warn('Cảnh báo: Không thể tải tiktok-live-connector:', err.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Tắt hoàn toàn cache để OBS và trình duyệt luôn nhận mã mới nhất
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// TRẠNG THÁI 20 GIƯỜNG NGỦ (IN-MEMORY STATE)
// ==========================================
const TOTAL_BEDS = 20;

// Cấu hình game
const gameConfig = {
  decayEnabled: true,        // Bật tự động trừ điểm sao theo thời gian
  decayIntervalMs: 15000,    // Mỗi 15 giây trừ 1 lần
  decayPoints: 5,            // Số điểm sao trừ mỗi chu kỳ (15s trừ 5 sao)
  minPointsFloor: 40,        // Điểm sao thấp nhất là 40 (không bao giờ trừ dưới 40)
  goodnightBonusPoints: 15,  // Điểm cộng khi chúc ngủ ngon
  chatBonusPoints: 2,        // Điểm cộng khi chat thông thường
  initialPoints: 40,         // Điểm khởi đầu khi lên giường mới
  blanketDurationMs: 60000,  // Thời gian đắp chăn ấm lấp lánh (60s)
  ttsEnabled: true,          // Bật giọng đọc TTS
  welcomeVoiceEnabled: true, // Bật đọc lời chào khi có người vào xem
  windChimeEnabled: true     // Bật âm thanh chuông gió
};

// Thống kê phiên livestream
const streamStats = {
  goodnightCount: 0,
  totalChats: 0,
  totalGifts: 0,
  uniqueSleepers: new Set()
};

// Thời điểm bắt đầu phiên Live (dùng cho bộ đếm thời gian Live 00:00:00)
let streamStartTime = Date.now();

// Khởi tạo 20 giường
let beds = [];
function initBeds() {
  beds = [];
  for (let i = 1; i <= TOTAL_BEDS; i++) {
    beds.push({
      id: i,
      level: 1, // 1: Giường Gỗ, 2: Nệm Êm, 3: Tầng VIP, 4: Hoàng Gia, 5: Thiên Hà
      user: null
    });
  }
}
initBeds();

// Cấp giường định nghĩa
const BED_LEVELS = [
  { level: 1, name: 'Giường Gỗ Ấm Áp', minPoints: 0, color: '#8d6e63' },
  { level: 2, name: 'Giường Nệm Bồng Bềnh', minPoints: 80, color: '#42a5f5' },
  { level: 3, name: 'Giường Ký Túc VIP', minPoints: 160, color: '#ab47bc' },
  { level: 4, name: 'Giường Hoàng Gia', minPoints: 300, color: '#ffa726' },
  { level: 5, name: 'Giường Thiên Hà', minPoints: 500, color: '#ec407a' }
];

// Danh sách từ khóa Chúc Ngủ Ngon
const GOODNIGHT_KEYWORDS = [
  'ngủ ngon', 'ngu ngon',
  'chúc ngủ ngon', 'chuc ngu ngon',
  'chúc cả phòng ngủ ngon', 'chuc ca phong ngu ngon',
  'chúc mn ngủ ngon', 'chuc mn ngu ngon',
  'chúc mọi người ngủ ngon', 'chuc moi nguoi ngu ngon',
  'chúc bạn ngủ ngon', 'chuc ban ngu ngon',
  'chúc ad ngủ ngon', 'chuc ad ngu ngon',
  'gn', 'g9',
  'good night', 'goodnight',
  'mơ đẹp', 'mo dep',
  'sweet dreams', 'ngủ ngoan', 'ngu ngoan'
];

/**
 * Kiểm tra xem bình luận có chứa từ khóa Chúc Ngủ Ngon hay không
 */
function isGoodnightMessage(comment) {
  if (!comment || typeof comment !== 'string') return false;
  const lower = comment.toLowerCase().trim();

  // Kiểm tra chính xác cụm từ hoặc regex phân tách ranh giới từ
  return GOODNIGHT_KEYWORDS.some(keyword => {
    // Nếu là từ ngắn như 'gn', 'g9', yêu cầu ranh giới từ để tránh bắt nhầm
    if (keyword === 'gn' || keyword === 'g9') {
      const regex = new RegExp(`(^|\\s|[.,!?;~])${keyword}($|\\s|[.,!?;~])`, 'i');
      return regex.test(lower);
    }
    return lower.includes(keyword);
  });
}

/**
 * Tìm giường mà user đang nằm
 */
function findBedByUser(uniqueId) {
  return beds.find(b => b.user && b.user.uniqueId === uniqueId);
}

/**
 * Tìm giường trống đầu tiên
 */
function findEmptyBed() {
  return beds.find(b => !b.user);
}

/**
 * Tìm giường có điểm thấp nhất (dùng khi kín 20 giường)
 */
function findLowestScoreBed() {
  let lowestBed = null;
  let minScore = Infinity;
  for (const bed of beds) {
    if (bed.user && bed.user.points < minScore) {
      minScore = bed.user.points;
      lowestBed = bed;
    }
  }
  return lowestBed;
}

const VN_SYLLABLES = [
  'nguyen','tran','le','pham','hoang','huynh','phan','vu','vo','dang','bui','do','ho','ngo','duong','ly','dinh','dao','doan',
  'van','thi','canh','dat','nam','linh','huong','thao','duc','anh','tuan','long','minh','quan','huy','ha','nga','trang','phuong',
  'hoa','mai','yen','hang','loan','thanh','huyen','quynh','giang','phuc','khoa','tri','kien','son','thang','tien','hai','hieu',
  'hung','viet','dung','trung','bao','phong','khang','an','khanh','tam','thuy','tram','ngoc','diep','chau','vy','nhi','nhu','my',
  'quoc','gia','trong','tu','ngan','bich','quyen','thanh','tien','khoi','bac','dong','tay'
].sort((a,b) => b.length - a.length);

function splitVietnameseName(str) {
  let s = str.toLowerCase();
  let result = [];
  let pos = 0;
  while (pos < s.length) {
    let matched = false;
    for (const syl of VN_SYLLABLES) {
      if (s.startsWith(syl, pos)) {
        result.push(s.slice(pos, pos + syl.length));
        pos += syl.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(s.slice(pos));
      break;
    }
  }
  return result.length > 1 ? result.join(' ') : str;
}

function cleanSafeString(val, fallback = '') {
  if (val === undefined || val === null) return fallback;
  const s = String(val).trim();
  if (!s || s === 'undefined' || s === 'null' || s === '[object Object]') return fallback;
  return s;
}

function formatNameForSpeech(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'Bạn xem';
  let name = rawName.trim().normalize('NFC');
  if (!name || name === 'undefined' || name === 'null' || name === '[object Object]') return 'Bạn xem';
  
  // 1. Dạng user mặc định: user12345678 -> bạn xem
  if (/^user\d{3,}$/i.test(name)) return 'bạn xem';

  // 2. Tách camelCase (ví dụ: NguyenVanCanh -> Nguyen Van Canh)
  name = name.replace(/([a-zđ])([A-ZĐ])/g, '$1 $2');

  // 3. Thay thế ký tự ngăn cách bằng khoảng trắng
  name = name.replace(/[._\-+@~#%&*\/\ \|]/g, ' ');

  // 4. Bỏ các ký tự đặc biệt, icon, emoji, CJK và chữ số
  name = name.replace(/[^\p{Script=Latin}\s]/gu, ' ');

  // 5. Nếu là từ viết liền dài >= 6 ký tự không có dấu cách -> Tách âm tiết tiếng Việt
  name = name.replace(/\s+/g, ' ').trim();
  if (name && !name.includes(' ') && name.length >= 6) {
    name = splitVietnameseName(name);
  }

  // 6. Xóa khoảng trắng thừa và chuẩn hóa
  name = name.replace(/\s+/g, ' ').trim();
  if (!name || name.length < 2) return 'bạn xem';

  // Lấy tối đa 4 từ để đọc tự nhiên
  const words = name.split(' ');
  if (words.length > 4) name = words.slice(0, 4).join(' ');

  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Xếp giường đồng bộ trên Server theo đúng quy tắc phân cấp:
 * - Tier 1 (Chat / Chúc ngủ ngon / Thả tim / Share): CHỈ vào giường trống, KHÔNG BAO GIỜ đá người khác.
 * - Tier 2 (Follow / Tặng bông nhỏ): Vào giường trống; nếu đầy 20 giường thì chỉ thế chỗ Tier 1 thấp điểm nhất.
 * - Tier 3 (Quà VIP): Vào giường trống; nếu đầy thì thế chỗ người có cấp thấp hơn hoặc điểm thấp nhất.
 */
function assignServerBed(userData, targetTier = 1, initialPoints = 30, coins = 0) {
  const uniqueId = cleanSafeString(userData.uniqueId || userData.userId || userData.id, 'user_' + Date.now());
  const nickname = cleanSafeString(userData.nickname || userData.name || uniqueId, 'Khách Xem');
  const avatar = cleanSafeString(
    userData.profilePictureUrl || userData.avatar,
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`
  );
  const now = Date.now();
  const mappedLevel = targetTier >= 3 ? 4 : (targetTier === 2 ? 2 : 1);

  const existingBed = findBedByUser(uniqueId);
  if (existingBed) {
    if (mappedLevel > existingBed.level) existingBed.level = mappedLevel;
    existingBed.user.points = (existingBed.user.points || 0) + initialPoints;
    if (coins > 0) {
      existingBed.user.coins = (existingBed.user.coins || 0) + coins;
      if (existingBed.user.coins >= 10 && existingBed.level < 4) existingBed.level = 4;
    }
    existingBed.user.lastActive = now;
    return { success: true, bed: existingBed, type: 'on_bed' };
  }

  let targetBed = findEmptyBed();
  if (targetBed) {
    targetBed.level = mappedLevel;
    targetBed.user = {
      uniqueId,
      nickname,
      avatar,
      points: initialPoints,
      coins: coins || 0,
      hasWarmBlanket: false,
      blanketUntil: 0,
      joinedAt: now,
      lastActive: now,
      goodnightCount: 0
    };
    streamStats.uniqueSleepers.add(uniqueId);
    return { success: true, bed: targetBed, type: 'new_bed' };
  }

  // 3. ĐÃ KÍN 20 GIƯỜNG: TÍNH ĐIỂM AI ÍT SAO HƠN THÌ BỊ ĐÁ
  let lowestBed = null;
  let minStars = Infinity;
  for (const b of beds) {
    const bPoints = (b.user && Number(b.user.points)) || 0;
    if (b.user && bPoints < minStars) {
      minStars = bPoints;
      lowestBed = b;
    }
  }

  // Nếu người mới có nhiều sao hơn người ít sao nhất: Người ít sao hơn bị đá thế chỗ
  if (lowestBed && initialPoints > minStars) {
    const replacedUser = lowestBed.user;
    lowestBed.level = mappedLevel;
    lowestBed.user = {
      uniqueId,
      nickname,
      avatar,
      points: initialPoints,
      coins: coins || 0,
      hasWarmBlanket: false,
      blanketUntil: 0,
      joinedAt: now,
      lastActive: now,
      goodnightCount: 0
    };
    streamStats.uniqueSleepers.add(uniqueId);
    return { success: true, bed: lowestBed, replacedUser, minStars, type: 'kicked_bed' };
  }

  // Nếu người mới không đủ sao để thế chỗ: Không đá ai cả
  return { success: false, bed: null, minStars, type: 'full_room' };
}

/**
 * Xử lý sự kiện Chúc Ngủ Ngon trọng tâm
 * (KHÔNG BAO GIỜ đá người khác khỏi giường khi chúc ngủ ngon)
 */
function handleGoodnightEvent(userData, rawComment) {
  streamStats.goodnightCount++;
  const uniqueId = cleanSafeString(userData.uniqueId || userData.userId, 'user_' + Date.now());
  const nickname = cleanSafeString(userData.nickname || userData.uniqueId, 'Bạn Xem');
  const avatar = cleanSafeString(userData.profilePictureUrl, `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uniqueId)}`);

  const existingBed = findBedByUser(uniqueId);
  const now = Date.now();

  let eventResult = null;

  if (existingBed) {
    // TRƯỜNG HỢP 1: NGƯỜI CHÚC ĐANG NẰM TRÊN GIƯỜNG -> Cộng điểm & đắp chăn ấm
    existingBed.user.points += gameConfig.goodnightBonusPoints;
    existingBed.user.hasWarmBlanket = true;
    existingBed.user.blanketUntil = now + gameConfig.blanketDurationMs;
    existingBed.user.lastActive = now;
    existingBed.user.goodnightCount = (existingBed.user.goodnightCount || 0) + 1;

    eventResult = {
      type: 'on_bed',
      bedId: existingBed.id,
      user: existingBed.user,
      comment: rawComment,
      addedPoints: gameConfig.goodnightBonusPoints,
      message: `🌙 ${nickname} đã chúc ngủ ngon và được đắp chăn ấm (+${gameConfig.goodnightBonusPoints} điểm)!`
    };
  } else {
    // TRƯỜNG HỢP 2: NGƯỜI CHÚC CHƯA CÓ GIƯỜNG -> Tính điểm sao: ai ít sao hơn thì bị đá
    const wishPoints = gameConfig.initialPoints + gameConfig.goodnightBonusPoints;
    const res = assignServerBed({
      uniqueId,
      nickname,
      profilePictureUrl: avatar
    }, 1, wishPoints, 0);

    if (res.success && res.bed) {
      res.bed.user.hasWarmBlanket = true;
      res.bed.user.blanketUntil = now + gameConfig.blanketDurationMs;
      res.bed.user.goodnightCount = 1;

      if (res.type === 'kicked_bed') {
        eventResult = {
          type: 'kicked_bed',
          bedId: res.bed.id,
          user: res.bed.user,
          replacedUser: res.replacedUser,
          comment: rawComment,
          message: `⚡ ${nickname} (${wishPoints}⭐) đã thế chỗ ${res.replacedUser?.nickname} (${res.minStars}⭐ ít sao nhất) nhận Giường #${res.bed.id}!`
        };
      } else {
        eventResult = {
          type: 'new_bed',
          bedId: res.bed.id,
          user: res.bed.user,
          comment: rawComment,
          message: `🌙 ${nickname} đã gửi lời chúc ngủ ngon và lên Giường #${res.bed.id}!`
        };
      }
    } else {
      eventResult = {
        type: 'full_room',
        bedId: null,
        user: { uniqueId, nickname, avatar, points: wishPoints },
        comment: rawComment,
        minStars: res.minStars,
        message: `🌙 ${nickname} (${wishPoints}⭐) gửi lời chúc ngủ ngon tới cả phòng!`
      };
    }
  }

  // Phát tín hiệu sự kiện Chúc Ngủ Ngon tới tất cả client (Overlay + Dashboard)
  if (eventResult) {
    let cleanWish = (rawComment || 'chúc cả phòng ngủ ngon').replace(/\[[a-zA-Z0-9_]{1,30}\]/g, ' ').replace(/[🌙✨💤⭐❤️👑👋🔥⚡\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanWish.length > 70) cleanWish = cleanWish.substring(0, 70) + '...';
    const spokenName = formatNameForSpeech(nickname);
    const speechText = `Cảm ơn ${spokenName} đã chúc: ${cleanWish}!`;

    io.emit('goodnight_trigger', {
      ...eventResult,
      ttsText: speechText,
      beds: beds,
      stats: {
        goodnightCount: streamStats.goodnightCount,
        occupiedBeds: beds.filter(b => b.user).length
      }
    });

    // Phát sự kiện cập nhật giường tới cả Overlay và Admin
    io.emit('beds_update', beds);

    console.log(`[CHÚC NGỦ NGON] ${nickname}: "${rawComment}" -> Giường #${eventResult.bedId} (${eventResult.type})`);
  }

  return eventResult;
}

/**
 * Xử lý bình luận Chat thông thường
 */
function handleGeneralChat(userData, comment) {
  streamStats.totalChats++;
  const uniqueId = cleanSafeString(userData.uniqueId || userData.userId, 'user_' + Date.now());
  const nickname = cleanSafeString(userData.nickname, 'Khách Xem');
  let safeComment = cleanSafeString(comment, '💬');
  if (!safeComment) safeComment = '💬';

  // Kiểm tra nếu là lời chúc ngủ ngon
  if (isGoodnightMessage(safeComment)) {
    return handleGoodnightEvent(userData, safeComment);
  }

  // Nếu là chat thường
  let bed = findBedByUser(uniqueId);
  if (bed) {
    bed.user.points += gameConfig.chatBonusPoints;
    bed.user.lastActive = Date.now();
  } else {
    // Nếu chưa có giường: Thử xếp giường theo điểm sao (ai ít sao hơn thì bị đá)
    const res = assignServerBed({
      uniqueId,
      nickname,
      profilePictureUrl: userData.profilePictureUrl
    }, 1, gameConfig.initialPoints, 0);

    if (res.success && res.bed) {
      bed = res.bed;
      if (res.type === 'kicked_bed') {
        console.log(`[THẾ CHỖ] ${nickname} (${gameConfig.initialPoints}⭐) thế chỗ ${res.replacedUser?.nickname} (${res.minStars}⭐ ít sao nhất) tại Giường #${bed.id}`);
      } else {
        console.log(`[VÀO GIƯỜNG] ${nickname} vừa bình luận -> Nhận Giường #${bed.id}`);
      }
    }
  }

  // Bắn tin nhắn chat lên Overlay
  io.emit('chat_message', {
    uniqueId,
    nickname,
    avatar: userData.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uniqueId)}`,
    comment: safeComment,
    bedId: bed ? bed.id : null,
    isGoodnight: false
  });

  // Cập nhật trạng thái giường tới toàn bộ client
  if (bed) {
    io.emit('beds_update', beds);
  }
}

/**
 * Xử lý Tặng Quà TikTok / Gift Test
 */
function handleGiftEvent(userData, giftData) {
  streamStats.totalGifts++;
  const uniqueId = userData.uniqueId || userData.userId;
  const nickname = userData.nickname || 'Bạn Xem';
  const diamonds = Number(giftData.diamondCount || giftData.diamonds) || 1;
  const giftName = giftData.giftName || 'Món Quà';
  const repeatCount = Number(giftData.repeatCount || giftData.count) || 1;
  const totalDiamonds = diamonds * repeatCount;

  const isRose = giftName.toLowerCase().includes('bông') || giftName.toLowerCase().includes('hoa hồng') || giftName.toLowerCase().includes('rose');
  const targetTier = isRose ? (totalDiamonds >= 10 ? 3 : 2) : 3;
  const addedPoints = isRose ? (40 + totalDiamonds * 5) : (80 + totalDiamonds * 2);

  const res = assignServerBed({
    uniqueId,
    nickname,
    profilePictureUrl: userData.profilePictureUrl
  }, targetTier, addedPoints, totalDiamonds);

  const bed = res.bed;

  io.emit('gift_event', {
    uniqueId,
    nickname,
    giftName,
    count: repeatCount,
    diamonds: totalDiamonds,
    bedId: bed ? bed.id : null,
    level: bed ? bed.level : null
  });

  io.emit('beds_update', beds);
}

// ==========================================
// VÒNG LẶP TRỪ ĐIỂM SAO THEO THỜI GIAN (DECAY TICK)
// Điểm sao giảm dần theo thời gian nếu không tương tác, THẤP NHẤT DỪNG Ở 40 (không bao giờ dưới 40)
// ==========================================
function runDecayTick() {
  if (!gameConfig.decayEnabled) return;

  const now = Date.now();
  let changed = false;

  beds.forEach(bed => {
    if (bed.user) {
      // 1. Kiểm tra hết hạn chăn ấm lấp lánh
      if (bed.user.hasWarmBlanket && bed.user.blanketUntil && now > bed.user.blanketUntil) {
        bed.user.hasWarmBlanket = false;
        changed = true;
      }

      // 2. Trừ điểm sao theo thời gian: thấp nhất dừng ở 40 sao (không bao giờ trừ dưới 40)
      const currentPts = bed.user.points || 0;
      const minFloor = gameConfig.minPointsFloor !== undefined ? gameConfig.minPointsFloor : 40;

      if (currentPts > minFloor) {
        bed.user.points = Math.max(minFloor, currentPts - gameConfig.decayPoints);
        changed = true;
      }
    }
  });

  if (changed) {
    io.emit('beds_update', beds);
  }
}

let decayTimer = setInterval(runDecayTick, gameConfig.decayIntervalMs);

// ==========================================
// TÍCH HỢP TIKTOK LIVE CONNECTOR
// ==========================================
let tiktokConnection = null;
let currentTikTokUsername = '';
let tiktokStatus = 'DISCONNECTED'; // CONNECTING, CONNECTED, DISCONNECTED, ERROR

function connectToTikTok(rawUsername) {
  if (!WebcastPushConnection) {
    throw new Error('tiktok-live-connector chưa được khởi tạo');
  }

  const username = cleanSafeString(rawUsername ? String(rawUsername).replace(/^@/, '').trim() : '', '');
  if (!username) {
    const errMsg = 'Vui lòng nhập Username TikTok hợp lệ!';
    console.warn(`[TikTok LIVE] ${errMsg}`);
    tiktokStatus = 'ERROR';
    io.emit('tiktok_status', { status: 'ERROR', username: '', error: errMsg });
    return;
  }

  if (tiktokConnection) {
    try {
      tiktokConnection.removeAllListeners();
      tiktokConnection.disconnect();
    } catch (e) {}
    tiktokConnection = null;
  }

  currentTikTokUsername = username;
  tiktokStatus = 'CONNECTING';
  io.emit('tiktok_status', { status: tiktokStatus, username: currentTikTokUsername });

  tiktokConnection = new WebcastPushConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: false, // Tắt gói mở rộng của EulerStream để không bị đòi hỏi gói trả phí Business
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 1000
  });

  // Bắt lỗi kết nối để không làm sập Node.js
  tiktokConnection.on('error', err => {
    console.warn(`[TikTok LIVE Warning]`, err?.message || err);
  });

  tiktokConnection.on('streamEnd', () => {
    tiktokStatus = 'DISCONNECTED';
    console.log(`[TikTok LIVE] Buổi phát trực tiếp của @${username} đã kết thúc`);
    io.emit('tiktok_status', { status: 'DISCONNECTED', username: currentTikTokUsername, reason: 'STREAM_ENDED' });
  });

  tiktokConnection.connect().then(state => {
    tiktokStatus = 'CONNECTED';
    streamStartTime = Date.now();
    console.log(`[TikTok LIVE] Đã kết nối thành công phòng Live của @${username} (RoomID: ${state.roomId})`);
    io.emit('tiktok_status', { status: tiktokStatus, username: currentTikTokUsername, roomId: state.roomId });
    io.emit('timer_reset', { streamStartTime });
  }).catch(err => {
    tiktokStatus = 'ERROR';
    console.error(`[TikTok LIVE] Lỗi kết nối tới @${username}:`, err?.message || err);
    io.emit('tiktok_status', { status: tiktokStatus, username: currentTikTokUsername, error: err?.message || 'Không thể kết nối' });
  });

  // Lắng nghe sự kiện Chat từ TikTok LIVE
  tiktokConnection.on('chat', data => {
    if (!data) return;
    const user = data.user || {};
    let comment = cleanSafeString(data.content || data.comment, '');

    // Nếu người dùng gửi icon/emote TikTok (comment rỗng nhưng có emotes)
    const emoteList = data.emotes || data.emoteList || [];
    const emoteUrl = (emoteList[0] && (emoteList[0].emoteImageUrl || emoteList[0].emote?.image?.imageUrl)) || (data.emoteList && data.emoteList[0]?.image?.urlList?.[0]);
    if (!comment && emoteUrl) {
      comment = emoteUrl;
    } else if (!comment && emoteList[0]?.emoteId) {
      comment = '✨';
    } else if (!comment) {
      comment = '💬';
    }

    const userId = cleanSafeString(user.id || data.userId, 'u_' + Date.now());
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId, userId);
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId === userId ? 'Khách Xem' : uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;

    console.log(`[TIKTOK LIVE CHAT] ${nickname} (@${uniqueId}): "${comment}"`);

    handleGeneralChat({
      userId,
      uniqueId,
      nickname,
      profilePictureUrl: avatar
    }, comment);
  });

  // Lắng nghe sự kiện Gửi Icon/Emote (Sticker) từ TikTok LIVE
  tiktokConnection.on('emote', data => {
    if (!data) return;
    const user = data.user || {};
    const userId = cleanSafeString(user.id || data.userId, 'u_' + Date.now());
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId, userId);
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId === userId ? 'Khách Xem' : uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;

    const emoteList = data.emotes || data.emoteList || [];
    const emoteUrl = (emoteList[0] && (emoteList[0].emoteImageUrl || emoteList[0].image?.urlList?.[0])) || '';
    const comment = emoteUrl || '🥰';

    console.log(`[TIKTOK LIVE ICON/EMOTE] ${nickname} (@${uniqueId}) gửi biểu tượng: "${comment}"`);

    handleGeneralChat({
      userId,
      uniqueId,
      nickname,
      profilePictureUrl: avatar
    }, comment);
  });

  // Lắng nghe sự kiện Quà tặng (Gift)
  tiktokConnection.on('gift', data => {
    if (!data) return;
    const user = data.user || {};
    const userId = cleanSafeString(user.id || data.userId, 'u_' + Date.now());
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId, userId);
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId === userId ? 'Bạn Xem' : uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;

    const giftName = cleanSafeString(data.giftName || data.giftDetails?.giftName || data.describe, 'Món Quà');
    const diamondCount = Number(data.diamondCount || data.giftDetails?.diamondCount || (data.gift && data.gift.diamond_count)) || 1;
    const repeatCount = Number(data.repeatCount || data.comboCount) || 1;

    console.log(`[TIKTOK LIVE GIFT] ${nickname}: ${giftName} x${repeatCount} (${diamondCount} xu)`);

    handleGiftEvent({
      userId,
      uniqueId,
      nickname,
      profilePictureUrl: avatar
    }, {
      giftName,
      diamondCount,
      repeatCount
    });
  });

  // Khi có người tham gia phòng Live
  tiktokConnection.on('member', data => {
    if (!data) return;
    const user = data.user || {};
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId || user.id, 'viewer');
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;
    io.emit('viewer_join', {
      nickname,
      uniqueId,
      avatar
    });
  });

  // Lắng nghe sự kiện Like (Thả tim)
  tiktokConnection.on('like', data => {
    if (!data) return;
    const user = data.user || {};
    const userId = cleanSafeString(user.id || data.userId, 'u_' + Date.now());
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId, userId);
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId === userId ? 'Khách Thả Tim' : uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;
    const likeCount = Number(data.likeCount || data.count) || 1;

    console.log(`[TIKTOK LIVE LIKE] ${nickname} thả tim (+${likeCount})`);

    assignServerBed({ uniqueId, nickname, profilePictureUrl: avatar }, 1, 20, 0);
    io.emit('like_event', {
      userId,
      uniqueId,
      nickname,
      profilePictureUrl: avatar,
      likeCount
    });
    io.emit('beds_update', beds);
  });

  // Lắng nghe sự kiện Follow (Follow chủ phòng)
  tiktokConnection.on('follow', data => {
    if (!data) return;
    const user = data.user || {};
    const userId = cleanSafeString(user.id || data.userId, 'u_' + Date.now());
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId, userId);
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId === userId ? 'Fan Mới' : uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;

    console.log(`[TIKTOK LIVE FOLLOW] ${nickname} đã bấm follow`);

    assignServerBed({ uniqueId, nickname, profilePictureUrl: avatar }, 2, 45, 0);
    io.emit('follow_event', {
      userId,
      uniqueId,
      nickname,
      profilePictureUrl: avatar
    });
    io.emit('beds_update', beds);
  });

  // Lắng nghe sự kiện Chia Sẻ Live (Share stream)
  tiktokConnection.on('share', data => {
    if (!data) return;
    const user = data.user || {};
    const userId = cleanSafeString(user.id || data.userId, 'u_' + Date.now());
    const uniqueId = cleanSafeString(user.displayId || user.uniqueId || data.uniqueId, userId);
    const nickname = cleanSafeString(user.nickname || data.nickname, uniqueId === userId ? 'Người Chia Sẻ' : uniqueId);
    const avatar = (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList[0]) || data.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;

    console.log(`[TIKTOK LIVE SHARE] ${nickname} đã chia sẻ live`);

    assignServerBed({ uniqueId, nickname, profilePictureUrl: avatar }, 1, 35, 0);
    io.emit('share_event', {
      userId,
      uniqueId,
      nickname,
      profilePictureUrl: avatar
    });
    io.emit('beds_update', beds);
  });

  // Khi ngắt kết nối
  tiktokConnection.on('disconnected', () => {
    tiktokStatus = 'DISCONNECTED';
    console.log(`[TikTok LIVE] Đã ngắt kết nối với @${username}`);
    io.emit('tiktok_status', { status: tiktokStatus, username: currentTikTokUsername });
  });
}

function disconnectTikTok() {
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {}
    tiktokConnection = null;
  }
  tiktokStatus = 'DISCONNECTED';
  currentTikTokUsername = '';
  io.emit('tiktok_status', { status: tiktokStatus, username: '' });
}

// ==========================================
// API ROUTES
// ==========================================

// Lấy toàn bộ trạng thái hiện tại
app.get('/api/state', (req, res) => {
  res.json({
    beds,
    config: gameConfig,
    stats: {
      goodnightCount: streamStats.goodnightCount,
      totalChats: streamStats.totalChats,
      totalGifts: streamStats.totalGifts,
      occupiedBeds: beds.filter(b => b.user).length
    },
    tiktok: {
      status: tiktokStatus,
      username: currentTikTokUsername
    }
  });
});

// Giả lập sự kiện Chúc Ngủ Ngon (Test Feature)
app.post('/api/test/goodnight', (req, res) => {
  const { nickname, comment, isOnBed, bedId } = req.body;
  const testName = nickname || 'Bạn Mèo Mơ Màng';
  const testComment = comment || 'chúc cả phòng ngủ ngon nhé 🌙';
  let targetUniqueId = 'test_' + encodeURIComponent(testName);

  // Nếu muốn ép test trường hợp ĐANG NẰM TRÊN GIƯỜNG
  if (isOnBed) {
    let bed = findBedByUser(targetUniqueId);
    if (!bed) {
      // Chỉ đặt vào giường trống hoặc giường chỉ định nếu đang trống (KHÔNG đè lên giường người khác)
      const requestedBed = bedId ? beds.find(b => b.id === parseInt(bedId) && !b.user) : null;
      bed = requestedBed || findEmptyBed();
      if (bed) {
        bed.level = 1;
        bed.user = {
          uniqueId: targetUniqueId,
          nickname: testName,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`,
          points: 40,
          coins: 0,
          hasWarmBlanket: false,
          blanketUntil: 0,
          joinedAt: Date.now(),
          lastActive: Date.now(),
          goodnightCount: 0
        };
      }
    }
  } else if (isOnBed === false) {
    // Nếu muốn test CHƯA CÓ GIƯỜNG, xóa người này khỏi giường nếu có
    const existing = findBedByUser(targetUniqueId);
    if (existing) {
      existing.user = null;
    }
    // Dùng id ngẫu nhiên mới để chắc chắn chưa có giường
    targetUniqueId = 'test_new_' + Date.now();
  }

  const result = handleGoodnightEvent({
    uniqueId: targetUniqueId,
    nickname: testName,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`
  }, testComment);

  res.json({ success: true, result });
});

// Giả lập Chat bình thường
app.post('/api/test/chat', (req, res) => {
  const { nickname, comment } = req.body;
  const testName = nickname || 'Khách Thức Đêm';
  const testComment = comment || 'Phòng hôm nay đông vui quá!';

  handleGeneralChat({
    uniqueId: 'test_' + encodeURIComponent(testName),
    nickname: testName,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`
  }, testComment);

  res.json({ success: true });
});

// Giả lập Thả Tim (Like)
app.post('/api/test/like', (req, res) => {
  const { nickname, likeCount } = req.body;
  const testName = nickname || 'Bạn Yêu Ký Túc Xá';
  const data = {
    uniqueId: 'test_' + encodeURIComponent(testName),
    nickname: testName,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`,
    likeCount: parseInt(likeCount) || 5
  };
  assignServerBed(data, 1, 20, 0);
  io.emit('like_event', data);
  io.emit('beds_update', beds);
  res.json({ success: true, data });
});

// Giả lập Follow (Theo dõi)
app.post('/api/test/follow', (req, res) => {
  const { nickname } = req.body;
  const testName = nickname || 'Fan Cứng Đêm Khuya';
  const data = {
    uniqueId: 'test_' + encodeURIComponent(testName),
    nickname: testName,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`
  };
  assignServerBed(data, 2, 45, 0);
  io.emit('follow_event', data);
  io.emit('beds_update', beds);
  res.json({ success: true, data });
});

// Giả lập Chia Sẻ Live (Share)
app.post('/api/test/share', (req, res) => {
  const { nickname } = req.body;
  const testName = nickname || 'Bạn Tốt Bụng';
  const data = {
    uniqueId: 'test_' + encodeURIComponent(testName),
    nickname: testName,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`
  };
  assignServerBed(data, 1, 35, 0);
  io.emit('share_event', data);
  io.emit('beds_update', beds);
  res.json({ success: true, data });
});

// Giả lập Người Mới Vào Phòng
app.post('/api/test/join', (req, res) => {
  const { nickname, avatar } = req.body;
  const testName = nickname || 'Khách Mới Vào';
  const data = {
    uniqueId: 'test_' + encodeURIComponent(testName),
    nickname: testName,
    avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`
  };
  io.emit('viewer_join', data);
  res.json({ success: true, data });
});

// Giả lập Tặng Quà
app.post('/api/test/gift', (req, res) => {
  const { nickname, giftName, diamonds, count } = req.body;
  const testName = nickname || 'Đại Gia Phố Ngủ';

  handleGiftEvent({
    uniqueId: 'test_' + encodeURIComponent(testName),
    nickname: testName,
    profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(testName)}`
  }, {
    giftName: giftName || 'Hoa Hồng',
    diamonds: parseInt(diamonds) || 1,
    count: parseInt(count) || 1
  });

  res.json({ success: true });
});

// Cập nhật cấu hình game
app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  Object.assign(gameConfig, newConfig);
  io.emit('config_update', gameConfig);
  res.json({ success: true, config: gameConfig });
});

// Kích hoạt một chu kỳ trừ điểm sao (Test Decay Tick)
app.post('/api/test/decay_tick', (req, res) => {
  runDecayTick();
  res.json({ success: true, beds });
});

// Reset toàn bộ 20 giường & thời lượng livestream
app.post('/api/bed/reset', (req, res) => {
  initBeds();
  streamStartTime = Date.now();
  streamStats.goodnightCount = 0;
  streamStats.totalChats = 0;
  streamStats.totalGifts = 0;
  streamStats.uniqueSleepers.clear();
  io.emit('beds_update', beds);
  io.emit('beds_reset');
  io.emit('timer_reset', { streamStartTime });
  res.json({ success: true, streamStartTime, message: 'Đã reset toàn bộ 20 giường và giờ livestream về 00:00:00' });
});

// Reset riêng giờ livestream về 00:00:00
app.post('/api/timer/reset', (req, res) => {
  streamStartTime = Date.now();
  io.emit('timer_reset', { streamStartTime });
  res.json({ success: true, streamStartTime, message: 'Đã reset giờ livestream về 00:00:00' });
});

// Cho một người rời giường (Kick)
app.post('/api/bed/kick', (req, res) => {
  const { bedId } = req.body;
  const bed = beds.find(b => b.id === parseInt(bedId));
  if (bed && bed.user) {
    const name = bed.user.nickname;
    bed.user = null;
    bed.level = 1;
    io.emit('beds_update', beds);
    io.emit('user_expelled', { bedId: bed.id, nickname: name, message: `Quản lý đã dọn giường #${bed.id}` });
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Không tìm thấy giường hoặc giường đang trống' });
});

// Kích hoạt Mục tiêu 25 lời chúc / Mưa sao băng từ Host
app.post('/api/test/trigger_goal', (req, res) => {
  streamStats.goodnightCount = 25;
  io.emit('admin_trigger_goal');
  res.json({ success: true, message: 'Đã kích hoạt Mưa Sao Băng 25 Lời Chúc' });
});

// Điều khiển kết nối TikTok Live
app.post('/api/tiktok/connect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Thiếu username TikTok' });
  try {
    connectToTikTok(username);
    res.json({ success: true, message: `Đang kết nối tới @${username}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tiktok/disconnect', (req, res) => {
  disconnectTikTok();
  res.json({ success: true, message: 'Đã ngắt kết nối TikTok' });
});

// Lệnh Reload Overlay
app.get('/api/reload', (req, res) => {
  io.emit('reload_overlay');
  res.send('Đã gửi lệnh làm mới màn hình Overlay');
});

// Hàm chia nhỏ đoạn văn bản thành các câu <= 170 ký tự để Google Translate TTS luôn thành công (không bị lỗi 400)
function splitTextIntoTTSChunks(text, maxLen = 170) {
  if (!text) return [];
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.split(/([.,!?;\n]+)/);
  const chunks = [];
  let current = '';

  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if ((current + part).length <= maxLen) {
      current += part;
    } else {
      if (current.trim()) chunks.push(current.trim());
      if (part.length <= maxLen) {
        current = part;
      } else {
        const words = part.split(' ');
        let wordChunk = '';
        for (const w of words) {
          if ((wordChunk + ' ' + w).length <= maxLen) {
            wordChunk += (wordChunk ? ' ' : '') + w;
          } else {
            if (wordChunk.trim()) chunks.push(wordChunk.trim());
            wordChunk = w;
          }
        }
        current = wordChunk;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [clean.substring(0, maxLen)];
}

function fetchGoogleTTSBuffer(chunk) {
  return new Promise((resolve) => {
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`;
    https.get(googleTtsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, res => {
      if (res.statusCode !== 200) {
        return resolve(Buffer.alloc(0));
      }
      const data = [];
      res.on('data', d => data.push(d));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', () => {
      resolve(Buffer.alloc(0));
    });
  });
}

// API Google TTS Tự Động Chia Khối (Hỗ trợ phát âm tiếng Việt chuẩn, không bao giờ lỗi giới hạn ký tự)
app.get('/api/tts', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Missing text');

  try {
    const chunks = splitTextIntoTTSChunks(text, 170);
    const audioBuffers = [];
    for (const chunk of chunks) {
      const buf = await fetchGoogleTTSBuffer(chunk);
      if (buf && buf.length > 0) audioBuffers.push(buf);
    }

    if (audioBuffers.length === 0) {
      return res.status(500).send('TTS Audio unavailable');
    }

    const combined = Buffer.concat(audioBuffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', combined.length);
    res.send(combined);
  } catch (err) {
    res.status(500).send('TTS Error: ' + err.message);
  }
});

// ==========================================
// SOCKET.IO REALTIME
// ==========================================
io.on('connection', socket => {
  // Gửi trạng thái ban đầu ngay khi client kết nối
  socket.emit('init_state', {
    beds,
    config: gameConfig,
    streamStartTime: streamStartTime,
    stats: {
      goodnightCount: streamStats.goodnightCount,
      totalChats: streamStats.totalChats,
      totalGifts: streamStats.totalGifts,
      occupiedBeds: beds.filter(b => b.user).length
    },
    tiktok: {
      status: tiktokStatus,
      username: currentTikTokUsername
    }
  });

  // Client gửi yêu cầu test Chúc Ngủ Ngon
  socket.on('client_test_goodnight', data => {
    handleGoodnightEvent({
      uniqueId: data.uniqueId || 'test_' + (data.nickname || 'Tester'),
      nickname: data.nickname || 'Bạn Ngủ Ngon',
      profilePictureUrl: data.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.nickname || 'Tester')}`
    }, data.comment || 'Chúc cả phòng ngủ ngon');
  });

  // Cập nhật cấu hình từ bảng điều khiển
  socket.on('client_update_config', newCfg => {
    Object.assign(gameConfig, newCfg);
    io.emit('config_update', gameConfig);
  });

  // Relay các sự kiện tương tác từ Bảng điều khiển tới Overlay
  socket.on('like_event', data => {
    if (data) assignServerBed(data, 1, 20, 0);
    io.emit('like_event', data);
    io.emit('beds_update', beds);
  });

  socket.on('follow_event', data => {
    if (data) assignServerBed(data, 2, 45, 0);
    io.emit('follow_event', data);
    io.emit('beds_update', beds);
  });

  socket.on('share_event', data => {
    if (data) assignServerBed(data, 1, 35, 0);
    io.emit('share_event', data);
    io.emit('beds_update', beds);
  });

  socket.on('viewer_join', data => {
    io.emit('viewer_join', data);
  });

  socket.on('admin_trigger_goal', () => {
    streamStats.goodnightCount = 25;
    io.emit('admin_trigger_goal');
  });
});

// Điều hướng trang Admin và Overlay
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Khởi động server
server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🌙 KÝ TÚC XÁ 20 GIƯỜNG NGỦ - TIKTOK LIVE GAME ĐANG CHẠY`);
  console.log(`- Màn hình Stream 9:16 (OBS / TikTok Studio): http://127.0.0.1:${PORT}/overlay.html (hoặc http://127.0.0.1:${PORT}/)`);
  console.log(`- Bảng Điều Khiển Host (Dành riêng Streamer): http://127.0.0.1:${PORT}/admin.html (hoặc http://127.0.0.1:${PORT}/admin)`);
  console.log('========================================================');
});

