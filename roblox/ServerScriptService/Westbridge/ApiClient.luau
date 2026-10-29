--!strict
-- Signed HTTP client for the Westbridge API.
--
-- 1. On first use, POST /game/session with the Secrets-store value as a header (a Secret can't be
--    read by scripts, only sent in a header). The API returns a per-server HMAC key valid for 24h.
-- 2. Every request is signed: HMAC-SHA256(key, "v1\n<ts>\n<nonce>\n<METHOD>\n<path>\n<sha256(body)>").
--    The API rejects anything older than 60s or replayed.
-- 3. Requests go through a queue with limited concurrency, a per-minute budget, and retries with
--    backoff on network errors, 429 and 5xx. A rejected session is re-opened once automatically.

local HttpService = game:GetService("HttpService")
local Config = require(script.Parent.Config)
local Crypto = require(script.Parent.Crypto)

export type Response = { ok: boolean, status: number, data: any }

type Job = {
	method: string,
	path: string,
	body: string,
	idempotencyKey: string,
	thread: thread?,
}

local ApiClient = {}

local session: { id: string, key: string, expiresAt: number }? = nil
local opening = false
local queue: { Job } = {}
local active = 0
local sentThisMinute, minuteStart = 0, os.clock()

local jobId = if game.JobId ~= "" then game.JobId else "studio-" .. string.sub(HttpService:GenerateGUID(false), 1, 8)

local function now(): number
	return DateTime.now().UnixTimestamp
end

local function decode(body: string?): any
	if not body or body == "" then
		return nil
	end
	local ok, data = pcall(HttpService.JSONDecode, HttpService, body)
	return if ok then data else nil
end

local function openSession(): boolean
	if opening then
		while opening do
			task.wait(0.1)
		end
		return session ~= nil
	end
	opening = true
	local ok, res = pcall(function()
		local secret = HttpService:GetSecret(Config.SecretName)
		return HttpService:RequestAsync({
			Url = Config.BaseUrl .. "/game/session",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["X-WB-Secret"] = secret :: any,
				["X-WB-Job-Id"] = jobId,
				["X-WB-Place-Id"] = tostring(game.PlaceId),
			},
			Body = "{}",
		})
	end)
	local data = if ok and res.Success then decode(res.Body) else nil
	if data and type(data.key) == "string" then
		session = { id = data.sessionId, key = Crypto.hexToBytes(data.key), expiresAt = data.expiresAt }
	else
		session = nil
		-- Never print the secret; status only.
		warn("[Westbridge] could not open API session:", if ok then res.StatusCode else "request failed")
	end
	opening = false
	return session ~= nil
end

local function sendOnce(job: Job): (boolean, any)
	if not session or session.expiresAt - now() < 60 then
		if not openSession() then
			return false, nil
		end
	end
	local s = session :: { id: string, key: string, expiresAt: number }
	local ts = tostring(now())
	local nonce = HttpService:GenerateGUID(false)
	local canonical = table.concat({ "v1", ts, nonce, job.method, job.path, Crypto.sha256Hex(job.body) }, "\n")
	local request: any = {
		Url = Config.BaseUrl .. job.path,
		Method = job.method,
		Headers = {
			["Content-Type"] = "application/json",
			["X-WB-Session"] = s.id,
			["X-WB-Timestamp"] = ts,
			["X-WB-Nonce"] = nonce,
			["X-WB-Signature"] = Crypto.hmacSha256Hex(s.key, canonical),
			["X-WB-Idempotency-Key"] = job.idempotencyKey,
		},
	}
	if job.method ~= "GET" then
		request.Body = job.body
	end
	return pcall(HttpService.RequestAsync, HttpService, request)
end

local function process(job: Job): Response
	local reopened = false
	local attempt = 0
	while true do
		attempt += 1
		local ok, res = sendOnce(job)
		if ok and res then
			local data = decode(res.Body)
			if res.StatusCode == 401 and not reopened and data and (data.reason == "SESSION" or data.reason == "SIGNATURE") then
				reopened = true
				session = nil
				attempt -= 1
			elseif res.StatusCode < 500 and res.StatusCode ~= 429 then
				return { ok = res.Success, status = res.StatusCode, data = data }
			end
		end
		if attempt >= Config.MaxAttempts then
			return { ok = false, status = if ok and res then res.StatusCode else 0, data = nil }
		end
		-- Exponential backoff with jitter: ~0.5s, 1s, 2s…
		task.wait(0.5 * 2 ^ (attempt - 1) + math.random() * 0.25)
	end
end

local function pump()
	while active < Config.Concurrency and #queue > 0 do
		if os.clock() - minuteStart >= 60 then
			sentThisMinute, minuteStart = 0, os.clock()
		end
		if sentThisMinute >= Config.RequestsPerMinute then
			task.delay(60 - (os.clock() - minuteStart), pump)
			return
		end
		local job = table.remove(queue, 1) :: Job
		active += 1
		sentThisMinute += 1
		task.spawn(function()
			local ok, result = pcall(process, job)
			active -= 1
			if job.thread then
				task.spawn(job.thread, if ok then result else { ok = false, status = 0, data = nil })
			end
			pump()
		end)
	end
end

local function enqueue(method: string, path: string, payload: any?, wait: boolean): Response?
	local job: Job = {
		method = method,
		path = path,
		body = if method == "GET" then "" else HttpService:JSONEncode(payload or {}),
		idempotencyKey = HttpService:GenerateGUID(false),
		thread = if wait then coroutine.running() else nil,
	}
	table.insert(queue, job)
	pump()
	if wait then
		return coroutine.yield()
	end
	return nil
end

--- Sends a signed request and yields until it finishes (after retries).
function ApiClient.request(method: "GET" | "POST", path: string, payload: any?): Response
	return enqueue(method, path, payload, true) :: Response
end

--- Fire-and-forget signed POST (still queued and retried).
function ApiClient.post(path: string, payload: any?)
	enqueue("POST", path, payload, false)
end

ApiClient.jobId = jobId

return ApiClient
