const http = require("http");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const ROOM_IDLE_TIMEOUT_MS = Number(process.env.ROOM_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 60 * 1000);

const rooms = new Map();
const sockets = new Map();

const suits = ["s", "h", "d", "c"];
const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? roomCode() : code;
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room) {
  room.players.forEach((player) => {
    const ws = sockets.get(player.id);
    if (ws) send(ws, { type: "state", state: publicRoom(room, player.id) });
  });
}

function touchRoom(room) {
  room.lastActivityAt = Date.now();
}

function closeRoom(room, reason) {
  room.players.forEach((player) => {
    const ws = sockets.get(player.id);
    if (!ws) return;
    send(ws, { type: "roomClosed", message: reason });
    ws.close(1000, "Room closed");
    sockets.delete(player.id);
  });
  rooms.delete(room.code);
}

function cleanupInactiveRooms() {
  const now = Date.now();
  rooms.forEach((room) => {
    if (now - room.lastActivityAt >= ROOM_IDLE_TIMEOUT_MS) {
      closeRoom(room, "長時間操作されていないため、部屋を閉じました。");
    }
  });
}

function publicRoom(room, viewerId) {
  const viewer = room.players.find((player) => player.id === viewerId);
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    viewerId,
    message: room.message,
    game: room.game
      ? {
          phase: room.game.phase,
          pot: room.game.pot,
          currentBet: room.game.currentBet,
          dealerIndex: room.game.dealerIndex,
          turnPlayerId: room.game.turnPlayerId,
          community: room.game.community,
          winners: room.game.winners,
          lastAction: room.game.lastAction,
          minRaise: room.game.minRaise,
          canStartNext: room.game.phase === "showdown" && room.hostId === viewerId,
        }
      : null,
    me: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          chips: viewer.chips,
          hand: viewer.hand,
          folded: viewer.folded,
          currentBet: viewer.currentBet,
          connected: viewer.connected,
        }
      : null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      chips: player.chips,
      folded: player.folded,
      currentBet: player.currentBet,
      connected: player.connected,
      isHost: player.id === room.hostId,
      cardCount: player.hand.length,
      hand: room.game?.phase === "showdown" || player.id === viewerId ? player.hand : [],
    })),
  };
}

function createPlayer(name) {
  return {
    id: id(),
    name: String(name || "Player").slice(0, 18),
    chips: 1000,
    hand: [],
    folded: false,
    currentBet: 0,
    acted: false,
    connected: true,
  };
}

