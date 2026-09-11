// 对局存储：房间 + 筹码持久化到 lib/db（重启不丢，接口已抽象可换 Postgres/Redis）。
import { loadCollection, saveCollection } from "../db";
import type { Room } from "./types";

export interface GameStore {
  get(id: string): Room | undefined;
  set(room: Room): void;
  list(): Room[];
  bank(key: string): number;
  addBank(key: string, delta: number): number;
}

const ROOMS_FILE = "rooms";
const BANKS_FILE = "banks";
const START_BANK = 1000;

const g = globalThis as unknown as {
  __turingRooms?: Map<string, Room>;
  __turingBanks?: Map<string, number>;
  __turingLoaded?: boolean;
};

function init(): { rooms: Map<string, Room>; banks: Map<string, number> } {
  if (g.__turingRooms && g.__turingBanks) return { rooms: g.__turingRooms, banks: g.__turingBanks };
  const roomsFile = loadCollection<{ list: Room[] }>(ROOMS_FILE, { list: [] });
  const rooms = new Map(roomsFile.list.map((r) => [r.id, r]));
  const banks = new Map(Object.entries(loadCollection<Record<string, number>>(BANKS_FILE, {})));
  g.__turingRooms = rooms;
  g.__turingBanks = banks;
  return { rooms, banks };
}

function saveRooms(rooms: Map<string, Room>): void {
  // 只保留最近 200 局，防止无限增长
  const list = [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  const keep = new Set(list.map((r) => r.id));
  for (const id of [...rooms.keys()]) if (!keep.has(id)) rooms.delete(id);
  saveCollection(ROOMS_FILE, { list });
}

class MemoryStore implements GameStore {
  get(id: string): Room | undefined {
    return init().rooms.get(id);
  }
  set(room: Room): void {
    init().rooms.set(room.id, room);
    saveRooms(init().rooms);
  }
  list(): Room[] {
    return [...init().rooms.values()];
  }
  bank(key: string): number {
    return init().banks.get(key) ?? START_BANK; // 新筹码桌：开局赠 1000
  }
  addBank(key: string, delta: number): number {
    const { banks } = init();
    const next = Math.max(0, (banks.get(key) ?? START_BANK) + delta);
    banks.set(key, next);
    saveCollection(BANKS_FILE, Object.fromEntries(banks));
    return next;
  }
}

const g2 = globalThis as unknown as { __huzhiStore?: GameStore };
export const store: GameStore = (g2.__huzhiStore ??= new MemoryStore());
