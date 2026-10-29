--!strict
-- Deployment settings only. Everything about ranks, permissions and quota comes from the API.
return {
	BaseUrl = "https://api.moya-studios.xyz",
	-- Name of the secret in Creator Dashboard → Secrets (domain: api.moya-studios.xyz).
	SecretName = "westbridge_api",
	MessagingTopic = "westbridge",
	Concurrency = 3,
	MaxAttempts = 4,
	-- HttpService allows 500 requests/minute per server; stay well under it.
	RequestsPerMinute = 300,
	RequestTimeoutRetrySeconds = 1,
}
