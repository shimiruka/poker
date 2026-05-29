"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type Card = { rank: number; suit: string };
type Player = {
  id: string;
  name: string;
  chips: number;
  folded: boolean;
  currentBet: number;
  connected: boolean;
  isHost: boolean;
  cardCount: number;
  hand: Card[];
};
type RoomState = {
  code: string;
  status: "waiting" | "playing";
  hostId: string;
  viewerId: string;
  message: string;
  me: {
    id: string;
    name: string;
    chips: number;
    hand: Card[];
    folded: boolean;
    currentBet: number;
    connected: boolean;
  };
  game: null | {
    phase: string;
    pot: number;
    currentBet: number;
    dealerIndex: number;
    turnPlayerId: string | null;
    community: Card[];
    winners: string[];
    lastAction: string;
    minRaise: number;
    canStartNext: boolean;
  };
  players: Player[];
};

const suitLabels: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const rankLabels: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};
const seatClasses = [
  "left-[8%] top-[69%]",
  "left-[2%] top-[49%]",
  "left-[10%] top-[31%]",
  "left-[50%] top-[18%]",
  "left-[90%] top-[31%]",
  "left-[98%] top-[49%]",
  "left-[92%] top-[64%]",
  "left-[25%] top-[22%]",
  "left-[75%] top-[22%]",
];

