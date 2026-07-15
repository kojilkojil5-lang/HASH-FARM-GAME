// HASH FARM - 실시간 접속자 표시 서버
// Node.js + Express + Socket.io
// Render.com 같은 Node 호스팅에 배포해서 사용합니다.

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();

// ---------- CORS 설정 ----------
// GitHub Pages 등 프론트엔드가 올라간 도메인만 허용하세요.
// 여러 개 넣고 싶으면 배열에 추가하면 됩니다. (예: 로컬 테스트용 주소도 같이)
const ALLOWED_ORIGINS = [
  'https://kojilkojil5-lang.github.io',
  'http://localhost:5500',   // 로컬에서 index.html을 Live Server 등으로 테스트할 때
  'http://127.0.0.1:5500',
];

app.use(cors({ origin: ALLOWED_ORIGINS }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// ---------- 상태 관리 ----------
// socket.id -> { id, nickname, icon, connectedAt, lastMsgTime }
const users = new Map();
// 최근 채팅 메시지 (새로 접속한 사람에게 보여주기 위함)
const CHAT_HISTORY_LIMIT = 50;
const chatHistory = [];
const CHAT_MIN_INTERVAL_MS = 1500; // 도배 방지: 메시지 사이 최소 간격
const CHAT_MAX_LENGTH = 200;

function broadcastUserList() {
  const list = Array.from(users.values()).map(u => ({
    id: u.id,
    nickname: u.nickname,
    icon: u.icon,
  }));
  io.emit('user_update', {
    count: list.length,
    users: list,
  });
}

io.on('connection', (socket) => {
  // 접속 시 기본 프로필 부여 (익명 채굴러 + 짧은 ID, 기본 아이콘)
  const defaultNickname = `채굴러-${socket.id.slice(0, 4)}`;
  users.set(socket.id, {
    id: socket.id,
    nickname: defaultNickname,
    icon: '👶',
    connectedAt: Date.now(),
  });

  console.log(`[접속] ${socket.id} (현재 ${users.size}명)`);
  broadcastUserList();
  socket.emit('chat_history', chatHistory);

  // 클라이언트가 프로필(닉네임+아이콘)을 알려주면 갱신
  socket.on('update_profile', (profile) => {
    const user = users.get(socket.id);
    if (!user || !profile || typeof profile !== 'object') return;
    if (typeof profile.nickname === 'string' && profile.nickname.trim()) {
      user.nickname = profile.nickname.trim().slice(0, 16);
    }
    if (typeof profile.icon === 'string' && profile.icon.length <= 4) {
      user.icon = profile.icon;
    }
    broadcastUserList();
  });

  // 이전 버전 클라이언트 호환용 (닉네임만 보내는 경우)
  socket.on('set_nickname', (nickname) => {
    const user = users.get(socket.id);
    if (user && typeof nickname === 'string' && nickname.trim()) {
      user.nickname = nickname.trim().slice(0, 16);
      broadcastUserList();
    }
  });

  // 채팅 메시지 수신
  socket.on('chat_message', (payload) => {
    const user = users.get(socket.id);
    if (!user || !payload || typeof payload.text !== 'string') return;

    const now = Date.now();
    if (user.lastMsgTime && now - user.lastMsgTime < CHAT_MIN_INTERVAL_MS) {
      return; // 도배 방지: 너무 빠른 연속 전송은 무시
    }
    const text = payload.text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    user.lastMsgTime = now;

    const msg = {
      nickname: user.nickname,
      icon: user.icon,
      text,
      ts: now,
    };
    chatHistory.push(msg);
    if (chatHistory.length > CHAT_HISTORY_LIMIT) chatHistory.shift();
    io.emit('chat_message', msg);
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    console.log(`[퇴장] ${socket.id} (현재 ${users.size}명)`);
    broadcastUserList();
  });
});

// 헬스체크용 기본 라우트 (Render가 서버 상태 확인할 때도 사용됨)
app.get('/', (req, res) => {
  res.send(`HASH FARM realtime server is running. Connected: ${users.size}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: 포트 ${PORT}`);
});
