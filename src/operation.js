const delayms = 1;
const expectedCity = "New York, NY";
const expectedForecast = {
    fiveDay: [60, 70, 80, 45, 50]
};

function getCurrentCity(callback) {
    setTimeout(function() {

        callback(null, expectedCity);

    }, delayms)
}

function getWeather(city, callback) {
    setTimeout(function() {

        if (!city) {
            callback(new Error("City required to get weather"));
            return;
        }

        const weather = {
            temp: 50
        };

        callback(null, weather)

    }, delayms)
}

function getForecast(city, callback) {
    setTimeout(function() {

        if (!city) {
            callback(new Error("City required to get forecast"));
            return;
        }

        callback(null, expectedForecast)

    }, delayms)
}

suite.only("operations");

function fetchCurrentCity() {
    const operation = new Operation();
    getCurrentCity(operation.nodeCallback);

    return operation;
}

function fetchWeather(city) {
    const operation = new Operation();
    getWeather(city, operation.nodeCallback);

    return operation;
}

function fetchForecast(city) {
    const operation = new Operation();
    getForecast(city, operation.nodeCallback);

    return operation;
}

function Operation() {
    const noop = function() {};

    const operation = {
        state: null,
        result: null,
        error: null,
        onSuccess: [],
        onError: []
    };

    operation.then = (onSuccess, onError) => {
        const proxyOp = new Operation();

        function successHandler() {
            doLater(() => {
                if (onSuccess) {
                    let cbResult
                    try {
                        cbResult = onSuccess(operation.result);
                    } catch (e) {
                        proxyOp.fail(e);
                        return;
                    }
                    proxyOp.resolve(cbResult);
                } else {
                    proxyOp.resolve(operation.result);
                }
            });
        }

        function failureHandler() {
            doLater(() => {
                if (onError) {
                    let cbResult
                    try {
                        cbResult = onError(operation.error);
                    } catch (e) {
                        proxyOp.fail(e);
                        return;
                    }
                    proxyOp.resolve(cbResult);
                } else {
                    proxyOp.fail(operation.error);
                }
            });
        }

        if (operation.state === "succeeded") {
            successHandler();
        } else if (operation.state === "failed") {
            failureHandler();
        } else {
            operation.onSuccess.push(successHandler);
            operation.onError.push(failureHandler);
        }

        return proxyOp;
    };
    operation.catch = onError => {
        return operation.then(null, onError);
    };
    operation.nodeCallback = (error, result) => {
        if (error) {
            operation.reject(error);
            return;
        }
        operation.resolve(result);
    };

    function internalResolve(value) {
        if (value && value.then) {
            value.then(internalResolve, internalReject);
            return;
        }

        operation.state = "succeeded";
        operation.result = value;
        operation.onSuccess.forEach(cb => cb(value));
    };
    operation.resolve = value => {
        if (operation.complete === true) {
            return;
        }
        operation.complete = true;

        internalResolve(value);
    };

    operation.fail = error => {
        if (operation.complete === true) {
            return;
        }
        operation.complete = true;
        internalReject(error);
    };
    operation.reject = operation.fail;
    function internalReject(error) {
        operation.state = "failed";
        operation.error = error;
        operation.onError.forEach(cb => cb(error));
    }

    return operation;
}

function doLater(func) {
    setTimeout(func, 1);
}

function fetchCurrentCityThatFails() {
    const cityOp = new Operation();
    doLater(() => {cityOp.fail(new Error("GPS broken"))});
    return cityOp;
}

function fetchCurrentCityIndecisive() {
    const operation = new Operation();
    doLater(() => {
        operation.resolve("NYC");
        operation.resolve("Philly");
    });
    return operation;
}

function fetchCurrentCityRepeatedFailures() {
    const operation = new Operation();
    doLater(() => {
        operation.fail(new Error("fail 1"));
        operation.fail(new Error("fail 2"));
    });
    return operation;
}


test("what is resolve", done => {
    const fetchCurrentCity = new Operation();
    fetchCurrentCity.resolve("NYC");

    const fetchClone = new Operation();
    fetchClone.resolve(fetchCurrentCity);

    fetchClone.then(city => {
        expect(city).toBe("NYC");
        done();
    });
});

