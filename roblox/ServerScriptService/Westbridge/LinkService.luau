--!strict
-- Staff-only account linking: a staff member runs /link in Discord and types the code into the
-- in-game GUI. Only players with a configured staff group rank see the button, and both this
-- script and the API re-check that before linking.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ApiClient = require(script.Parent.ApiClient)

local LinkService = {}

local CODE_PATTERN = "^[A-HJ-NP-Z2-9]+$" -- matches LINK_CODE_ALPHABET in packages/shared
local MAX_ATTEMPTS, WINDOW = 5, 600

local config: { groupId: number, minStaffGroupRank: number }? = nil
local attempts: { [number]: { number } } = {}

local MESSAGES = {
	INVALID_CODE = "That code is wrong or has expired. Run /link in Discord for a new one.",
	ROBLOX_TAKEN = "This Roblox account is already linked to a different Discord account. Ask an owner.",
	NOT_STAFF = "Only staff can link accounts.",
	RATE_LIMITED = "Too many attempts. Wait a few minutes.",
}

local function remotes(): Folder
	local folder = ReplicatedStorage:FindFirstChild("WestbridgeRemotes") :: Folder?
	if not folder then
		local f = Instance.new("Folder")
		f.Name = "WestbridgeRemotes"
		f.Parent = ReplicatedStorage
		folder = f
	end
	return folder :: Folder
end

local function refreshConfig(): boolean
	local res = ApiClient.request("GET", "/game/config")
	if res.ok and res.data and type(res.data.groupId) == "number" then
		config = { groupId = res.data.groupId, minStaffGroupRank = res.data.minStaffGroupRank }
		return true
	end
	return false
end

local function groupRank(player: Player): number
	if not config then
		return 0
	end
	local ok, rank = pcall(player.GetRankInGroup, player, config.groupId)
	return if ok then rank else 0
end

local function updateEligibility(player: Player)
	local rank = groupRank(player)
	player:SetAttribute("WB_GroupRank", rank)
	player:SetAttribute("WB_CanLink", config ~= nil and rank >= (config :: any).minStaffGroupRank)
end

local function allowAttempt(player: Player): boolean
	local t = os.clock()
	local list = attempts[player.UserId] or {}
	local recent = {}
	for _, at in list do
		if t - at < WINDOW then
			table.insert(recent, at)
		end
	end
	if #recent >= MAX_ATTEMPTS then
		attempts[player.UserId] = recent
		return false
	end
	table.insert(recent, t)
	attempts[player.UserId] = recent
	return true
end

local function onSubmit(player: Player, code: unknown): (boolean, string)
	if type(code) ~= "string" or #code > 12 then
		return false, "Enter the 6-character code."
	end
	local clean = string.upper((string.gsub(code, "%s", "")))
	if #clean ~= 6 or not string.match(clean, CODE_PATTERN) then
		return false, "Enter the 6-character code."
	end
	if not allowAttempt(player) then
		return false, MESSAGES.RATE_LIMITED
	end
	if player:GetAttribute("WB_CanLink") ~= true then
		return false, MESSAGES.NOT_STAFF
	end

	local res = ApiClient.request("POST", "/game/link", {
		code = clean,
		robloxId = player.UserId,
		robloxUsername = player.Name,
		groupRank = groupRank(player), -- fresh check, not the cached attribute
	})
	if res.ok then
		return true, "Linked! Run /whoami in Discord to check."
	end
	local err = if res.data then res.data.error else nil
	return false, (err and MESSAGES[err]) or "Couldn't reach the staff system. Try again shortly."
end

function LinkService.init()
	local fn = Instance.new("RemoteFunction")
	fn.Name = "SubmitLinkCode"
	fn.Parent = remotes()
	fn.OnServerInvoke = onSubmit

	Players.PlayerAdded:Connect(updateEligibility)
	Players.PlayerRemoving:Connect(function(player)
		attempts[player.UserId] = nil
	end)

	task.spawn(function()
		-- Retry until the API is reachable and set up, then refresh every 5 minutes.
		while true do
			if refreshConfig() then
				for _, player in Players:GetPlayers() do
					task.spawn(updateEligibility, player)
				end
				task.wait(300)
			else
				task.wait(60)
			end
		end
	end)
end

return LinkService
