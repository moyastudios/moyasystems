--!strict
-- SHA-256 and HMAC-SHA256 in pure Luau (bit32). Written in a Lua 5.1-compatible subset so
-- roblox/test/crypto.test.mjs can check it against Node's crypto outside Roblox.

local band, bxor, bnot, rshift, rrotate = bit32.band, bit32.bxor, bit32.bnot, bit32.rshift, bit32.rrotate
local MOD = 4294967296

local K = {
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local function u32be(n)
	return string.char(band(rshift(n, 24), 255), band(rshift(n, 16), 255), band(rshift(n, 8), 255), band(n, 255))
end

local function digestWords(msg)
	local len = #msg
	local bitLen = len * 8
	local padded = msg
		.. "\128"
		.. string.rep("\0", (55 - len) % 64)
		.. u32be(math.floor(bitLen / MOD))
		.. u32be(bitLen % MOD)

	local h0, h1, h2, h3 = 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a
	local h4, h5, h6, h7 = 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	local w = {}

	for chunk = 1, #padded, 64 do
		for i = 0, 15 do
			local b1, b2, b3, b4 = string.byte(padded, chunk + i * 4, chunk + i * 4 + 3)
			w[i + 1] = ((b1 * 256 + b2) * 256 + b3) * 256 + b4
		end
		for i = 17, 64 do
			local w15, w2 = w[i - 15], w[i - 2]
			local s0 = bxor(rrotate(w15, 7), rrotate(w15, 18), rshift(w15, 3))
			local s1 = bxor(rrotate(w2, 17), rrotate(w2, 19), rshift(w2, 10))
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) % MOD
		end

		local a, b, c, d, e, f, g, h = h0, h1, h2, h3, h4, h5, h6, h7
		for i = 1, 64 do
			local S1 = bxor(rrotate(e, 6), rrotate(e, 11), rrotate(e, 25))
			local ch = bxor(band(e, f), band(bnot(e), g))
			local t1 = (h + S1 + ch + K[i] + w[i]) % MOD
			local S0 = bxor(rrotate(a, 2), rrotate(a, 13), rrotate(a, 22))
			local maj = bxor(band(a, b), band(a, c), band(b, c))
			local t2 = (S0 + maj) % MOD
			h, g, f, e = g, f, e, (d + t1) % MOD
			d, c, b, a = c, b, a, (t1 + t2) % MOD
		end

		h0, h1, h2, h3 = (h0 + a) % MOD, (h1 + b) % MOD, (h2 + c) % MOD, (h3 + d) % MOD
		h4, h5, h6, h7 = (h4 + e) % MOD, (h5 + f) % MOD, (h6 + g) % MOD, (h7 + h) % MOD
	end
	return { h0, h1, h2, h3, h4, h5, h6, h7 }
end

local Crypto = {}

function Crypto.sha256(msg: string): string
	local out = {}
	for i, word in ipairs(digestWords(msg)) do
		out[i] = u32be(word)
	end
	return table.concat(out)
end

function Crypto.sha256Hex(msg: string): string
	local out = {}
	for i, word in ipairs(digestWords(msg)) do
		out[i] = string.format("%08x", word)
	end
	return table.concat(out)
end

local function xorPad(key, byte)
	local out = {}
	for i = 1, 64 do
		out[i] = string.char(bxor(string.byte(key, i), byte))
	end
	return table.concat(out)
end

function Crypto.hmacSha256Hex(key: string, msg: string): string
	if #key > 64 then
		key = Crypto.sha256(key)
	end
	key = key .. string.rep("\0", 64 - #key)
	return Crypto.sha256Hex(xorPad(key, 0x5c) .. Crypto.sha256(xorPad(key, 0x36) .. msg))
end

function Crypto.hexToBytes(hex: string): string
	return (string.gsub(hex, "%x%x", function(pair)
		return string.char(tonumber(pair, 16))
	end))
end

return Crypto
