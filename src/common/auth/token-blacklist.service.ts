import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createConnection, Socket } from "node:net";
import { ENV } from "src/config/env";

@Injectable()
export class TokenBlacklistService implements OnModuleDestroy {
	private readonly local = new Map<string, number>();
	private socket?: Socket;
	private connected = false;
	private readonly redisUrl = ENV.REDIS_URL;
	private connect() {
		if (!this.redisUrl || this.socket) return;
		const url = new URL(this.redisUrl);
		this.socket = createConnection({
			host: url.hostname,
			port: Number(url.port || 6379),
		});
		this.socket.on("connect", () => (this.connected = true));
		this.socket.on("error", () => {
			this.connected = false;
			this.socket?.destroy();
			this.socket = undefined;
		});
	}
	async blacklist(jti: string, expiresAt: number) {
		const ttl = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
		this.local.set(jti, expiresAt);
		this.connect();
		if (this.connected)
			this.socket?.write(`SET auth:blacklist:${jti} 1 EX ${ttl}\r\n`);
	}
	async isBlacklisted(jti: string) {
		const expiry = this.local.get(jti);
		if (expiry && expiry > Math.floor(Date.now() / 1000)) return true;
		if (expiry) this.local.delete(jti);
		return false;
	}
	onModuleDestroy() {
		this.socket?.destroy();
	}
}
