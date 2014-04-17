'use strict';

var services = angular.module('manager.services', []);

services.factory('test', ['$rootScope', '$http',
function($rootScope, $http) {
	var logs = [];

	$rootScope.logs = logs;

	var doTest = function(path, data) {
		if (path.indexOf('api.onion.io') !== -1) {
			var timestamp = new Date();

			if (angular.equals(data, {})) {
				// GET
				$http.get(path).success(function(data, status) {
					logs.push({
						timestamp : timestamp.toLocaleString(),
						data : JSON.stringify(data)
					});
				});
			} else {
				// POST
				$http.post(path, data).success(function(data, status) {
					logs.push({
						timestamp : timestamp.toLocaleString(),
						data : JSON.stringify(data)
					});
				});
			}
		}
	};

	return {
		doTest : doTest,
		logs : logs
	};
}]);

services.factory('auth', ['$rootScope', '$state', 'localStorageService', 'socket', 'sha3',
function($rootScope, $state, localStorageService, socket, sha3) {
	$rootScope.loggedIn = false;

	// Callbacks to check if system still logged in and log out if not
	var check = function() {
		if ($rootScope.loggedIn === true && $state.current.name === 'login')
			$state.go('cp.devices.list');
		else if ($rootScope.loggedIn === false && $state.current.name !== 'login')
			$state.go('login');
	};

	$rootScope.$watch('loggedIn', check);
	$rootScope.$on('$stateChangeSuccess', check);

	// Get token and check against server to see if session has expired
	var token = localStorageService.get('OnionSessionToken');
	if (token) {
		socket.on('CONNECTED', function() {
			socket.removeAllListeners('CONNECTED');
			socket.rpc('CHECK_SESSION', {
				token : token
			}, function() {
				$rootScope.loggedIn = true;
			}, function() {
				$rootScope.loggedIn = false;
				localStorageService.clearAll();
			});
		});
	}

	var login = function(email, password, passCallback, failCallback) {
		if (!passCallback)
			passCallback = angular.noop;
		if (!failCallback)
			passCallback = angular.noop;
		var passwordHash = sha3(password);

		socket.rpc('LOGIN', {
			email : email,
			hash : passwordHash
		}, function(data) {
			localStorageService.add('OnionSessionToken', data.token);

			$rootScope.loggedIn = true;
			passCallback();
		}, function(data) {
			failCallback();
		});
	};

	var logout = function() {
		var token = localStorageService.get('OnionSessionToken');
		socket.rpc('LOGOUT', {
			token : token
		}, function() {
			localStorageService.clearAll();
			$rootScope.loggedIn = false;
		});
	};

	return {
		login : login,
		logout : logout
	};
}]);

services.factory('socket', ['$rootScope', 'blockUI',
function($rootScope, blockUI) {
	if (angular.isDefined(window.io)) {
		var socket = io.connect();

		//use this if you need the socket listening all the time
		var on = function(eventName, callback) {
			socket.on(eventName, function(data) {
				callback(data);
			});
		};

		var once = function(eventName, callback) {
			socket.on(eventName, function(data) {
				socket.removeAllListeners(eventName);
				callback(data);
			});
		};

		var emit = function(eventName, data, callback) {
			if (!callback)
				callback = angular.noop;
			socket.emit(eventName, data, function(data) {
				callback(data);
			})
		};
		//use this functions to register the socket once only
		var rpc = function(functionName, data, passCallback, failCallback) {
			if ( typeof data === 'function') {
				failCallback = passCallback;
				passCallback = data;
				data = {};
			}

			if (!failCallback) {
				failCallback = angular.noop;
			}

			var removeListeners = function() {
				socket.removeAllListeners(functionName + '_PASS');
				socket.removeAllListeners(functionName + '_FAIL');
			};

			socket.on(functionName + '_PASS', function(data) {
				$rootScope.$apply(function() {
					passCallback(data);
				});
				removeListeners();
			});

			socket.on(functionName + '_FAIL', function(data) {
				$rootScope.$apply(function() {
					failCallback(data);
				});
				removeListeners();
			});
			socket.emit(functionName, data);
		};

		return {
			on : on,
			once : once,
			emit : emit,
			rpc : rpc,
			removeAllListeners : socket.removeAllListeners
		};
	}
}]);

services.factory('marked', [
function() {
	if (angular.isDefined(window.marked)) {
		var marked = window.marked;
		marked.setOptions({
			renderer : new marked.Renderer(),
			gfm : true,
			tables : true,
			breaks : true,
			pedantic : false,
			sanitize : true,
			smartLists : true,
			smartypants : true
		});
		return marked;
	}
}]);

services.factory('sha3', [
function() {
	if (angular.isDefined(window.CryptoJS.SHA3)) {
		return function(message) {
			return CryptoJS.SHA3(message, {
				outputLength : 256
			}).toString(CryptoJS.enc.Hex);
		};
	}
}]);
