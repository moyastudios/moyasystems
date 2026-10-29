export type GameContext = { sessionId: string; jobId: string; placeId: bigint };
export type AppEnv = { Variables: { ip: string | null; game: GameContext; rawBody: string } };
