(function() {
    "use strict";

    /**
    * via https://github.com/trek/FakeXMLHttpRequest
    *
    * Minimal Event interface implementation
    *
    * Original implementation by Sven Fuchs: https://gist.github.com/995028
    * Modifications and tests by Christian Johansen.
    *
    * @author Sven Fuchs (svenfuchs@artweb-design.de)
    * @author Christian Johansen (christian@cjohansen.no)
    * @license BSD
    *
    * Copyright (c) 2011 Sven Fuchs, Christian Johansen
    */

    var HttpRequestEvent = function Event(type, bubbles, cancelable, target) {
        this.type = type;
        this.bubbles = bubbles;
        this.cancelable = cancelable;
        this.target = target;
    };

    HttpRequestEvent.prototype = {
        stopPropagation: function () {},
        preventDefault: function () {
            this.defaultPrevented = true;
        }
    };

    /*
    Used to set the statusText property of an xhr object
    */
    var httpStatusCodes = {
        100: "Continue",
        101: "Switching Protocols",
        200: "OK",
        201: "Created",
        202: "Accepted",
        203: "Non-Authoritative Information",
        204: "No Content",
        205: "Reset Content",
        206: "Partial Content",
        300: "Multiple Choice",
        301: "Moved Permanently",
        302: "Found",
        303: "See Other",
        304: "Not Modified",
        305: "Use Proxy",
        307: "Temporary Redirect",
        400: "Bad Request",
        401: "Unauthorized",
        402: "Payment Required",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        406: "Not Acceptable",
        407: "Proxy Authentication Required",
        408: "Request Timeout",
        409: "Conflict",
        410: "Gone",
        411: "Length Required",
        412: "Precondition Failed",
        413: "Request Entity Too Large",
        414: "Request-URI Too Long",
        415: "Unsupported Media Type",
        416: "Requested Range Not Satisfiable",
        417: "Expectation Failed",
        422: "Unprocessable Entity",
        500: "Internal Server Error",
        501: "Not Implemented",
        502: "Bad Gateway",
        503: "Service Unavailable",
        504: "Gateway Timeout",
        505: "HTTP Version Not Supported"
    };


    /*
    Cross-browser XML parsing. Used to turn
    XML responses into Document objects
    Borrowed from JSpec
    */
    function parseXML(text) {
        var xmlDoc;

        if (typeof DOMParser != "undefined") {
            var parser = new DOMParser();
            xmlDoc = parser.parseFromString(text, "text/xml");
        } else {
            xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = "false";
            xmlDoc.loadXML(text);
        }

        return xmlDoc;
    }

    /*
    Without mocking, the native XMLHttpRequest object will throw
    an error when attempting to set these headers. We match this behavior.
    */
    var unsafeHeaders = {
        "Accept-Charset": true,
        "Accept-Encoding": true,
        "Connection": true,
        "Content-Length": true,
        "Cookie": true,
        "Cookie2": true,
        "Content-Transfer-Encoding": true,
        "Date": true,
        "Expect": true,
        "Host": true,
        "Keep-Alive": true,
        "Referer": true,
        "TE": true,
        "Trailer": true,
        "Transfer-Encoding": true,
        "Upgrade": true,
        "User-Agent": true,
        "Via": true
    };

    /*
    Adds an "event" onto the fake xhr object
    that just calls the same-named method. This is
    in case a library adds callbacks for these events.
    */
    function _addEventListener(eventName, xhr){
        xhr.addEventListener(eventName, function (event) {
            var listener = xhr["on" + eventName];

            if (listener && typeof listener == "function") {
                listener(event);
            }
        });
    }

    /*
    Constructor for a fake window.XMLHttpRequest
    */
    function IsotropyXMLHttpRequest() {
        this.readyState = IsotropyXMLHttpRequest.UNSENT;
        this.requestHeaders = {};
        this.requestBody = null;
        this.status = 0;
        this.statusText = "";

        this._eventListeners = {};
        var events = ["loadstart", "load", "abort", "loadend"];
        for (var i = events.length - 1; i >= 0; i--) {
            _addEventListener(events[i], this);
        }
    }


    // These status codes are available on the native XMLHttpRequest
    // object, so we match that here in case a library is relying on them.
    IsotropyXMLHttpRequest.UNSENT = 0;
    IsotropyXMLHttpRequest.OPENED = 1;
    IsotropyXMLHttpRequest.HEADERS_RECEIVED = 2;
    IsotropyXMLHttpRequest.LOADING = 3;
    IsotropyXMLHttpRequest.DONE = 4;

    IsotropyXMLHttpRequest.prototype = {
        UNSENT: 0,
        OPENED: 1,
        HEADERS_RECEIVED: 2,
        LOADING: 3,
        DONE: 4,
        async: true,

        /*
        Duplicates the behavior of native XMLHttpRequest's open function
        */
        open: function open(method, url, async, username, password) {
            this.method = method;
            this.url = url;
            this.async = typeof async == "boolean" ? async : true;
            this.username = username;
            this.password = password;
            this.responseText = null;
            this.responseXML = null;
            this.requestHeaders = {};
            this.sendFlag = false;
            this._readyStateChange(IsotropyXMLHttpRequest.OPENED);
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's addEventListener function
        */
        addEventListener: function addEventListener(event, listener) {
            this._eventListeners[event] = this._eventListeners[event] || [];
            this._eventListeners[event].push(listener);
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's removeEventListener function
        */
        removeEventListener: function removeEventListener(event, listener) {
            var listeners = this._eventListeners[event] || [];

            for (var i = 0, l = listeners.length; i < l; ++i) {
                if (listeners[i] == listener) {
                    return listeners.splice(i, 1);
                }
            }
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's dispatchEvent function
        */
        dispatchEvent: function dispatchEvent(event) {
            var type = event.type;
            var listeners = this._eventListeners[type] || [];

            for (var i = 0; i < listeners.length; i++) {
                if (typeof listeners[i] == "function") {
                    listeners[i].call(this, event);
                } else {
                    listeners[i].handleEvent(event);
                }
            }

            return !!event.defaultPrevented;
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's setRequestHeader function
        */
        setRequestHeader: function setRequestHeader(header, value) {
            verifyState(this);

            if (unsafeHeaders[header] || /^(Sec-|Proxy-)/.test(header)) {
                throw new Error("Refused to set unsafe header \"" + header + "\"");
            }

            if (this.requestHeaders[header]) {
                this.requestHeaders[header] += "," + value;
            } else {
                this.requestHeaders[header] = value;
            }
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's send function
        */
        send: function send(data) {
            verifyState(this);

            if (!/^(get|head)$/i.test(this.method)) {
                if (this.requestHeaders["Content-Type"]) {
                    var value = this.requestHeaders["Content-Type"].split(";");
                    this.requestHeaders["Content-Type"] = value[0] + ";charset=utf-8";
                } else {
                    this.requestHeaders["Content-Type"] = "text/plain;charset=utf-8";
                }

                this.requestBody = data;
            }

            this.errorFlag = false;
            this.sendFlag = this.async;
            this._readyStateChange(IsotropyXMLHttpRequest.OPENED);

            if (typeof this.onSend == "function") {
                this.onSend(this);
            }

            this.dispatchEvent(new HttpRequestEvent("loadstart", false, false, this));

            //Let's route this via isotropy
            window.__koa_in_browser.handleIsotropyXMLHttpRequest.call(window.__koa_in_browser, this);
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's abort function
        */
        abort: function abort() {
            this.aborted = true;
            this.responseText = null;
            this.errorFlag = true;
            this.requestHeaders = {};

            if (this.readyState > IsotropyXMLHttpRequest.UNSENT && this.sendFlag) {
                this._readyStateChange(IsotropyXMLHttpRequest.DONE);
                this.sendFlag = false;
            }

            this.readyState = IsotropyXMLHttpRequest.UNSENT;

            this.dispatchEvent(new HttpRequestEvent("abort", false, false, this));
            if (typeof this.onerror === "function") {
                this.onerror();
            }
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's getResponseHeader function
        */
        getResponseHeader: function getResponseHeader(header) {
            if (this.readyState < IsotropyXMLHttpRequest.HEADERS_RECEIVED) {
                return null;
            }

            if (/^Set-Cookie2?$/i.test(header)) {
                return null;
            }

            header = header.toLowerCase();

            for (var h in this.responseHeaders) {
                if (h.toLowerCase() == header) {
                    return this.responseHeaders[h];
                }
            }

            return null;
        },

        /*
        Duplicates the behavior of native XMLHttpRequest's getAllResponseHeaders function
        */
        getAllResponseHeaders: function getAllResponseHeaders() {
            if (this.readyState < IsotropyXMLHttpRequest.HEADERS_RECEIVED) {
                return "";
            }

            var headers = "";

            for (var header in this.responseHeaders) {
                if (this.responseHeaders.hasOwnProperty(header) && !/^Set-Cookie2?$/i.test(header)) {
                    headers += header + ": " + this.responseHeaders[header] + "\r\n";
                }
            }

            return headers;
        },

        /*
        Places a IsotropyXMLHttpRequest object into the passed
        state.
        */
        _readyStateChange: function _readyStateChange(state) {
            this.readyState = state;

            if (typeof this.onreadystatechange == "function") {
                this.onreadystatechange();
            }

            this.dispatchEvent(new HttpRequestEvent("readystatechange"));

            if (this.readyState == IsotropyXMLHttpRequest.DONE) {
                this.dispatchEvent(new HttpRequestEvent("load", false, false, this));
                this.dispatchEvent(new HttpRequestEvent("loadend", false, false, this));
            }
        },


        /*
        Sets the IsotropyXMLHttpRequest object's response headers and
        places the object into readyState 2
        */
        _setResponseHeaders: function _setResponseHeaders(headers) {
            this.responseHeaders = {};

            for (var header in headers) {
                if (headers.hasOwnProperty(header)) {
                    this.responseHeaders[header] = headers[header];
                }
            }

            if (this.async) {
                this._readyStateChange(IsotropyXMLHttpRequest.HEADERS_RECEIVED);
            } else {
                this.readyState = IsotropyXMLHttpRequest.HEADERS_RECEIVED;
            }
        },



        /*
        Sets the IsotropyXMLHttpRequest object's response body and
        if body text is XML, sets responseXML to parsed document
        object
        */
        _setResponseBody: function _setResponseBody(body) {
            verifyRequestSent(this);
            verifyHeadersReceived(this);
            verifyResponseBodyType(body);

            var chunkSize = this.chunkSize || 10;
            var index = 0;
            this.responseText = "";

            do {
                if (this.async) {
                    this._readyStateChange(IsotropyXMLHttpRequest.LOADING);
                }

                this.responseText += body.substring(index, index + chunkSize);
                index += chunkSize;
            } while (index < body.length);

            var type = this.getResponseHeader("Content-Type");

            if (this.responseText && (!type || /(text\/xml)|(application\/xml)|(\+xml)/.test(type))) {
                try {
                    this.responseXML = parseXML(this.responseText);
                } catch (e) {
                    // Unable to parse XML - no biggie
                }
            }

            if (this.async) {
                this._readyStateChange(IsotropyXMLHttpRequest.DONE);
            } else {
                this.readyState = IsotropyXMLHttpRequest.DONE;
            }
        },

        /*
        Forces a response on to the IsotropyXMLHttpRequest object.

        This is the public API for faking responses. This function
        takes a number status, headers object, and string body:

        ```
        xhr.respond(404, {Content-Type: 'text/plain'}, "Sorry. This object was not found.")

        ```
        */
        respond: function respond(status, headers, body) {
            this._setResponseHeaders(headers || {});
            this.status = typeof status == "number" ? status : 200;
            this.statusText = httpStatusCodes[this.status];
            this._setResponseBody(body || "");
            if (typeof this.onload === "function"){
                this.onload();
            }
        }
    };

    function verifyState(xhr) {
        if (xhr.readyState !== IsotropyXMLHttpRequest.OPENED) {
            throw new Error("INVALID_STATE_ERR");
        }

        if (xhr.sendFlag) {
            throw new Error("INVALID_STATE_ERR");
        }
    }


    function verifyRequestSent(xhr) {
        if (xhr.readyState == IsotropyXMLHttpRequest.DONE) {
            throw new Error("Request done");
        }
    }

    function verifyHeadersReceived(xhr) {
        if (xhr.async && xhr.readyState != IsotropyXMLHttpRequest.HEADERS_RECEIVED) {
            throw new Error("No headers received");
        }
    }

    function verifyResponseBodyType(body) {
        if (typeof body != "string") {
            var error = new Error("Attempted to respond to fake XMLHttpRequest with " +
            body + ", which is not a string.");
            error.name = "InvalidBodyException";
            throw error;
        }
    }


    module.exports = IsotropyXMLHttpRequest;
})();
