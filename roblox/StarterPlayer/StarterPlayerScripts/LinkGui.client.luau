--!strict
-- "Link Discord" button + code entry. Only shown to staff (the server sets WB_CanLink).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("WestbridgeRemotes")
local submit = remotes:WaitForChild("SubmitLinkCode") :: RemoteFunction

local gui = Instance.new("ScreenGui")
gui.Name = "WestbridgeLink"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Enabled = false

local function corner(parent: Instance)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 8)
	c.Parent = parent
end

local open = Instance.new("TextButton")
open.Name = "OpenButton"
open.AnchorPoint = Vector2.new(1, 1)
open.Position = UDim2.new(1, -16, 1, -16)
open.Size = UDim2.fromOffset(140, 36)
open.BackgroundColor3 = Color3.fromRGB(88, 101, 242)
open.TextColor3 = Color3.new(1, 1, 1)
open.Font = Enum.Font.GothamBold
open.TextSize = 14
open.Text = "Link Discord"
corner(open)
open.Parent = gui

local panel = Instance.new("Frame")
panel.Name = "Panel"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromOffset(320, 190)
panel.BackgroundColor3 = Color3.fromRGB(30, 31, 36)
panel.Visible = false
corner(panel)
panel.Parent = gui

local padding = Instance.new("UIPadding")
padding.PaddingTop, padding.PaddingBottom = UDim.new(0, 14), UDim.new(0, 14)
padding.PaddingLeft, padding.PaddingRight = UDim.new(0, 14), UDim.new(0, 14)
padding.Parent = panel

local function label(text: string, y: number, height: number, size: number): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Position = UDim2.fromOffset(0, y)
	l.Size = UDim2.new(1, 0, 0, height)
	l.Font = Enum.Font.Gotham
	l.TextSize = size
	l.TextColor3 = Color3.fromRGB(230, 232, 238)
	l.TextWrapped = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.Text = text
	l.Parent = panel
	return l
end

label("Link your Discord", 0, 22, 18).Font = Enum.Font.GothamBold
label("Run /link in the staff Discord and enter the 6-character code.", 24, 34, 13)

local box = Instance.new("TextBox")
box.Position = UDim2.fromOffset(0, 66)
box.Size = UDim2.new(1, 0, 0, 36)
box.BackgroundColor3 = Color3.fromRGB(45, 47, 54)
box.TextColor3 = Color3.new(1, 1, 1)
box.PlaceholderText = "ABC234"
box.Font = Enum.Font.Code
box.TextSize = 20
box.ClearTextOnFocus = false
box.Text = ""
corner(box)
box.Parent = panel

local status = label("", 106, 32, 13)

local go = Instance.new("TextButton")
go.Position = UDim2.new(0, 0, 1, -32)
go.Size = UDim2.new(0.6, -6, 0, 32)
go.BackgroundColor3 = Color3.fromRGB(88, 101, 242)
go.TextColor3 = Color3.new(1, 1, 1)
go.Font = Enum.Font.GothamBold
go.TextSize = 14
go.Text = "Link"
corner(go)
go.Parent = panel

local close = Instance.new("TextButton")
close.Position = UDim2.new(0.6, 6, 1, -32)
close.Size = UDim2.new(0.4, -6, 0, 32)
close.BackgroundColor3 = Color3.fromRGB(60, 62, 70)
close.TextColor3 = Color3.new(1, 1, 1)
close.Font = Enum.Font.Gotham
close.TextSize = 14
close.Text = "Close"
corner(close)
close.Parent = panel

box:GetPropertyChangedSignal("Text"):Connect(function()
	local cleaned = string.sub(string.upper((string.gsub(box.Text, "[^%w]", ""))), 1, 6)
	if cleaned ~= box.Text then
		box.Text = cleaned
	end
end)

local busy = false
go.Activated:Connect(function()
	if busy then
		return
	end
	busy = true
	go.Text = "Linking…"
	status.TextColor3 = Color3.fromRGB(230, 232, 238)
	status.Text = ""
	local ok, success, message = pcall(submit.InvokeServer, submit, box.Text)
	if ok then
		status.Text = message
		status.TextColor3 = if success then Color3.fromRGB(74, 222, 128) else Color3.fromRGB(248, 113, 113)
		if success then
			box.Text = ""
		end
	else
		status.Text = "Something went wrong. Try again."
	end
	go.Text = "Link"
	busy = false
end)

open.Activated:Connect(function()
	panel.Visible = not panel.Visible
end)
close.Activated:Connect(function()
	panel.Visible = false
end)

local function refresh()
	gui.Enabled = player:GetAttribute("WB_CanLink") == true
end
player:GetAttributeChangedSignal("WB_CanLink"):Connect(refresh)
refresh()

gui.Parent = player:WaitForChild("PlayerGui")
