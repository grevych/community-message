var webSocket = require("ws")
var http = require("http")
var express = require("express")
var expressSession = require('express-session');
var helmet = require('helmet');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var uuid = require('uuid');
var redis = require("redis");
var path = require('path');
var { promisify } = require("util");


var cookieSecret = process.env.COOKIE_SECRET || 'egassem-ytinummoc';
var cookieName = process.env.COOKIE_NAME || 'community-message';
var cookieDomain = process.env.COOKIE_DOMAIN || '.community-message.local';
var cookieSecure = process.env.COOKIE_SECURE || false;
var webServerPort = process.env.WEB_SERVER_PORT || 8080;
var redisURI = process.env.REDIS_URI || 'redis://localhost:6379';
var channelsKey = 'channels';
var channelId = uuid.v4();
var time = null;

var redisClient = redis.createClient({ url: redisURI });
var redisClientGet = promisify(redisClient.get).bind(redisClient);
var redisClientMGet = promisify(redisClient.mget).bind(redisClient);
var redisClientSet = promisify(redisClient.set).bind(redisClient);
var redisClientMSet = promisify(redisClient.mset).bind(redisClient);
var redisSubscriber = redisClient.duplicate();
var redisPublisher = redisClient.duplicate();
var app = express();
// app.use(helmet());
app.use(cors({
}));
app.use(expressSession({
	secret: cookieSecret,
	cookie: { secure: cookieSecure },
	resave: false,
	saveUninitialized: true
}));
app.use(cookieParser());
app.set('views', './views')
app.set('view engine', 'pug')
app.use('/static', express.static(__dirname + "/public/"));
app.get('/', async function(req, res) {
	var connectionId = req.cookies[cookieName] || uuid.v4();
	var connection = await redisClientGet(connectionId);

	if (!connection) {
		await redisClientSet(connectionId, `connected@${(new Date()).getTime()}`);
	}

	var votes = (await redisClientMGet(time))[0];

	res.cookie(
		cookieName,
		connectionId,
		{ httpOnly: true, secure: cookieSecure, domain: cookieDomain }
	);

	// res.sendFile(path.join(__dirname+'/public/index.html'));
	res.render('index', { connectionId, votes })
});

var server = http.createServer(app);
var wss = new webSocket.Server({ server });
wss.on('connection', function(ws, { url }) {
	ws.on('message', async function(message) {
		var connectionId = url.slice(1);
		var connection = await redisClientGet(connectionId);

		// Connexiones antes de timepo
		if (time === null) {
			ws.terminate();
			return
		}

		// Mensajes no esperados
		if (message !== time) {
			ws.terminate();
			redisClient.del(connectionId);
			return
		}

		// Doble votacion
		if (parseInt(message) == parseInt(connection)) {
			console.log('VOTO DOBLE');
		}

		redisClientMSet(connectionId, message);
		redisClient.incr(time);
	});
});

redisClient.on('ready', async function(error) {
	var channels = (await redisClientMGet(channelsKey))[0];

	if (!channels) {
		channels = '';
	}

	await redisClientMSet(channelsKey, channels + ' ' + channelId);

	time = (await redisClientMGet('time'))[0];
	console.log('current time in db', time);

	server.listen(webServerPort)
	console.log("Server listening on %d", webServerPort)
})

redisSubscriber.on('message', async function(channel, message) {
	await redisClientMSet('time', message);

	var currentConnections

	if (time) {
		currentConnections = (await redisClientMGet(`${time}`))[0];
	} else {
		currentConnections = 0;
	}

	time = message

	wss.clients.forEach((client) => {
		if (client.readyState === webSocket.OPEN) {
			client.send(`${currentConnections || 0}-${time}`)
		} else {
			client.terminate();
		}
	})

});

redisSubscriber.subscribe('TIME');

redisClient.on('error', function(error) {
	console.error('Redis down!', error.message);
});


// Gracefull shutdown
var shutdown = require('./shutdown')(wss, server, {
	client: redisClient,
	subscriber: redisSubscriber,
	publisher: redisPublisher,
})
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
