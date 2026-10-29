--!strict
-- Westbridge staff system: server entry point.
local HttpService = game:GetService("HttpService")
local MessagingService = game:GetService("MessagingService")
local Config = require(script.Parent.Config)
local ApiClient = require(script.Parent.ApiClient)
local LinkService = require(script.Parent.LinkService)

if not HttpService.HttpEnabled then
	warn("[Westbridge] Enable Game Settings → Security → Allow HTTP Requests.")
	return
end

-- Proves the game → API direction (used by the setup wizard's connection test).
ApiClient.post("/game/ping", {})

-- API → game: commands published through Open Cloud MessagingService.
task.spawn(function()
	local ok, err = pcall(function()
		MessagingService:SubscribeAsync(Config.MessagingTopic, function(message)
			local decoded, data = pcall(HttpService.JSONDecode, HttpService, message.Data)
			if not decoded or type(data) ~= "table" then
				return
			end
			if data.type == "probe" and type(data.checkId) == "string" then
				-- The signed reply is what proves the message reached a real server.
				ApiClient.post("/game/ack", { checkId = data.checkId })
			end
		end)
	end)
	if not ok then
		warn("[Westbridge] MessagingService subscribe failed:", err)
	end
end)

LinkService.init()
