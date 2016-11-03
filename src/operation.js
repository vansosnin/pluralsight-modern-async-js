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
    return new Operation((resolve, reject) => {
        getCurrentCity((error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        });
    });
}

function fetchWeather(city) {
    return new Operation((resolve, reject) => {
        getWeather(city, (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        });
    });
}

function fetchForecast(city) {
    return new Operation((resolve, reject) => {
        getForecast(city, (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        });
    });
}

function Operation(executor) {
    const noop = function() {
    };

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
                    let cbResult;
                    try {
                        cbResult = onSuccess(operation.result);
                    } catch (e) {
                        proxyOp.reject(e);
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
                    let cbResult;
                    try {
                        cbResult = onError(operation.error);
                    } catch (e) {
                        proxyOp.reject(e);
                        return;
                    }
                    proxyOp.resolve(cbResult);
                } else {
                    proxyOp.reject(operation.error);
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

    function internalResolve(value) {
        if (value && value.then) {
            value.then(internalResolve, internalReject);
            return;
        }

        operation.state = "succeeded";
        operation.result = value;
        operation.onSuccess.forEach(cb => cb(value));
    }

    operation.resolve = value => {
        if (operation.resolved === true) {
            return;
        }
        operation.resolved = true;

        internalResolve(value);
    };

    operation.reject = error => {
        if (operation.resolved === true) {
            return;
        }
        operation.resolved = true;
        internalReject(error);
    };

    function internalReject(error) {
        operation.state = "failed";
        operation.error = error;
        operation.onError.forEach(cb => cb(error));
    }

    if (executor) {
        executor(operation.resolve, operation.reject);
    }

    return operation;
}

Operation.resolve = value => new Operation(resolve => {
    resolve(value);
});

Operation.reject = reason => new Operation((resolve, reject) => {
    reject(reason);
});

function doLater(func) {
    setTimeout(func, 1);
}

function fetchCurrentCityThatFails() {
    const cityOp = new Operation();
    doLater(() => {
        cityOp.reject(new Error("GPS broken"))
    });
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
        operation.reject(new Error("reject 1"));
        operation.reject(new Error("reject 2"));
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
    Operation
        .resolve("New York, NY")
        .then(city => doneAlias());

    const doneAlias = done;
});

test("ensure error handlers are async", done => {
    Operation
        .reject(new Error("oops"))
        .catch(e => doneAlias());

    const doneAlias = done;
});

test("protect from doubling up on success", () => {
    return fetchCurrentCityIndecisive();
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

test("sync result transformation", () => {
    return fetchCurrentCity()
        .then(() => {
            return "10019";
        })
        .then(zip => {
            expect(zip).toBe("10019");
        });
});

test("async error recovery", () => {
    return fetchCurrentCityThatFails()
        .catch(() => {
            return fetchCurrentCity();
        })
        .then(city => {
            expect(city).toBe(expectedCity);
        });
});

test("sync error recovery", () => {
    return fetchCurrentCityThatFails()
        .catch(() => {
            return "default city";
        })
        .then(city => {
            expect(city).toBe("default city");
        });
});

test("error recovery bypassed if not needed", () => {
    return fetchCurrentCity()
        .catch(() => {
            return "default city";
        })
        .then(city => {
            expect(city).toBe(expectedCity);
        });
});

test("error fallthrough", () => {
    return fetchCurrentCityThatFails()
        .then(city => {
            console.log(city);
            return fetchForecast(city);
        })
        .then(forecast => {
            expect(forecast).toBe(expectedForecast);
        })
        .catch(error => {});
});

test("life is full off async, nesting is inevitable, let's do something about it", () => {
    return fetchCurrentCity()
        .then(city => fetchWeather(city))
        .then(weather => {});
});

test("lexical parallelism", () => {
    const city = "NYC";
    const weatherOp = fetchWeather(city);
    const forecastOp = fetchForecast(city);

    return weatherOp.then(weather => {
        forecastOp.then(forecast => {});
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