function createDeck() {
  const deck = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function activePlayers(room) {
  return room.players.filter((player) => player.chips > 0 || player.hand.length > 0);
}

function bettingPlayers(room) {
  return room.players.filter((player) => !player.folded && player.hand.length && player.chips > 0);
}

function canActInBettingRound(player) {
  return !player.folded && player.hand.length && player.chips > 0;
}

function nextIndex(room, fromIndex, predicate) {
  for (let step = 1; step <= room.players.length; step += 1) {
    const index = (fromIndex + step) % room.players.length;
    if (predicate(room.players[index])) return index;
  }
  return -1;
}

function firstToActAfterDealerIndex(room) {
  return nextIndex(room, room.game.dealerIndex, canActInBettingRound);
}

function postBlind(player, amount, game) {
  const paid = Math.min(player.chips, amount);
  player.chips -= paid;
  player.currentBet += paid;
  game.pot += paid;
}

function startHand(room) {
  const seated = room.players.filter((player) => player.chips > 0);
  if (seated.length < 2) {
    room.status = "waiting";
    room.message = "チップが残っている参加者が2人以上必要です。";
    room.game = null;
    return;
  }

  room.status = "playing";
  room.players.forEach((player) => {
    player.hand = [];
    player.folded = player.chips <= 0;
    player.currentBet = 0;
    player.acted = false;
  });

  const previousDealer = room.game?.dealerIndex ?? -1;
  const dealerIndex = nextIndex(room, previousDealer, (player) => player.chips > 0);
  const smallBlindIndex =
    seated.length === 2 ? dealerIndex : nextIndex(room, dealerIndex, (player) => player.chips > 0);
  const bigBlindIndex = nextIndex(room, smallBlindIndex, (player) => player.chips > 0);

  const deck = createDeck();
  room.players.forEach((player) => {
    if (player.chips > 0) player.hand = [deck.pop(), deck.pop()];
  });

  room.game = {
    deck,
    phase: "preflop",
    community: [],
    pot: 0,
    currentBet: 20,
    minRaise: 20,
    dealerIndex,
    turnPlayerId: null,
    winners: [],
    lastAction: "新しいハンドを開始しました。",
  };

  postBlind(room.players[smallBlindIndex], 10, room.game);
  postBlind(room.players[bigBlindIndex], 20, room.game);
  room.players[smallBlindIndex].acted = true;
  room.players[bigBlindIndex].acted = true;

  const firstTurnIndex =
    seated.length === 2 ? smallBlindIndex : nextIndex(room, bigBlindIndex, canActInBettingRound);
  room.game.turnPlayerId = room.players[firstTurnIndex]?.id || null;
  room.message = "ゲーム進行中です。";
}

function startNextRound(room) {
  const game = room.game;
  room.players.forEach((player) => {
    player.currentBet = 0;
    player.acted = false;
  });
  game.currentBet = 0;
  game.minRaise = 20;

  if (game.phase === "preflop") {
    game.community.push(game.deck.pop(), game.deck.pop(), game.deck.pop());
    game.phase = "flop";
  } else if (game.phase === "flop") {
    game.community.push(game.deck.pop());
    game.phase = "turn";
  } else if (game.phase === "turn") {
    game.community.push(game.deck.pop());
    game.phase = "river";
  } else {
    finishHand(room);
    return;
  }

  const firstIndex = firstToActAfterDealerIndex(room);
  if (firstIndex === -1) finishHand(room);
  else game.turnPlayerId = room.players[firstIndex].id;
}

function finishHand(room) {
  const game = room.game;
  while (game.community.length < 5) game.community.push(game.deck.pop());
  game.phase = "showdown";
  game.turnPlayerId = null;

  const contenders = room.players.filter((player) => !player.folded && player.hand.length);
  let winners = contenders;
  if (contenders.length > 1) {
    const ranked = contenders.map((player) => ({
      player,
      score: bestScore([...player.hand, ...game.community]),
    }));
    ranked.sort((a, b) => compareScore(b.score, a.score));
    winners = ranked.filter((entry) => compareScore(entry.score, ranked[0].score) === 0).map((entry) => entry.player);
  }

  const share = Math.floor(game.pot / winners.length);
  winners.forEach((winner, index) => {
    winner.chips += share + (index === 0 ? game.pot % winners.length : 0);
  });
  game.winners = winners.map((winner) => winner.id);
  game.lastAction = `${winners.map((winner) => winner.name).join(" / ")} がポットを獲得しました。`;
}

function maybeAdvance(room) {
  const game = room.game;
  const remaining = room.players.filter((player) => !player.folded && player.hand.length);
  if (remaining.length === 1) {
    finishHand(room);
    return;
  }

  const needsAction = bettingPlayers(room).some(
    (player) => !player.acted || player.currentBet !== game.currentBet,
  );
  if (!needsAction) {
    startNextRound(room);
    return;
  }

  const currentIndex = room.players.findIndex((player) => player.id === game.turnPlayerId);
  const nextTurn = nextIndex(
    room,
    currentIndex,
    (player) => canActInBettingRound(player) && (!player.acted || player.currentBet !== game.currentBet),
  );
  game.turnPlayerId = nextTurn >= 0 ? room.players[nextTurn].id : null;
  if (!game.turnPlayerId) startNextRound(room);
}

function applyAction(room, playerId, action, amount) {
  const game = room.game;
  const player = room.players.find((seat) => seat.id === playerId);
  if (!game || !player || game.phase === "showdown" || game.turnPlayerId !== playerId) return;

  const toCall = Math.max(0, game.currentBet - player.currentBet);
  if (action === "fold") {
    player.folded = true;
    player.acted = true;
    game.lastAction = `${player.name} がフォールドしました。`;
  } else if (action === "check") {
    if (toCall > 0) return;
    player.acted = true;
    game.lastAction = `${player.name} がチェックしました。`;
  } else if (action === "call") {
    const paid = Math.min(player.chips, toCall);
    player.chips -= paid;
    player.currentBet += paid;
    game.pot += paid;
    player.acted = true;
    game.lastAction = `${player.name} が${paid}をコールしました。`;
  } else if (action === "raise") {
    const raiseTo = Math.max(Number(amount || 0), game.currentBet + game.minRaise);
    const additional = raiseTo - player.currentBet;
    if (additional <= 0 || additional > player.chips) return;
    player.chips -= additional;
    player.currentBet += additional;
    game.pot += additional;
    game.minRaise = Math.max(20, raiseTo - game.currentBet);
    game.currentBet = raiseTo;
    room.players.forEach((seat) => {
      if (seat.id !== player.id && !seat.folded && seat.hand.length && seat.chips > 0) seat.acted = false;
    });
    player.acted = true;
    game.lastAction = `${player.name} が${raiseTo}にレイズしました。`;
  }

  maybeAdvance(room);
}

function combinations(cards) {
  const result = [];
  for (let a = 0; a < cards.length - 4; a += 1)
    for (let b = a + 1; b < cards.length - 3; b += 1)
      for (let c = b + 1; c < cards.length - 2; c += 1)
        for (let d = c + 1; d < cards.length - 1; d += 1)
          for (let e = d + 1; e < cards.length; e += 1) result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return result;
}

function scoreFive(cards) {
  const counts = new Map();
  cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));
  const countGroups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const rankList = [...counts.keys()].sort((a, b) => b - a);
  const straightRanks = [...new Set(cards.map((card) => card.rank))].sort((a, b) => b - a);
  if (straightRanks.includes(14)) straightRanks.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= straightRanks.length - 5; i += 1) {
    const slice = straightRanks.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) {
      straightHigh = slice[0];
      break;
    }
  }
  const flush = cards.every((card) => card.suit === cards[0].suit);

  if (flush && straightHigh) return [8, straightHigh];
  if (countGroups[0][1] === 4) return [7, countGroups[0][0], countGroups[1][0]];
  if (countGroups[0][1] === 3 && countGroups[1][1] === 2) return [6, countGroups[0][0], countGroups[1][0]];
  if (flush) return [5, ...cards.map((card) => card.rank).sort((a, b) => b - a)];
  if (straightHigh) return [4, straightHigh];
  if (countGroups[0][1] === 3) return [3, countGroups[0][0], ...rankList.filter((rank) => rank !== countGroups[0][0])];
  if (countGroups[0][1] === 2 && countGroups[1][1] === 2) {
    const pairs = countGroups.filter((group) => group[1] === 2).map((group) => group[0]);
    return [2, ...pairs, rankList.find((rank) => !pairs.includes(rank))];
  }
  if (countGroups[0][1] === 2) return [1, countGroups[0][0], ...rankList.filter((rank) => rank !== countGroups[0][0])];
  return [0, ...rankList];
}

