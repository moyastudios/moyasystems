// Checks roblox/.../Crypto.luau against Node's crypto, and that the Luau signing string matches the API's.
// Runs the module in Lua 5.4 (wasmoon) with a bit32 shim; Luau type annotations are stripped first.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { LuaFactory } from "wasmoon";
import { describe, expect, it } from "vitest";
import { gameSigningString } from "../../packages/core/src/crypto";

const src = readFileSync(new URL("../ServerScriptService/Westbridge/Crypto.luau", import.meta.url), "utf8")
  .replace(/\)\s*:\s*string/g, ")")
  .replace(/(\w+):\s*string/g, "$1");

const BIT32 = `
local M = 0xffffffff
local function i(x) return math.tointeger(x) & M end
bit32 = {
  band = function(...) local r = M for _, v in ipairs({...}) do r = r & i(v) end return r end,
  bxor = function(...) local r = 0 for _, v in ipairs({...}) do r = r ~ i(v) end return r end,
  bnot = function(x) return (~i(x)) & M end,
  rshift = function(x, n) return i(x) >> n end,
  rrotate = function(x, n) x = i(x) n = n % 32 return ((x >> n) | (x << (32 - n))) & M end,
}`;

const lua = await (await new LuaFactory().createEngine());
await lua.doString(BIT32);
lua.global.set("__SRC", src);
await lua.doString("__C = load(__SRC)()");
const Crypto = { sha256Hex: (s) => lua.global.get("__shaHex")(Buffer.from(s).toString("hex")) };
// Binary strings must stay inside Lua (the JS bridge is UTF-8), so cross the boundary as hex.
await lua.doString(`function __shaHex(h) return __C.sha256Hex(__C.hexToBytes(h)) end
function __hmacHex(k, m) return __C.hmacSha256Hex(__C.hexToBytes(k), __C.hexToBytes(m)) end`);

describe("Crypto.luau", () => {
  it("matches SHA-256 for lengths across padding boundaries", () => {
    for (const n of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 200, 1000]) {
      const buf = randomBytes(n);
      expect(lua.global.get("__shaHex")(buf.toString("hex"))).toBe(createHash("sha256").update(buf).digest("hex"));
    }
  });

  it("matches HMAC-SHA256 with a 32-byte key (as issued by /game/session)", () => {
    const keyHex = randomBytes(32).toString("hex");
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ code: "ABC234", robloxId: 1, robloxUsername: "Tester", groupRank: 100 });
    // Same canonical string the ApiClient builds: v1, ts, nonce, METHOD, path, sha256(body)
    const luaString = ["v1", ts, "NONCE-0001-AAAA", "POST", "/game/link", Crypto.sha256Hex(body)].join("\n");
    expect(luaString).toBe(gameSigningString(ts, "NONCE-0001-AAAA", "POST", "/game/link", body));
    const luaSig = lua.global.get("__hmacHex")(keyHex, Buffer.from(luaString).toString("hex"));
    expect(luaSig).toBe(createHmac("sha256", Buffer.from(keyHex, "hex")).update(luaString).digest("hex"));
  });

  it("handles keys longer than the block size", () => {
    const key = randomBytes(100);
    expect(lua.global.get("__hmacHex")(key.toString("hex"), Buffer.from("hello").toString("hex"))).toBe(createHmac("sha256", key).update("hello").digest("hex"));
  });
});
