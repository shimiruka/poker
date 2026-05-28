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

  function connect(type: "createRoom" | "joinRoom") {
    setError("");
    const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
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
    };
    ws.onclose = () => {
      setSocket(null);
      setError("サーバーとの接続が切れました。");
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
    <main className="min-h-screen bg-[#f7f3e8] text-[#20231f]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-[#d7cdb8] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#806c4a]">Texas Hold&apos;em</p>
            <h1 className="text-2xl font-semibold">Online Poker Table</h1>
          </div>
          {state && (
            <div className="rounded border border-[#bcae91] bg-white px-3 py-2 text-right">
              <p className="text-xs text-[#806c4a]">Room</p>
              <p className="font-mono text-lg font-semibold">{state.code}</p>
            </div>
          )}
        </header>

        {screen === "top" && (
          <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_380px]">
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-semibold text-[#0b6b4f]">2-9 players / WebSocket realtime</p>
              <h2 className="text-4xl font-semibold leading-tight sm:text-6xl">ブラウザだけで着席できるポーカーテーブル</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#5c5548]">
                部屋を作成してコードを共有するか、既存の部屋コードを入力して参加してください。
              </p>
            </div>
            <form onSubmit={submitJoin} className="rounded-lg border border-[#d7cdb8] bg-white p-5 shadow-sm">
              <label className="block text-sm font-medium" htmlFor="name">
                プレイヤー名
              </label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 h-11 w-full rounded border border-[#bcae91] px-3 outline-none focus:border-[#0b6b4f]"
                maxLength={18}
                placeholder="Player"
              />
              <label className="mt-4 block text-sm font-medium" htmlFor="room">
                部屋コード
              </label>
              <input
                id="room"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                className="mt-2 h-11 w-full rounded border border-[#bcae91] px-3 font-mono uppercase outline-none focus:border-[#0b6b4f]"
                maxLength={5}
                placeholder="新規作成なら空欄"
              />
              {error && <p className="mt-3 text-sm text-[#b42318]">{error}</p>}
              <button className="mt-5 h-11 w-full rounded bg-[#0b6b4f] px-4 font-semibold text-white hover:bg-[#09543f]">
                {roomCode.trim() ? "部屋に参加" : "部屋を作成"}
              </button>
            </form>
          </section>
        )}

        {screen === "waiting" && state && (
          <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[1fr_340px]">
            <div className="rounded-lg border border-[#d7cdb8] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">待機画面</h2>
                  <p className="mt-1 text-sm text-[#5c5548]">部屋コードを共有して、2-9人で開始できます。</p>
                </div>
                <button
                  disabled={state.viewerId !== state.hostId || state.players.length < 2}
                  onClick={() => send({ type: "startGame" })}
                  className="h-10 rounded bg-[#0b6b4f] px-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#a8a092]"
                >
                  ゲーム開始
                </button>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {orderedPlayers.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded border border-[#e4dccb] px-4 py-3">
                    <div>
                      <p className="font-semibold">{player.name}</p>
                      <p className="text-xs text-[#806c4a]">{player.isHost ? "Host" : "Guest"}</p>
                    </div>
                    <span className={player.connected ? "text-sm text-[#0b6b4f]" : "text-sm text-[#b42318]"}>
                      {player.connected ? "online" : "offline"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <aside className="rounded-lg border border-[#d7cdb8] bg-[#20231f] p-5 text-white">
              <p className="text-sm text-[#d7cdb8]">Room Code</p>
              <p className="mt-2 font-mono text-5xl font-semibold">{state.code}</p>
              <p className="mt-5 text-sm text-[#d7cdb8]">{state.message}</p>
            </aside>
          </section>
        )}

        {screen === "game" && state && state.game && (
          <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[250px_1fr_270px]">
            <aside className="rounded-lg border border-[#d7cdb8] bg-white p-4">
              <h2 className="font-semibold">Players</h2>
              <div className="mt-3 space-y-2">
                {orderedPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={`rounded border px-3 py-2 ${
                      state.game?.turnPlayerId === player.id ? "border-[#0b6b4f] bg-[#edf8f3]" : "border-[#e4dccb]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{player.name}</p>
                      <p className="text-xs text-[#806c4a]">{index === state.game?.dealerIndex ? "D" : ""}</p>
                    </div>
                    <p className="text-sm text-[#5c5548]">chips {player.chips}</p>
                    <p className="text-xs text-[#806c4a]">
                      bet {player.currentBet} {player.folded ? "/ fold" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </aside>

            <div className="rounded-lg border border-[#d7cdb8] bg-[#11563f] p-4 text-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-[#cde6db]">{state.game.phase}</p>
                  <h2 className="text-2xl font-semibold">Pot {state.game.pot}</h2>
                </div>
                <p className="rounded border border-[#8ac2aa] px-3 py-2 text-sm">{state.game.lastAction}</p>
              </div>

              <div className="mt-8 flex min-h-28 flex-wrap items-center justify-center gap-3 rounded border border-[#6faf94] bg-[#0d4634] p-4">
                {state.game.community.length ? state.game.community.map((card, index) => <CardView key={`${card.suit}${card.rank}${index}`} card={card} />) : <p className="text-[#cde6db]">Community cards</p>}
              </div>

              <div className="mt-8">
                <p className="mb-3 text-center text-sm text-[#cde6db]">Your hand</p>
                <div className="flex justify-center gap-3">
                  {state.me.hand.map((card, index) => (
                    <CardView key={`${card.suit}${card.rank}${index}`} card={card} large />
                  ))}
                </div>
              </div>

              {state.game.winners.length > 0 && (
                <div className="mt-6 rounded border border-[#e5cb73] bg-[#fff7cf] px-4 py-3 text-[#20231f]">
                  Winner: {orderedPlayers.filter((player) => state.game?.winners.includes(player.id)).map((player) => player.name).join(" / ")}
                </div>
              )}
            </div>

            <aside className="rounded-lg border border-[#d7cdb8] bg-white p-4">
              <h2 className="font-semibold">Action</h2>
              <div className="mt-3 rounded border border-[#e4dccb] p-3 text-sm">
                <p>あなた: {state.me.name}</p>
                <p>チップ: {state.me.chips}</p>
                <p>コール額: {toCall}</p>
              </div>

              {state.game.phase !== "showdown" ? (
                <div className="mt-4 space-y-3">
                  <button disabled={!myTurn} onClick={() => send({ type: "action", action: "fold" })} className="h-10 w-full rounded border border-[#bcae91] font-semibold disabled:opacity-45">
                    Fold
                  </button>
                  <button disabled={!myTurn || toCall > 0} onClick={() => send({ type: "action", action: "check" })} className="h-10 w-full rounded border border-[#bcae91] font-semibold disabled:opacity-45">
                    Check
                  </button>
                  <button disabled={!myTurn || toCall === 0} onClick={() => send({ type: "action", action: "call" })} className="h-10 w-full rounded bg-[#20231f] font-semibold text-white disabled:opacity-45">
                    Call {toCall}
                  </button>
                  <label className="block text-sm font-medium" htmlFor="raise">
                    Raise to
                  </label>
                  <input
                    id="raise"
                    type="number"
                    min={minRaiseTo}
                    max={maxRaiseTo}
                    step={10}
                    value={raiseTo}
                    onChange={(event) => setRaiseTo(Number(event.target.value))}
                    className="h-10 w-full rounded border border-[#bcae91] px-3"
                  />
                  <button disabled={!myTurn || raiseTo < minRaiseTo || raiseTo > maxRaiseTo} onClick={() => send({ type: "action", action: "raise", amount: raiseTo })} className="h-10 w-full rounded bg-[#0b6b4f] font-semibold text-white disabled:opacity-45">
                    Raise
                  </button>
                </div>
              ) : (
                <button
                  disabled={!state.game.canStartNext}
                  onClick={() => send({ type: "nextHand" })}
                  className="mt-4 h-10 w-full rounded bg-[#0b6b4f] font-semibold text-white disabled:opacity-45"
                >
                  次のハンド
                </button>
              )}
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}

function CardView({ card, large = false }: { card: Card; large?: boolean }) {
  const red = card.suit === "h" || card.suit === "d";
  return (
    <div className={`${large ? "h-28 w-20 text-2xl" : "h-24 w-16 text-xl"} flex flex-col justify-between rounded-md border border-[#d8d8d8] bg-white p-2 font-semibold shadow text-[#20231f]`}>
      <span className={red ? "text-[#c82828]" : "text-[#20231f]"}>{rankLabels[card.rank] || card.rank}</span>
      <span className={`self-end ${red ? "text-[#c82828]" : "text-[#20231f]"}`}>{suitLabels[card.suit]}</span>
    </div>
  );
}