function bestScore(cards) {
  return combinations(cards).map(scoreFive).sort((a, b) => compareScore(b, a))[0];
}

function compareScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function attachSocket(wss) {
  wss.on("connection", (ws) => {
    let playerId = null;
    let joinedCode = null;

    ws.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "Invalid message." });
        return;
      }

      if (data.type === "createRoom") {
        const player = createPlayer(data.name);
        const code = roomCode();
        const room = {
          code,
          status: "waiting",
          hostId: player.id,
          players: [player],
          game: null,
          message: "参加者を待っています。",
          lastActivityAt: Date.now(),
        };
        rooms.set(code, room);
        playerId = player.id;
        joinedCode = code;
        sockets.set(playerId, ws);
        broadcast(room);
      }

      if (data.type === "joinRoom") {
        const code = String(data.code || "").trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { type: "error", message: "部屋が見つかりません。" });
        if (room.players.length >= 9) return send(ws, { type: "error", message: "この部屋は満席です。" });
        if (room.status !== "waiting") return send(ws, { type: "error", message: "開始済みの部屋には参加できません。" });
        const player = createPlayer(data.name);
        room.players.push(player);
        touchRoom(room);
        playerId = player.id;
        joinedCode = code;
        sockets.set(playerId, ws);
        broadcast(room);
      }

      if (data.type === "startGame" || data.type === "nextHand") {
        const room = rooms.get(joinedCode);
        if (!room || room.hostId !== playerId) return;
        if (activePlayers(room).length < 2) return send(ws, { type: "error", message: "2人以上で開始できます。" });
        touchRoom(room);
        startHand(room);
        broadcast(room);
      }

      if (data.type === "action") {
        const room = rooms.get(joinedCode);
        if (!room) return;
        touchRoom(room);
        applyAction(room, playerId, data.action, data.amount);
        broadcast(room);
      }
    });

    ws.on("close", () => {
      if (!playerId || !joinedCode) return;
      sockets.delete(playerId);
      const room = rooms.get(joinedCode);
      if (!room) return;
      const player = room.players.find((seat) => seat.id === playerId);
      if (player) player.connected = false;
      if (room.hostId === playerId) {
        room.hostId = room.players.find((seat) => seat.connected && seat.id !== playerId)?.id || room.hostId;
      }
      if (room.status === "waiting") {
        room.players = room.players.filter((seat) => seat.id !== playerId);
        if (room.hostId === playerId) room.hostId = room.players[0]?.id || null;
      } else if (room.game && player && !player.folded && room.game.phase !== "showdown") {
        touchRoom(room);
        player.folded = true;
        player.acted = true;
        room.game.lastAction = `${player.name} の接続が切れたためフォールドしました。`;
        if (room.game.turnPlayerId === playerId) maybeAdvance(room);
      }
      if (room.players.length === 0 || !room.hostId) rooms.delete(joinedCode);
      else broadcast(room);
    });
  });
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ server, path: "/ws" });
  attachSocket(wss);
  setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL_MS);
  server.listen(port, hostname, () => {
    console.log(`myapp ready on http://${hostname}:${port}`);
  });
});
