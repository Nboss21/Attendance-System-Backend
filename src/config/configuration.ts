import { envSchema } from "./env.schema";

const env = envSchema.parse(process.env);

export default () => ({
	nodeEnv: env.NODE_ENV,
	port: env.PORT,

	database: {
		url: env.DATABASE_URL,
	},

	jwt: {
		secret: env.JWT_SECRET,
		accessTtl: env.JWT_ACCESS_TTL_SECONDS,
		refreshTtl: env.JWT_REFRESH_TTL_SECONDS,
	},

	redis: {
		url: env.REDIS_URL,
	},
});
