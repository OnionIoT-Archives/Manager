'use strict';

var services = angular.module('manager.services', []);

services.constant('tabItems', [
	{
		title: 'Dashboard',
		icon: 'dashboard',
		sref: 'cp.dashboard'
	},
	{
		title: 'Devices',
		icon: 'puzzle-piece',
		sref: 'cp.devices.list'
	},
	{
		title: 'Services',
		icon: 'tasks',
		sref: 'cp.services'
	},
	{
		title: 'Settings',
		icon: 'cogs',
		sref: 'cp.settings'
	}
]);

services.constant('userProfile', {
	email: 'bl@onion.io'
});

services.factory('auth', ['$rootScope', '$state', 'localStorageService', 'socket', 'sha3', function ($rootScope, $state, localStorageService, socket, sha3) {
	$rootScope.loggedIn = false;

	// Callbacks to check if system still logged in and log out if not
	var check = function () {
		if ($rootScope.loggedIn === true && $state.current.name === 'login') $state.go('cp.dashboard');
		else if ($rootScope.loggedIn === false && $state.current.name !== 'login') $state.go('login');
	};

	$rootScope.$watch('loggedIn', check, true);
	$rootScope.$on('$stateChangeSuccess', check);

	// Get token and check against server to see if session has expired
	var token = localStorageService.get('OnionSessionToken');
	if (token) {
		socket.on('CONNECTED', function () {
			socket.removeAllListeners('CONNECTED');

			socket.rpc('CHECK_SESSION', {
				token: token
			}, function () {
				$rootScope.session.loggedIn = true;
			}, function () {
				$rootScope.session.loggedIn = false;
				localStorageService.clearAll();
			});
		});
	}

	var login = function (email, password, passCallback, failCallback) {
		if (!passCallback) passCallback = angular.noop;
		if (!failCallback) passCallback = angular.noop;
		var passwordHash = sha3(password);

		socket.rpc('LOGIN', {
			email: email,
			hash: passwordHash
		}, function (data) {
			localStorageService.add('OnionSessionToken', data.token);
			$rootScope.loggedIn = true;
			passCallback();
		}, function (data) {
			failCallback();
		});
	};

	var logout = function () {
		socket.rpc('LOGOUT', {
			token: token
		}, function () {
			localStorageService.clearAll();
			$rootScope.loggedIn = false;
		});
	};

	return {
		login: login,
		logout: logout
	};
}]);

services.factory('socket', ['$rootScope', function ($rootScope) {
	if (angular.isDefined(window.io)) {
		var socket = io.connect();
		return {
			on: function (eventName, callback) {
				socket.on(eventName, function () {  
					var args = arguments;
					$rootScope.$apply(function () {
						callback.apply(socket, args);
					});
				});
			},
			removeAllListeners: socket.removeAllListeners,
			emit: function (eventName, data, callback) {
				socket.emit(eventName, data, function () {
					var args = arguments;
					$rootScope.$apply(function () {
						if (callback) {
							callback.apply(socket, args);
						}
					});
				})
			},
			rpc: function (functionName, data, callback, passCallback, failCallback) {
				// callback is optional 
				if (!passCallback) {
					passCallback = callback;
					callback = angular.noop;
				}

				if (!failCallback) {
					failCallback = passCallback;
					passCallback = callback;
					callback = angular.noop;
				}

				var removeListeners = function () {
					socket.removeAllListeners('functionName' + '_PASS');
					socket.removeAllListeners('functionName' + '_FAIL');
				};

				socket.on(functionName + '_PASS', function (data) {
					passCallback(data);
					removeListeners();
				});

				socket.on(functionName + '_FAIL', function (data) {
					failCallback(data);
					removeListeners();
				});

				socket.emit(functionName, data);
			}
		};
	}
}]);

services.factory('sha3', [function () {
	if (angular.isDefined(window.CryptoJS.SHA3)) {
		return function (message) {
			return CryptoJS.SHA3(message, {outputLength: 256}).toString(CryptoJS.enc.Hex);
		};
	}
}]);