export default function Home() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [state, setState] = useState<RoomState | null>(null);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [error, setError] = useState("");
  const [raiseTo, setRaiseTo] = useState(40);

  const myTurn = state?.game?.turnPlayerId === state?.viewerId;
  const toCall = Math.max(0, (state?.game?.currentBet || 0) - (state?.me.currentBet || 0));
  const minRaiseTo = (state?.game?.currentBet || 0) + (state?.game?.minRaise || 20);
  const maxRaiseTo = (state?.me.currentBet || 0) + (state?.me.chips || 0);
  const screen = !state ? "top" : state.status === "waiting" ? "waiting" : "game";
  const orderedPlayers = useMemo(() => state?.players || [], [state]);
  const activePlayer = orderedPlayers.find((player) => player.id === state?.game?.turnPlayerId);

  function connect(type: "createRoom" | "joinRoom") {
    setError("");
    const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    let closedByServer = false;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type,
          name: name.trim() || "Player",
          code: roomCode.trim().toUpperCase(),
        }),
      );
    };
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "state") {
        setState(payload.state);
        setRaiseTo(Math.max(payload.state.game?.currentBet + payload.state.game?.minRaise || 40, 40));
      }
      if (payload.type === "error") setError(payload.message);
      if (payload.type === "roomClosed") {
        closedByServer = true;
        setState(null);
        setSocket(null);
        setError(payload.message);
      }
    };
    ws.onclose = () => {
      setSocket(null);
      if (!closedByServer) setError("サーバーとの接続が切れました。");
    };
    setSocket(ws);
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    connect(roomCode.trim() ? "joinRoom" : "createRoom");
  }

  function send(payload: object) {
    socket?.send(JSON.stringify(payload));
  }

  return (
    <main className="min-h-screen bg-[#dde2e8] text-white">
      {screen === "top" && (
        <section className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-between bg-[#eef1f4] px-5 py-6 text-[#172238]">
          <div className="pt-5">
            <p className="text-xs font-black tracking-[0.28em] text-[#2b68b8]">ONLINE HOLDEM</p>
            <h1 className="mt-3 text-4xl font-black leading-tight">Poker Room</h1>
            <p className="mt-3 text-sm leading-6 text-[#5f6b7c]">2-9人で部屋を作成し、WebSocketでリアルタイム対戦できます。</p>
          </div>
          <form onSubmit={submitJoin} className="rounded-[26px] border border-white/80 bg-white p-5 shadow-2xl shadow-[#7d889b]/30">
            <label className="text-xs font-bold text-[#5f6b7c]" htmlFor="name">
              プレイヤー名
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-12 w-full rounded-2xl border border-[#cbd5e1] px-4 text-base font-bold outline-none focus:border-[#2b68b8]"
              maxLength={18}
              placeholder="Player"
            />
            <label className="mt-4 block text-xs font-bold text-[#5f6b7c]" htmlFor="room">
              部屋コード
            </label>
            <input
              id="room"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              className="mt-2 h-12 w-full rounded-2xl border border-[#cbd5e1] px-4 font-mono text-base font-black uppercase outline-none focus:border-[#2b68b8]"
              maxLength={5}
              placeholder="空欄で新規作成"
            />
            {error && <p className="mt-3 rounded-xl bg-[#fee2e2] px-3 py-2 text-sm font-bold text-[#b42318]">{error}</p>}
            <button className="mt-5 h-[52px] w-full rounded-2xl bg-[#1e4f93] px-4 py-3 text-lg font-black text-white shadow-lg shadow-[#1e4f93]/30">
              {roomCode.trim() ? "JOIN" : "CREATE ROOM"}
            </button>
          </form>
        </section>
      )}

      {screen === "waiting" && state && (
        <section className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-[#eef1f4] px-4 py-5 text-[#172238]">
          <TopBar roomCode={state.code} />
          <div className="mt-5 rounded-[28px] bg-white p-5 shadow-xl shadow-[#7d889b]/20">
            <p className="text-xs font-black tracking-[0.22em] text-[#2b68b8]">WAITING</p>
            <h1 className="mt-2 text-3xl font-black">Room {state.code}</h1>
            <p className="mt-2 text-sm text-[#5f6b7c]">コードを共有して、2人以上になったら開始できます。</p>
            <button
              disabled={state.viewerId !== state.hostId || state.players.length < 2}
              onClick={() => send({ type: "startGame" })}
              className="mt-5 h-[52px] w-full rounded-2xl bg-[#9fd500] px-4 py-3 text-lg font-black text-[#172238] shadow-lg shadow-[#9fd500]/30 disabled:bg-[#cbd5e1] disabled:text-[#64748b]"
            >
              START GAME
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {orderedPlayers.map((player) => (
              <div key={player.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <Avatar player={player} active={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-black">{player.name}</p>
                  <p className="text-xs font-bold text-[#64748b]">{player.isHost ? "HOST" : "GUEST"}</p>
                </div>
                <span className={player.connected ? "text-xs font-black text-[#12805c]" : "text-xs font-black text-[#b42318]"}>
                  {player.connected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {screen === "game" && state && state.game && (
        <section className="mx-auto grid h-screen w-full max-w-[430px] grid-rows-[auto_1fr] overflow-hidden bg-[#d9dde3]">
          <div className="relative z-20 flex items-center justify-between px-4 pb-2 pt-4">
            <TopIcon label="MENU" />
            <TopIcon label="LOG" />
            <TopIcon label="ROOM" />
            <div className="ml-auto rounded-full border-2 border-[#9fe100] bg-[#283657] px-5 py-2 text-sm font-black text-[#b9ff21] shadow-md">
              BUDDY
            </div>
          </div>

          <div className="relative min-h-0 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-52"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #c4c9cf 1px, transparent 1px), linear-gradient(#c4c9cf 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="absolute inset-x-5 top-16 h-32 rounded-t-[42px] border-x-[18px] border-t-[20px] border-[#c2c6cc] bg-[#eef0f3]" />

            <div className="absolute inset-x-[-34px] top-[126px] h-[650px] rounded-t-[46%] border-[18px] border-[#16191f] bg-[#4868bc] shadow-2xl">
              <div className="absolute inset-x-8 top-6 h-[520px] rounded-t-[44%] border-2 border-[#8ea0d9]/80" />
            </div>

            <div className="absolute right-0 top-6 w-44 rounded-l bg-white/90 py-1 pl-12 pr-3 text-[#26304a] shadow">
              <p className="text-right text-lg font-black">1<span className="text-xs">/6 位</span></p>
              <p className="rounded bg-[#244d90] px-2 py-1 text-right text-xs font-black text-white">Lv.1 02:27</p>
            </div>

            {orderedPlayers.map((player, index) => (
              <Seat
                key={player.id}
                player={player}
                index={index}
                active={state.game?.turnPlayerId === player.id}
                dealer={index === state.game?.dealerIndex}
                winner={state.game?.winners.includes(player.id) || false}
                me={state.viewerId === player.id}
              />
            ))}

            <div className="absolute left-1/2 top-[45%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
              <div className="mb-3 flex min-h-16 gap-1.5">
                {state.game.community.length ? (
                  state.game.community.map((card, index) => <CardView key={`${card.suit}${card.rank}${index}`} card={card} table />)
                ) : (
                  Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 w-11 rounded border-2 border-white/40 bg-white/5" />)
                )}
              </div>
              <p className="text-sm font-black tracking-wide text-white/85">TOTAL POT</p>
              <div className="mt-1 rounded-xl bg-[#293c72]/90 px-14 py-1 text-2xl font-black shadow-lg">{money(state.game.pot)}</div>
              {state.game.currentBet > 0 && (
                <div className="mt-2 rounded-full border-2 border-[#a8df20] bg-[#30549b] px-4 py-0.5 text-sm font-black text-[#c9ff2c]">
                  {money(state.game.currentBet)}
                </div>
              )}
            </div>

            <div className="absolute bottom-[176px] left-5">
              <Avatar player={state.me} active={myTurn} large />
              <PlayerPlate name={state.me.name} chips={state.me.chips} compact />
            </div>

            <div className="absolute bottom-[54px] left-[118px] flex -space-x-4 rotate-[-8deg]">
              {state.me.hand.map((card, index) => (
                <CardView key={`${card.suit}${card.rank}${index}`} card={card} hand />
              ))}
            </div>

            <ActionPanel
              canAct={myTurn}
              phase={state.game.phase}
              toCall={toCall}
              raiseTo={raiseTo}
              minRaiseTo={minRaiseTo}
              maxRaiseTo={maxRaiseTo}
              canStartNext={state.game.canStartNext}
              onRaiseChange={setRaiseTo}
              onAction={send}
            />

            <div className="absolute bottom-4 left-4 max-w-[150px] rounded-2xl border border-white/30 bg-[#24375f]/90 px-3 py-2 text-xs font-bold leading-4 text-white shadow-lg">
              {state.game.winners.length > 0
                ? `WINNER ${orderedPlayers.filter((player) => state.game?.winners.includes(player.id)).map((player) => player.name).join(" / ")}`
                : activePlayer
                  ? `${activePlayer.name} の番`
                  : state.game.lastAction}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function TopBar({ roomCode }: { roomCode: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-black tracking-[0.22em] text-[#64748b]">TEXAS HOLDEM</p>
        <p className="text-xl font-black text-[#172238]">Online Table</p>
      </div>
      <div className="rounded-2xl bg-[#172238] px-4 py-2 text-right text-white">
        <p className="text-[10px] font-bold text-white/60">ROOM</p>
        <p className="font-mono text-lg font-black">{roomCode}</p>
      </div>
    </div>
  );
}

function TopIcon({ label }: { label: string }) {
  return (
    <div className="mr-2 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/70 bg-[#1e4f93] text-[10px] font-black text-white shadow-md">
      {label}
    </div>
  );
}

function Seat({
  player,
  index,
  active,
  dealer,
  winner,
  me,
}: {
  player: Player;
  index: number;
  active: boolean;
  dealer: boolean;
  winner: boolean;
  me: boolean;
}) {
  if (me) return null;
  return (
    <div className={`absolute z-10 ${seatClasses[index % seatClasses.length]} flex -translate-x-1/2 flex-col items-center`}>
      <div className="relative">
        <Avatar player={player} active={active} />
        {dealer && <Badge label="D" className="absolute -bottom-1 -left-2 bg-[#ff5c33]" />}
        {index === 4 && <Badge label="SB" className="absolute -bottom-1 -left-2 bg-[#a667d5]" />}
        {index === 5 && <Badge label="BB" className="absolute -bottom-1 -left-2 bg-[#ff9b2f]" />}
        <div className="absolute -right-3 bottom-0 h-10 w-7 rotate-6 rounded border border-[#d9d9d9] bg-white shadow" />
      </div>
      <PlayerPlate name={player.name} chips={player.chips} faded={player.folded || !player.connected} winner={winner} />
      {player.currentBet > 0 && (
        <div className="mt-1 rounded-full border-2 border-white/80 bg-[#405f9f] px-3 py-0.5 text-xs font-black text-white">
          {money(player.currentBet)}
        </div>
      )}
    </div>
  );
}

function Avatar({ player, active, large = false }: { player: { name: string; connected: boolean }; active: boolean; large?: boolean }) {
  const initial = player.name.trim().slice(0, 1).toUpperCase() || "P";
  return (
    <div
      className={`${large ? "h-24 w-24 text-4xl" : "h-16 w-16 text-2xl"} flex items-center justify-center rounded-full border-[3px] ${
        active ? "border-[#a8df20]" : "border-[#7c8798]"
      } font-black text-[#26304a] shadow-lg ${
        player.connected ? "" : "opacity-45"
      }`}
      style={{
        backgroundImage: "radial-gradient(circle at 40% 35%, #ffffff, #d7dde7 48%, #8d99aa)",
      }}
    >
      {initial}
    </div>
  );
}

function PlayerPlate({
  name,
  chips,
  compact = false,
  faded = false,
  winner = false,
}: {
  name: string;
  chips: number;
  compact?: boolean;
  faded?: boolean;
  winner?: boolean;
}) {
  return (
    <div
      className={`${compact ? "w-28" : "w-24"} -mt-1 rounded border-2 ${
        winner ? "border-[#dfff39]" : "border-white/80"
      } bg-[#244d90] px-1 py-0.5 text-center shadow ${faded ? "opacity-55" : ""}`}
    >
      <p className="truncate rounded-sm bg-white px-1 text-[10px] font-black text-[#26304a]">{name}</p>
      <p className="font-mono text-lg font-black leading-5 text-white">{money(chips)}</p>
    </div>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`${className} rounded-full px-1.5 py-0.5 text-xs font-black text-white shadow`}>{label}</span>;
}

function CardView({ card, hand = false, table = false }: { card: Card; hand?: boolean; table?: boolean }) {
  const red = card.suit === "h" || card.suit === "d";
  return (
    <div
      className={`${hand ? "h-32 w-[5.5rem] rounded-xl text-4xl" : table ? "h-16 w-11 rounded-md text-lg" : "h-20 w-14 rounded-lg text-xl"} flex flex-col justify-between border border-[#d8d8d8] bg-white p-2 font-black text-[#172238] shadow-xl`}
    >
      <span className={red ? "text-[#d92828]" : "text-[#172238]"}>{rankLabels[card.rank] || card.rank}</span>
      <span className={`self-end ${red ? "text-[#d92828]" : "text-[#172238]"}`}>{suitLabels[card.suit]}</span>
    </div>
  );
}

function ActionPanel({
  canAct,
  phase,
  toCall,
  raiseTo,
  minRaiseTo,
  maxRaiseTo,
  canStartNext,
  onRaiseChange,
  onAction,
}: {
  canAct: boolean;
  phase: string;
  toCall: number;
  raiseTo: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canStartNext: boolean;
  onRaiseChange: (amount: number) => void;
  onAction: (payload: object) => void;
}) {
  if (phase === "showdown") {
    return (
      <button
        disabled={!canStartNext}
        onClick={() => onAction({ type: "nextHand" })}
        className="absolute bottom-8 right-5 h-20 w-36 rounded-full border-4 border-[#a8df20] bg-[#3a3f48] text-lg font-black text-white shadow-2xl disabled:opacity-45"
      >
        NEXT HAND
      </button>
    );
  }

  return (
    <div className="absolute bottom-[-16px] right-[-22px] h-56 w-56 rounded-full border-[12px] border-[#23375f] bg-[#3d4045] shadow-2xl">
      <button
        disabled={!canAct}
        onClick={() => onAction({ type: "action", action: toCall > 0 ? "call" : "check" })}
        className="absolute right-4 top-8 h-28 w-28 rounded-full border-4 border-[#a8df20] bg-[#3d4045] text-center text-2xl font-black leading-7 text-white disabled:opacity-45"
      >
        {toCall > 0 ? "CALL" : "CHECK"}
        <span className="block text-base text-[#b9ff21]">{toCall > 0 ? `+${money(toCall)}` : ""}</span>
      </button>
      <button
        disabled={!canAct}
        onClick={() => onAction({ type: "action", action: "fold" })}
        className="absolute bottom-10 left-8 h-24 w-24 rounded-full text-2xl font-black text-white disabled:opacity-45"
      >
        FOLD
      </button>
      <button
        disabled={!canAct || raiseTo < minRaiseTo || raiseTo > maxRaiseTo}
        onClick={() => onAction({ type: "action", action: "raise", amount: raiseTo })}
        className="absolute bottom-14 left-0 h-16 w-16 rounded-full bg-[#d77f24] text-xs font-black text-white shadow-lg disabled:opacity-45"
      >
        RAISE
      </button>
      <div className="absolute -left-6 top-10 grid gap-1">
        {[2, 2.5, 3].map((multiplier) => (
          <button
            key={multiplier}
            disabled={!canAct}
            onClick={() => onRaiseChange(Math.min(maxRaiseTo, Math.max(minRaiseTo, Math.round((toCall || 200) * multiplier))))}
            className="h-14 w-14 rounded-full bg-[#d77f24] text-xs font-black text-white shadow disabled:opacity-45"
          >
            x{multiplier}
            <span className="block">{money(Math.min(maxRaiseTo, Math.max(minRaiseTo, Math.round((toCall || 200) * multiplier))))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString("en-US");
}
