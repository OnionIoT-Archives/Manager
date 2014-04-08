'use strict';

var rpc = require('./amqp-rpc/amqp_rpc');
var mail = require('./mail');
var request = require('request');
var idgen = require('idgen');
var uuid = require('node-uuid');
var crypto = require('crypto');
var services = require('./services');

var init = function(socketServer) {
	var connections = {};

	socketServer.sockets.on('connection', function(socket) {
		var userInfo = {};
		//connections = socket;
		socket.emit('CONNECTED', {});

		userInfo.socketId = socket.id;

		socket.emit('test', {
			data : 'socket io works'
		});

		socket.on('LOGIN', function(data) {
			rpc.call('DB_GET_USER', {
				email : data.email,
				passHash : data.hash
			}, function(result) {
				if (result != null) {
					var _token = uuid.v1().replace(/-/g, "");
					//var _result = JSON.parse(result);
					userInfo.userId = result._id;
					userInfo.email = result.email;
					connections[userInfo.userId] = socket;

					rpc.call('DB_ADD_SESSION', {
						token : _token,
						userId : result._id
					}, function(data) {
						socket.emit('LOGIN_PASS', {
							token : _token
						});
					});
				} else {
					socket.emit('LOGIN_FAIL');
				}
			});
		});

		socket.on('LOGOUT', function(data) {

			rpc.call('DB_REMOVE_SESSION', data, function(data) {
				socket.emit('LOGOUT_PASS', {});
			});
		});

		socket.on('SIGNUP', function(data) {
			rpc.call('DB_GET_USER', {
				email : data.email
			}, function(result) {
				if (result == null) {
					rpc.call('DB_ADD_USER', {
						email : data.email,
						passHash : data.hash
					}, function(result) {
						socket.emit('SIGNUP_PASS', {
						});
					});
				} else {
					socket.emit('SIGNUP_FAIL', {
					});
				}
			});
		});

		socket.on('CHECK_SESSION', function(data) {

			if (data && data.token) {
				rpc.call('DB_GET_SESSION', {
					token : data.token
				}, function(session) {
					if (session == null) {
						socket.emit('CHECK_SESSION_FAIL', {
						});
					} else {
						userInfo.token = data.token;
						if (session && session.userId) {
							userInfo.userId = session.userId;
							connections[userInfo.userId] = socket;
							rpc.call('DB_GET_USER', {
								_id : userInfo.userId
							}, function(user) {
								if (user) {
									userInfo.email = user.email;
								}
							});
						}
						socket.emit('CHECK_SESSION_PASS', {
						});
					}
				})
			} else {

			}
		});

		socket.on('FORGOT_PASSWORD', function(data) {
			// setup e-mail data with unicode symbols
			var mailOptions = {
				from : "Onion ✔ <harry@onion.io>", // sender address
				to : data.email, // list of receivers
				subject : "Onion:Reset Passwrd", // Subject line
				text : "Http://www.onion.io/changethis", // plaintext body
				html : "<b>Click <a href='#'>here</a> to reset your password</b>" // html body
			}

			// send mail with defined transport object
			mail.smtpTransport.sendMail(mailOptions, function(error, response) {
				if (error) {
					console.log(error);
				} else {
					console.log("Message sent: " + response.message);
				}
			});
		});

		socket.on('LIST_DEVICES', function(data) {
			if (userInfo && userInfo.userId) {
				console.log(userInfo.email);
				data['userId'] = userInfo.userId;
				rpc.call('DB_GET_DEVICE', data, function(devicLists) {
					socket.emit('LIST_DEVICES_PASS', devicLists);
				});
			}
		});

		socket.on('GET_DEVICE', function(data) {
			if (userInfo && userInfo.userId)
				data.userId = userInfo.userId;
			rpc.call('DB_GET_DEVICE', data, function(devicList) {
				socket.emit('GET_DEVICE_PASS', devicList)
			});
		});

		socket.on('ADD_DEVICE', function(data) {
			var _key = idgen(16);
			var id = idgen();
			data.key = _key;
			data.id = id;
			if (userInfo && userInfo.userId)
				data.userId = userInfo.userId;

			rpc.call('DB_ADD_DEVICE', data, function(data) {
				socket.emit('ADD_DEVICE_PASS', {
					id : data.id
				});
				rpc.call('DB_ADD_HISTORY', {
					deviceId : data.id,
					action : 'Device created'
				}, function(data) {

				});
			});
		});

		socket.on('DEVICE_UPDATE', function(data) {
			data.update = {
				$set : {
					'meta.name' : data.update.name,
					'meta.description' : data.update.description,
					'meta.deviceType' : data.update.deviceType
				}
			};

			rpc.call('DB_UPDATE_DEVICE', data, function(device) {
				rpc.call('DB_GET_DEVICE', data.condition, function(devicList) {
					socket.emit('DEVICE_UPDATE_PASS', devicList);
				});
			});
		});

		socket.on('DELETE_DEVICES', function(data) {

			for (var i = 0; i < data.length; i++) {
				rpc.call('DB_DELETE_DEVICE', data[i], function(data) {
					socket.emit('DELETE_DEVICES_PASS', {});
				});
			}

		});

		socket.on('ADD_PROCEDURE', function(data) {
			if (data && data._id || data.id) {
				rpc.call('DB_ADD_PROCEDURE', {
					path : data.path,
					functionId : data.functionId,
					verb : data.verb,
					deviceId : data.id,
					postParams : data.postParams,
					lastAccess : new Date()
				}, function(data) {
				});
			}
		});

		socket.on('GET_PROCEDURE', function(data) {
			rpc.call('DB_GET_PROCEDURE', {}, function(data) {
				socket.emit('GET_PROCEDURE_PASS', data);
			});
		});

		socket.on('GET_STATE', function(data) {
			rpc.call('DB_GET_STATE', {}, function(data) {
				socket.emit('GET_STATE_PASS', data);
			});
		});

		socket.on('UPDATE_STATE', function(data) {
			rpc.call('DB_UPDATE_STATE', data, function(data) {
				socket.emit('UPDATE_STATE_PASS', data);
			});
		});

		socket.on('REMOVE_STATE', function(data) {
			rpc.call('DB_REMOVE_STATE', data, function(e) {
				socket.emit('REMOVE_STATE_PASS', e);
			});
		});

		socket.on('ADD_STATES', function(data) {
			if (data && data.deviceId || data.id) {
				console.log('add state');
				rpc.call('DB_ADD_STATE', data, function(data) {
				});
			}
		});

		socket.on('RENEW_KEY', function(data) {
			var Data = {};
			Data.condition = data;
			var _key = idgen(16);
			Data.update = {
				key : _key
			};
			rpc.call('DB_UPDATE_DEVICE', Data, function(device) {
				socket.emit('RENEW_KEY_PASS', {
					key : _key
				});
			});
		});

		socket.on('USER_UPDATE', function(data) {
			data.condition = {
				_id : userInfo.userId
			};

			rpc.call('DB_GET_USER', {
				_id : userInfo.userId,
				passHash : data.oldPass
			}, function(_user) {
				if (!data.isReset || _user) {
					rpc.call('DB_UPDATE_USER', data, function(user) {
						socket.emit('USER_UPDATE_PASS', {});
					});

				} else if (data.isReset && !data.update.passHash) {
					socket.emit('USER_UPDATE_FAIL', {});
				} else {
					socket.emit('USER_UPDATE_FAIL', {});
				}
			});

		});

		socket.on('GET_USER', function(data) {
			rpc.call('DB_GET_USER', {
				_id : userInfo.userId
			}, function(user) {
				socket.emit('GET_USER_PASS', user);
			});
		});

		socket.on('GET_HISTORY', function(data) {
			console.log('GET_HISTORY');
			rpc.call('DB_GET_HISTORY', {
				deviceId : data.deviceId
			}, function(his) {

				socket.emit('GET_HISTORY_PASS', his);
			});
		});

		socket.on('ADD_HISTORY', function(data) {

			rpc.call('DB_ADD_HISTORY', data, function(result) {

				socket.emit('ADD_HISTORY_PASS', result);
			});
		});

		socket.on('FORUMS_SETUP', function() {
			rpc.call('DB_GET_USER', {
				_id : userInfo.userId
			}, function(user) {
				var timestamp = Math.round(+new Date / 1000);

				var gravatarHash = crypto.createHash('md5');
				gravatarHash.update(user.email);
				var gravatarUrl = '//gravatar.com/avatar/' + gravatarHash.digest('hex') + '?d=identicon';

				var message = (new Buffer(JSON.stringify({
					user : {
						id : user.email,
						displayname : user.fullname || user.email,
						email : user.email,
						avatar : gravatarUrl,
						is_admin : !!user.admin
					}
				}))).toString('base64');

				var signatureHash = crypto.createHash('sha1');
				signatureHash.update('vV8MtWdvEJ2lpBanvYhUpNwJ' + ' ' + message + ' ' + timestamp);
				var signature = signatureHash.digest('hex');

				socket.emit('FORUMS_SETUP_PASS', {
					timestamp : timestamp,
					message : message,
					signature : signature
				});
			});
		});

		socket.on('ADD_TRIGGER', function(data) {
			rpc.call('DB_ADD_TRIGGER', data, function(e) {
				console.log('add trigger pass');
				socket.emit('ADD_TRIGGER_PASS');
			});
		});

		socket.on('UPDATE_TRIGGER', function(data) {
			rpc.call('DB_UPDATE_TRIGGER', data, function(e) {
				socket.emit('UPDATE_TRIGGER_PASS', {});
			});
		});

		socket.on('REMOVE_TRIGGER', function(data) {
			rpc.call('DB_REMOVE_TRIGGER', data, function(e) {
				console.log(e);
				socket.emit('REMOVE_TRIGGER_PASS');
			});
		});

		socket.on('GET_TRIGGER', function(data) {
			console.log('get trigger');
			//TODO:use this DB_GET_TRIGGER_WITHSTATE
			rpc.call('DB_GET_TRIGGER', data, function(e) {
				var k = 0;
				console.log(e);
				pushState();
				function pushState() {
					if (e[k] && e[k].stateID) {
						rpc.call('DB_GET_STATE', {
							_id : e[k].stateID
						}, function(state) {
							if (k < e.length) {
								e[k].state = {};
								e[k].state = state[0];
								k++;
								pushState();
							} else {

							}
						});
					} else {
						console.log('get trigger pass');
						socket.emit('GET_TRIGGER_PASS', e);
					}
				};

			});
		});

		socket.on('TRIGGER', function(data) {

			rpc.call('DB_GET_TRIGGER_WITHSTATE', data, function(e) {
				for (var i = 0; i < e.length; i++) {
					if (e[i] && e[i].postUrl) {
						var options = {
							uri : e[i].postUrl,
							strictSSL : false,
							method : "POST",
							form : e[i].state
						};
						request(options, function(error, response, body) {
							if (!error && response.statusCode == 200) {
								console.log('Post success');
								socket.emit('TRIGGER_PASS', {
									response : response,
									body : body
								});
							} else {
								console.log(error);
							};
						});
					};
				};
			});
		});

		socket.on('realtime', function(e) {
			console.log(Object.keys(connections).length)
			rpc.call('DB_GET_TRIGGER_WITHSTATE', {
				deviceId : 'AbYrsuO2'
			}, function(data) {

			});
		});

	});

	rpc.register('REALTIME_UPDATE_HISTORY', function(p, callback) {
		var email;
		var userId;
		rpc.call('DB_GET_DEVICE', {
			id : p.deviceId
		}, function(device) {
			userId = device.userId;

			rpc.call('DB_GET_HISTORY', {
				deviceId : p.deviceId
			}, function(his) {
				console.log('history pass');
				if (connections && connections[userId]) {
					connections[userId].emit('GET_HISTORY_PASS', his);
				}
			});
		});
		callback({});
	});

	rpc.register('REALTIME_UPDATE_PROCEDURE', function(p, callback) {

		var email;
		var userId;
		rpc.call('DB_GET_DEVICE', {
			id : p.deviceId
		}, function(device) {
			console.log(device);
			userId = device.userId;
			if(connections&&connections[userId]&&connections[userId].emit)connections[userId].emit('GET_DEVICE_PASS', device);
		});
		callback({});
	});

	rpc.register('REALTIME_UPDATE_STATE', function(p, callback) {
		var email;
		var userId;
		if (p.deviceId) {
			updateState(p.deviceId);
		} else if (p.update && p.update.deviceId) {
			updateState(p.update.deviceId);
		}
		function updateState(deviceid) {
			rpc.call('DB_GET_DEVICE', {
				id : deviceid
			}, function(device) {
				rpc.call('DB_GET_TRIGGER', {
					stateID : device.states._id
				}, function(e) {
					for(var k=0;k<e.length;k++){
						pushBullet(e,k);
					}
					
				});
				function pushBullet(e,index) {
					var options = {
						uri : e[index].postUrl,
						strictSSL : false,
						method : "POST",
						form : e[index].state
					};
					request(options, function(error, response, body) {
						if (!error && response.statusCode == 200) {
							
						} else {
							console.log(error);
						};
					});
				}

				userId = device.userId;
				if (userId && connections && connections[userId])
					connections[userId].emit('GET_DEVICE_PASS', device);
			});
		}

		callback({});
	});
};

module.exports = {
	init : init
};
