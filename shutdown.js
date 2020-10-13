var webSocket = require("ws")

module.exports = (wss, server, redis) =>
	() => {
		console.log('Gracefully shutting down');

		// Close websockets
		wss.clients.forEach((client) => {
			client.terminate()
			process.nextTick(() => {
				if ([webSocket.OPEN, webSocket.CLOSING].includes(client.readyState)) {
					// Socket hangs, force close
					client.terminate();
				}
			});
		});

		server.close(() => {
			console.log('Http server closed.');

			redis.client.quit(() => {
				console.log('Redis connection closed.');

				process.exit(0);
			});

			redis.subscriber.quit();
			redis.publisher.quit();
		});
	};
