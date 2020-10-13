// Client
document.addEventListener("DOMContentLoaded", function(event) {
	var host = location.origin.replace(/^http/, 'ws')
	var body = document.getElementsByTagName('body')[0]
	var connectionId = body.getAttribute('id')
	var ws = new WebSocket(host + `/${connectionId}`);
	console.log(ws);

	var div = document.createElement('div');
	
	ws.onconnection = function(event) {
		console.log(event)
	}

	ws.onmessage = function (event) {
		console.log(event)
		console.log(event.data)
		var [cc, tm] = event.data.split('-')

		div.innerHTML = cc;
		body.appendChild(div);
		ws.send(tm)
	};
});