test("ensure success handlers are async", done => {
    const operation = new Operation();
    operation.resolve("New York, NY");
    operation.then(city => doneAlias());

    const doneAlias = done;
});

test("ensure error handlers are async", done => {
    const operation = new Operation();
    operation.fail(new Error("oops"));
    operation.catch(e => doneAlias());

    const doneAlias = done;
});

test("protect from doubling up on success", done => {
    fetchCurrentCityIndecisive()
        .then(e => done());
});

test("protect from doubling up on failure", done => {
    fetchCurrentCityRepeatedFailures()
        .catch(e => done());
});

test("error, error recovery", done => {
    fetchCurrentCity()
        .then(city => {
            throw new Error("whoops");
            return fetchWeather(city);
        })
        .catch(e => {
            expect(e.message).toBe("whoops");
            throw new Error("whoops #2");
        })
        .catch(e => {
            expect(e.message).toBe("whoops #2");
            done();
        });
});

test("thrown error recovery", done => {
    fetchCurrentCity()
        .then(city => {
            throw new Error("whoops");
            return fetchWeather(city);
        })
        .catch(e => done());
});

test("reusing error handlers - errors anywhere", done => {
    fetchCurrentCity()
        .then(city => {
            return fetchForecast();
        })
        .then(forecast => {
            expect(forecast).toBe(expectedForecast);
        })
        .catch(e => done());
});

test("sync result transformation", done => {
    fetchCurrentCity()
        .then(city => {
            return "10019";
        })
        .then(zip => {
            expect(zip).toBe("10019");
            done();
        });
});

test("async error recovery", done => {
    fetchCurrentCityThatFails()
        .catch(() => {
            return fetchCurrentCity();
        })
        .then(city => {
            expect(city).toBe(expectedCity);
            done();
        });
});

test("sync error recovery", done => {
    fetchCurrentCityThatFails()
        .catch(() => {
            return "default city";
        })
        .then(city => {
            expect(city).toBe("default city");
            done();
        });
});

test("error recovery bypassed if not needed", done => {
    fetchCurrentCity()
        .catch(() => {
            return "default city";
        })
        .then(city => {
            expect(city).toBe(expectedCity);
            done();
        });
});

test("error fallthrough", done => {
    fetchCurrentCityThatFails()
        .then(city => {
            console.log(city);
            return fetchForecast(city);
        })
        .then(forecast => {
            expect(forecast).toBe(expectedForecast);
        })
        .catch(error => {
            done();
        });
});

test("life is full off async, nesting is inevitable, let's do something about it", done => {
    fetchCurrentCity()
        .then(city => fetchWeather(city))
        .then(weather => done());
});

test("lexical parallelism", done => {
    const city = "NYC";
    const weatherOp = fetchWeather(city);
    const forecastOp = fetchForecast(city);

    weatherOp.then(weather => {
        forecastOp.then(forecast => {
            done();
        });
    });
});

test("register success callback async", done => {
    const operationThatSucceeds = fetchCurrentCity();

    doLater(() => {
        operationThatSucceeds.then(() => done());
    });
});

test("register error callback async", done => {
    const operationThatErrors = fetchWeather();

    doLater(() => {
        operationThatErrors.catch(() => done());
    });
});

test("noop if no success handler passed", function(done) {
    const operation = fetchCurrentCity();

    operation.catch(error => done(error));
    operation.then(result => done());
});

test("noop if no error handler passed", function(done) {
    const operation = fetchWeather();

    operation.then(result => done(new Error("shouldn't succeed")));
    operation.catch(error => done());
});

test("pass multiple callbacks - all of them are called", function(done) {
    const operation = fetchCurrentCity();
    const multiDone = callDone(done).afterTwoCalls();

    operation.then(result => multiDone());
    operation.then(result => multiDone());
});

test("fetchCurrentCity pass the callbacks later on", function(done) {
    const operation = fetchCurrentCity();
    operation.then(result => done());
    operation.catch(error => done(error));
});
