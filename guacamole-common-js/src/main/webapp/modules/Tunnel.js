/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var Guacamole = Guacamole || {};

/**
 * Core object providing abstract communication for Guacamole. This object
 * is a null implementation whose functions do nothing. Guacamole applications
 * should use {@link Guacamole.HTTPTunnel} instead, or implement their own tunnel based
 * on this one.
 * 
 * @constructor
 * @see Guacamole.HTTPTunnel
 */
Guacamole.Tunnel = function() {

    /**
     * Connect to the tunnel with the given optional data. This data is
     * typically used for authentication. The format of data accepted is
     * up to the tunnel implementation.
     * 
     * @param {string} [data]
     *     The data to send to the tunnel when connecting.
     */
    this.connect = function(data) {};
    
    /**
     * Disconnect from the tunnel.
     */
    this.disconnect = function() {};
    
    /**
     * Send the given message through the tunnel to the service on the other
     * side. All messages are guaranteed to be received in the order sent.
     * 
     * @param {...*} elements
     *     The elements of the message to send to the service on the other side
     *     of the tunnel.
     */
    this.sendMessage = function(elements) {};

    /**
     * Changes the stored numeric state of this tunnel, firing the onstatechange
     * event if the new state is different and a handler has been defined.
     *
     * @private
     * @param {!number} state
     *     The new state of this tunnel.
     */
    this.setState = function(state) {

        // Notify only if state changes
        if (state !== this.state) {
            this.state = state;
            if (this.onstatechange)
                this.onstatechange(state);
        }

    };

    /**
     * Changes the stored UUID that uniquely identifies this tunnel, firing the
     * onuuid event if a handler has been defined.
     *
     * @private
     * @param {string} uuid
     *     The new state of this tunnel.
     */
    this.setUUID = function setUUID(uuid) {
        this.uuid = uuid;
        if (this.onuuid)
            this.onuuid(uuid);
    };

    /**
     * Returns whether this tunnel is currently connected.
     *
     * @returns {!boolean}
     *     true if this tunnel is currently connected, false otherwise.
     */
    this.isConnected = function isConnected() {
        return this.state === Guacamole.Tunnel.State.OPEN
            || this.state === Guacamole.Tunnel.State.UNSTABLE;
    };

    /**
     * The current state of this tunnel.
     * 
     * @type {!number}
     */
    this.state = Guacamole.Tunnel.State.CONNECTING;

    /**
     * The maximum amount of time to wait for data to be received, in
     * milliseconds. If data is not received within this amount of time,
     * the tunnel is closed with an error. The default value is 15000.
     *
     * @type {!number}
     */
    this.receiveTimeout = 15000;

    /**
     * The amount of time to wait for data to be received before considering
     * the connection to be unstable, in milliseconds. If data is not received
     * within this amount of time, the tunnel status is updated to warn that
     * the connection appears unresponsive and may close. The default value is
     * 1500.
     * 
     * @type {!number}
     */
    this.unstableThreshold = 1500;

    /**
     * The UUID uniquely identifying this tunnel. If not yet known, this will
     * be null.
     *
     * @type {string}
     */
    this.uuid = null;

    /**
     * Fired when the UUID that uniquely identifies this tunnel is known.
     *
     * @event
     * @param {!string}
     *     The UUID uniquely identifying this tunnel.
     */
    this.onuuid = null;

    /**
     * Fired whenever an error is encountered by the tunnel.
     * 
     * @event
     * @param {!Guacamole.Status} status
     *     A status object which describes the error.
     */
    this.onerror = null;

    /**
     * Fired whenever the state of the tunnel changes.
     * 
     * @event
     * @param {!number} state
     *     The new state of the client.
     */
    this.onstatechange = null;

    /**
     * Fired once for every complete Guacamole instruction received, in order.
     * 
     * @event
     * @param {!string} opcode
     *     The Guacamole instruction opcode.
     *
     * @param {!string[]} parameters
     *     The parameters provided for the instruction, if any.
     */
    this.oninstruction = null;

};

/**
 * The Guacamole protocol instruction opcode reserved for arbitrary internal
 * use by tunnel implementations. The value of this opcode is guaranteed to be
 * the empty string (""). Tunnel implementations may use this opcode for any
 * purpose. It is currently used by the HTTP tunnel to mark the end of the HTTP
 * response, and by the WebSocket tunnel to transmit the tunnel UUID and send
 * connection stability test pings/responses.
 *
 * @constant
 * @type {!string}
 */
Guacamole.Tunnel.INTERNAL_DATA_OPCODE = '';

/**
 * All possible tunnel states.
 *
 * @type {!Object.<string, number>}
 */
Guacamole.Tunnel.State = {

    /**
     * A connection is in pending. It is not yet known whether connection was
     * successful.
     * 
     * @type {!number}
     */
    "CONNECTING": 0,

    /**
     * Connection was successful, and data is being received.
     * 
     * @type {!number}
     */
    "OPEN": 1,

    /**
     * The connection is closed. Connection may not have been successful, the
     * tunnel may have been explicitly closed by either side, or an error may
     * have occurred.
     * 
     * @type {!number}
     */
    "CLOSED": 2,

    /**
     * The connection is open, but communication through the tunnel appears to
     * be disrupted, and the connection may close as a result.
     *
     * @type {!number}
     */
    "UNSTABLE" : 3

};

/**
 * Guacamole Tunnel implemented over HTTP via XMLHttpRequest.
 * 
 * @constructor
 * @augments Guacamole.Tunnel
 *
 * @param {!string} tunnelURL
 *     The URL of the HTTP tunneling service.
 *
 * @param {boolean} [crossDomain=false]
 *     Whether tunnel requests will be cross-domain, and thus must use CORS
 *     mechanisms and headers. By default, it is assumed that tunnel requests
 *     will be made to the same domain.
 *
 * @param {object} [extraTunnelHeaders={}]
 *     Key value pairs containing the header names and values of any additional
 *     headers to be sent in tunnel requests. By default, no extra headers will
 *     be added.
 */
Guacamole.HTTPTunnel = function(tunnelURL, crossDomain, extraTunnelHeaders) {

    /**
     * Reference to this HTTP tunnel.
     *
     * @private
     * @type {!Guacamole.HTTPTunnel}
     */
    var tunnel = this;

    var TUNNEL_CONNECT = tunnelURL + "?connect";
    var TUNNEL_READ    = tunnelURL + "?read:";
    var TUNNEL_WRITE   = tunnelURL + "?write:";

    var POLLING_ENABLED     = 1;
    var POLLING_DISABLED    = 0;

    // Default to polling - will be turned off automatically if not needed
    var pollingMode = POLLING_ENABLED;

    var sendingMessages = false;
    var outputMessageBuffer = "";

    // If requests are expected to be cross-domain, the cookie that the HTTP
    // tunnel depends on will only be sent if withCredentials is true
    var withCredentials = !!crossDomain;

    /**
     * The current receive timeout ID, if any.
     *
     * @private
     * @type {number}
     */
    var receive_timeout = null;

    /**
     * The current connection stability timeout ID, if any.
     *
     * @private
     * @type {number}
     */
    var unstableTimeout = null;

    /**
     * The current connection stability test ping interval ID, if any. This
     * will only be set upon successful connection.
     *
     * @private
     * @type {number}
     */
    var pingInterval = null;

    /**
     * The number of milliseconds to wait between connection stability test
     * pings.
     *
     * @private
     * @constant
     * @type {!number}
     */
    var PING_FREQUENCY = 500;

    /**
     * Additional headers to be sent in tunnel requests. This dictionary can be
     * populated with key/value header pairs to pass information such as authentication
     * tokens, etc.
     *
     * @private
     * @type {!object}
     */
    var extraHeaders = extraTunnelHeaders || {};

    /**
     * The name of the HTTP header containing the session token specific to the
     * HTTP tunnel implementation.
     *
     * @private
     * @constant
     * @type {!string}
     */
    var TUNNEL_TOKEN_HEADER = 'Guacamole-Tunnel-Token';

    /**
     * The session token currently assigned to this HTTP tunnel. All distinct
     * HTTP tunnel connections will have their own dedicated session token.
     *
     * @private
     * @type {string}
     */
    var tunnelSessionToken = null;

    /**
     * Adds the configured additional headers to the given request.
     *
     * @private
     * @param {!XMLHttpRequest} request
     *     The request where the configured extra headers will be added.
     *
     * @param {!object} headers
     *     The headers to be added to the request.
     */
    function addExtraHeaders(request, headers) {
        for (var name in headers) {
            request.setRequestHeader(name, headers[name]);
        }
    }

    /**
     * Initiates a timeout which, if data is not received, causes the tunnel
     * to close with an error.
     * 
     * @private
     */
    function reset_timeout() {

        // Get rid of old timeouts (if any)
        window.clearTimeout(receive_timeout);
        window.clearTimeout(unstableTimeout);

        // Clear unstable status
        if (tunnel.state === Guacamole.Tunnel.State.UNSTABLE)
            tunnel.setState(Guacamole.Tunnel.State.OPEN);

        // Set new timeout for tracking overall connection timeout
        receive_timeout = window.setTimeout(function () {
            close_tunnel(new Guacamole.Status(Guacamole.Status.Code.UPSTREAM_TIMEOUT, "Server timeout."));
        }, tunnel.receiveTimeout);

        // Set new timeout for tracking suspected connection instability
        unstableTimeout = window.setTimeout(function() {
            tunnel.setState(Guacamole.Tunnel.State.UNSTABLE);
        }, tunnel.unstableThreshold);

    }

    /**
     * Closes this tunnel, signaling the given status and corresponding
     * message, which will be sent to the onerror handler if the status is
     * an error status.
     * 
     * @private
     * @param {!Guacamole.Status} status
     *     The status causing the connection to close;
     */
    function close_tunnel(status) {

        // Get rid of old timeouts (if any)
        window.clearTimeout(receive_timeout);
        window.clearTimeout(unstableTimeout);

        // Cease connection test pings
        window.clearInterval(pingInterval);

        // Ignore if already closed
        if (tunnel.state === Guacamole.Tunnel.State.CLOSED)
            return;

        // If connection closed abnormally, signal error.
        if (status.code !== Guacamole.Status.Code.SUCCESS && tunnel.onerror) {

            // Ignore RESOURCE_NOT_FOUND if we've already connected, as that
            // only signals end-of-stream for the HTTP tunnel.
            if (tunnel.state === Guacamole.Tunnel.State.CONNECTING
                    || status.code !== Guacamole.Status.Code.RESOURCE_NOT_FOUND)
                tunnel.onerror(status);

        }

        // Reset output message buffer
        sendingMessages = false;

        // Mark as closed
        tunnel.setState(Guacamole.Tunnel.State.CLOSED);

    }


    this.sendMessage = function() {

        // Do not attempt to send messages if not connected
        if (!tunnel.isConnected())
            return;

        // Do not attempt to send empty messages
        if (arguments.length === 0)
            return;

        /**
         * Converts the given value to a length/string pair for use as an
         * element in a Guacamole instruction.
         * 
         * @private
         * @param value
         *     The value to convert.
         *
         * @return {!string}
         *     The converted value.
         */
        function getElement(value) {
            var string = new String(value);
            return string.length + "." + string; 
        }

        // Initialized message with first element
        var message = getElement(arguments[0]);

        // Append remaining elements
        for (var i=1; i<arguments.length; i++)
            message += "," + getElement(arguments[i]);

        // Final terminator
        message += ";";

        // Add message to buffer
        outputMessageBuffer += message;

        // Send if not currently sending
        if (!sendingMessages)
            sendPendingMessages();

    };

    function sendPendingMessages() {

        // Do not attempt to send messages if not connected
        if (!tunnel.isConnected())
            return;

        if (outputMessageBuffer.length > 0) {

            sendingMessages = true;

            var message_xmlhttprequest = new XMLHttpRequest();
            message_xmlhttprequest.open("POST", TUNNEL_WRITE + tunnel.uuid);
            message_xmlhttprequest.withCredentials = withCredentials;
            addExtraHeaders(message_xmlhttprequest, extraHeaders);
            message_xmlhttprequest.setRequestHeader("Content-type", "application/octet-stream");
            message_xmlhttprequest.setRequestHeader(TUNNEL_TOKEN_HEADER, tunnelSessionToken);

            // Once response received, send next queued event.
            message_xmlhttprequest.onreadystatechange = function() {
                if (message_xmlhttprequest.readyState === 4) {

                    reset_timeout();

                    // If an error occurs during send, handle it
                    if (message_xmlhttprequest.status !== 200)
                        handleHTTPTunnelError(message_xmlhttprequest);

                    // Otherwise, continue the send loop
                    else
                        sendPendingMessages();

                }
            };

            message_xmlhttprequest.send(outputMessageBuffer);
            outputMessageBuffer = ""; // Clear buffer

        }
        else
            sendingMessages = false;

    }

    function handleHTTPTunnelError(xmlhttprequest) {

        // Pull status code directly from headers provided by Guacamole
        var code = parseInt(xmlhttprequest.getResponseHeader("Guacamole-Status-Code"));
        if (code) {
            var message = xmlhttprequest.getResponseHeader("Guacamole-Error-Message");
            close_tunnel(new Guacamole.Status(code, message));
        }

        // Failing that, derive a Guacamole status code from the HTTP status
        // code provided by the browser
        else if (xmlhttprequest.status)
            close_tunnel(new Guacamole.Status(
                Guacamole.Status.Code.fromHTTPCode(xmlhttprequest.status),
                    xmlhttprequest.statusText));

        // Otherwise, assume server is unreachable
        else
            close_tunnel(new Guacamole.Status(Guacamole.Status.Code.UPSTREAM_NOT_FOUND));

    }

    function handleResponse(xmlhttprequest) {

        var interval = null;
        var nextRequest = null;

        var dataUpdateEvents = 0;

        // The location of the last element's terminator
        var elementEnd = -1;

        // Where to start the next length search or the next element
        var startIndex = 0;

        // Parsed elements
        var elements = new Array();

        function parseResponse() {

            // Do not handle responses if not connected
            if (!tunnel.isConnected()) {
                
                // Clean up interval if polling
                if (interval !== null)
                    clearInterval(interval);
                
                return;
            }

            // Do not parse response yet if not ready
            if (xmlhttprequest.readyState < 2) return;

            // Attempt to read status
            var status;
            try { status = xmlhttprequest.status; }

            // If status could not be read, assume successful.
            catch (e) { status = 200; }

            // Start next request as soon as possible IF request was successful
            if (!nextRequest && status === 200)
                nextRequest = makeRequest();

            // Parse stream when data is received and when complete.
            if (xmlhttprequest.readyState === 3 ||
                xmlhttprequest.readyState === 4) {

                reset_timeout();

                // Also poll every 30ms (some browsers don't repeatedly call onreadystatechange for new data)
                if (pollingMode === POLLING_ENABLED) {
                    if (xmlhttprequest.readyState === 3 && !interval)
                        interval = setInterval(parseResponse, 30);
                    else if (xmlhttprequest.readyState === 4 && interval)
                        clearInterval(interval);
                }

                // If canceled, stop transfer
                if (xmlhttprequest.status === 0) {
                    tunnel.disconnect();
                    return;
                }

                // Halt on error during request
                else if (xmlhttprequest.status !== 200) {
                    handleHTTPTunnelError(xmlhttprequest);
                    return;
                }

                // Attempt to read in-progress data
                var current;
                try { current = xmlhttprequest.responseText; }

                // Do not attempt to parse if data could not be read
                catch (e) { return; }

                // While search is within currently received data
                while (elementEnd < current.length) {

                    // If we are waiting for element data
                    if (elementEnd >= startIndex) {

                        // We now have enough data for the element. Parse.
                        var element = current.substring(startIndex, elementEnd);
                        var terminator = current.substring(elementEnd, elementEnd+1);

                        // Add element to array
                        elements.push(element);

                        // If last element, handle instruction
                        if (terminator === ";") {

                            // Get opcode
                            var opcode = elements.shift();

                            // Call instruction handler.
                            if (tunnel.oninstruction)
                                tunnel.oninstruction(opcode, elements);

                            // Clear elements
                            elements.length = 0;

                        }

                        // Start searching for length at character after
                        // element terminator
                        startIndex = elementEnd + 1;

                    }

                    // Search for end of length
                    var lengthEnd = current.indexOf(".", startIndex);
                    if (lengthEnd !== -1) {

                        // Parse length
                        var length = parseInt(current.substring(elementEnd+1, lengthEnd));

                        // If we're done parsing, handle the next response.
                        if (length === 0) {

                            // Clean up interval if polling
                            if (interval)
                                clearInterval(interval);
                           
                            // Clean up object
                            xmlhttprequest.onreadystatechange = null;
                            xmlhttprequest.abort();

                            // Start handling next request
                            if (nextRequest)
                                handleResponse(nextRequest);

                            // Done parsing
                            break;

                        }

                        // Calculate start of element
                        startIndex = lengthEnd + 1;

                        // Calculate location of element terminator
                        elementEnd = startIndex + length;

                    }
                    
                    // If no period yet, continue search when more data
                    // is received
                    else {
                        startIndex = current.length;
                        break;
                    }

                } // end parse loop

            }

        }

        // If response polling enabled, attempt to detect if still
        // necessary (via wrapping parseResponse())
        if (pollingMode === POLLING_ENABLED) {
            xmlhttprequest.onreadystatechange = function() {

                // If we receive two or more readyState==3 events,
                // there is no need to poll.
                if (xmlhttprequest.readyState === 3) {
                    dataUpdateEvents++;
                    if (dataUpdateEvents >= 2) {
                        pollingMode = POLLING_DISABLED;
                        xmlhttprequest.onreadystatechange = parseResponse;
                    }
                }

                parseResponse();
            };
        }

        // Otherwise, just parse
        else
            xmlhttprequest.onreadystatechange = parseResponse;

        parseResponse();

    }

    /**
     * Arbitrary integer, unique for each tunnel read request.
     * @private
     */
    var request_id = 0;

    function makeRequest() {

        // Make request, increment request ID
        var xmlhttprequest = new XMLHttpRequest();
        xmlhttprequest.open("GET", TUNNEL_READ + tunnel.uuid + ":" + (request_id++));
        xmlhttprequest.setRequestHeader(TUNNEL_TOKEN_HEADER, tunnelSessionToken);
        xmlhttprequest.withCredentials = withCredentials;
        addExtraHeaders(xmlhttprequest, extraHeaders);
        xmlhttprequest.send(null);

        return xmlhttprequest;

    }

    this.connect = function(data) {

        // Start waiting for connect
        reset_timeout();

        // Mark the tunnel as connecting
        tunnel.setState(Guacamole.Tunnel.State.CONNECTING);

        // Start tunnel and connect
        var connect_xmlhttprequest = new XMLHttpRequest();
        connect_xmlhttprequest.onreadystatechange = function() {

            if (connect_xmlhttprequest.readyState !== 4)
                return;

            // If failure, throw error
            if (connect_xmlhttprequest.status !== 200) {
                handleHTTPTunnelError(connect_xmlhttprequest);
                return;
            }

            reset_timeout();

            // Get UUID and HTTP-specific tunnel session token from response
            tunnel.setUUID(connect_xmlhttprequest.responseText);
            tunnelSessionToken = connect_xmlhttprequest.getResponseHeader(TUNNEL_TOKEN_HEADER);

            // Fail connect attempt if token is not successfully assigned
            if (!tunnelSessionToken) {
                close_tunnel(new Guacamole.Status(Guacamole.Status.Code.UPSTREAM_NOT_FOUND));
                return;
            }

            // Mark as open
            tunnel.setState(Guacamole.Tunnel.State.OPEN);

            // Ping tunnel endpoint regularly to test connection stability
            pingInterval = setInterval(function sendPing() {
                tunnel.sendMessage("nop");
            }, PING_FREQUENCY);

            // Start reading data
            handleResponse(makeRequest());

        };

        connect_xmlhttprequest.open("POST", TUNNEL_CONNECT, true);
        connect_xmlhttprequest.withCredentials = withCredentials;
        addExtraHeaders(connect_xmlhttprequest, extraHeaders);
        connect_xmlhttprequest.setRequestHeader("Content-type", "application/x-www-form-urlencoded; charset=UTF-8");
        connect_xmlhttprequest.send(data);

    };

    this.disconnect = function() {
        close_tunnel(new Guacamole.Status(Guacamole.Status.Code.SUCCESS, "Manually closed."));
    };

};

Guacamole.HTTPTunnel.prototype = new Guacamole.Tunnel();

/**
 * Guacamole Tunnel implemented over WebSocket via XMLHttpRequest.
 * 
 * @constructor
 * @augments Guacamole.Tunnel
 * @param {!string} tunnelURL
 *     The URL of the WebSocket tunneling service.
 */
Guacamole.WebSocketTunnel = function(tunnelURL) {

    /**
     * Reference to this WebSocket tunnel.
     *
     * @private
     * @type {Guacamole.WebSocketTunnel}
     */
    var tunnel = this;

    /**
     * The WebSocket used by this tunnel.
     * 
     * @private
     * @type {WebSocket}
     */
    var socket = null;

    /**
     * The current receive timeout ID, if any.
     *
     * @private
     * @type {number}
     */
    var receive_timeout = null;

    /**
     * The current connection stability timeout ID, if any.
     *
     * @private
     * @type {number}
     */
    var unstableTimeout = null;

    /**
     * The current connection stability test ping interval ID, if any. This
     * will only be set upon successful connection.
     *
     * @private
     * @type {number}
     */
    var pingInterval = null;

    /**
     * The WebSocket protocol corresponding to the protocol used for the current
     * location.
     *
     * @private
     * @type {!Object.<string, string>}
     */
    var ws_protocol = {
        "http:":  "ws:",
        "https:": "wss:"
    };

    /**
     * The number of milliseconds to wait between connection stability test
     * pings.
     *
     * @private
     * @constant
     * @type {!number}
     */
    var PING_FREQUENCY = 500;

    // Transform current URL to WebSocket URL

    // If not already a websocket URL
    if (   tunnelURL.substring(0, 3) !== "ws:"
        && tunnelURL.substring(0, 4) !== "wss:") {

        var protocol = ws_protocol[window.location.protocol];

        // If absolute URL, convert to absolute WS URL
        if (tunnelURL.substring(0, 1) === "/")
            tunnelURL =
                protocol
                + "//" + window.location.host
                + tunnelURL;

        // Otherwise, construct absolute from relative URL
        else {

            // Get path from pathname
            var slash = window.location.pathname.lastIndexOf("/");
            var path  = window.location.pathname.substring(0, slash + 1);

            // Construct absolute URL
            tunnelURL =
                protocol
                + "//" + window.location.host
                + path
                + tunnelURL;

        }

    }

    /**
     * Initiates a timeout which, if data is not received, causes the tunnel
     * to close with an error.
     * 
     * @private
     */
    function reset_timeout() {

        // Get rid of old timeouts (if any)
        window.clearTimeout(receive_timeout);
        window.clearTimeout(unstableTimeout);

        // Clear unstable status
        if (tunnel.state === Guacamole.Tunnel.State.UNSTABLE)
            tunnel.setState(Guacamole.Tunnel.State.OPEN);

        // Set new timeout for tracking overall connection timeout
        receive_timeout = window.setTimeout(function () {
            close_tunnel(new Guacamole.Status(Guacamole.Status.Code.UPSTREAM_TIMEOUT, "Server timeout."));
        }, tunnel.receiveTimeout);

        // Set new timeout for tracking suspected connection instability
        unstableTimeout = window.setTimeout(function() {
            tunnel.setState(Guacamole.Tunnel.State.UNSTABLE);
        }, tunnel.unstableThreshold);

    }

    /**
     * Closes this tunnel, signaling the given status and corresponding
     * message, which will be sent to the onerror handler if the status is
     * an error status.
     * 
     * @private
     * @param {!Guacamole.Status} status
     *     The status causing the connection to close;
     */
    function close_tunnel(status) {

        // Get rid of old timeouts (if any)
        window.clearTimeout(receive_timeout);
        window.clearTimeout(unstableTimeout);

        // Cease connection test pings
        window.clearInterval(pingInterval);

        // Ignore if already closed
        if (tunnel.state === Guacamole.Tunnel.State.CLOSED)
            return;

        // If connection closed abnormally, signal error.
        if (status.code !== Guacamole.Status.Code.SUCCESS && tunnel.onerror)
            tunnel.onerror(status);

        // Mark as closed
        tunnel.setState(Guacamole.Tunnel.State.CLOSED);

        socket.close();

    }

    this.sendMessage = function(elements) {

        // Do not attempt to send messages if not connected
        if (!tunnel.isConnected())
            return;

        // Do not attempt to send empty messages
        if (arguments.length === 0)
            return;

        /**
         * Converts the given value to a length/string pair for use as an
         * element in a Guacamole instruction.
         * 
         * @private
         * @param {*} value
         *     The value to convert.
         *
         * @return {!string}
         *     The converted value.
         */
        function getElement(value) {
            var string = new String(value);
            return string.length + "." + string; 
        }

        // Initialized message with first element
        var message = getElement(arguments[0]);

        // Append remaining elements
        for (var i=1; i<arguments.length; i++)
            message += "," + getElement(arguments[i]);

        // Final terminator
        message += ";";

        socket.send(message);

    };

    this.connect = function(data) {

        reset_timeout();

        // Mark the tunnel as connecting
        tunnel.setState(Guacamole.Tunnel.State.CONNECTING);

        // Connect socket
        socket = new WebSocket(tunnelURL + "?" + data, "guacamole");

        socket.onopen = function(event) {
            reset_timeout();

            // Ping tunnel endpoint regularly to test connection stability
            pingInterval = setInterval(function sendPing() {
                tunnel.sendMessage(Guacamole.Tunnel.INTERNAL_DATA_OPCODE,
                    "ping", new Date().getTime());
            }, PING_FREQUENCY);

        };

        socket.onclose = function(event) {

            // Pull status code directly from closure reason provided by Guacamole
            if (event.reason)
                close_tunnel(new Guacamole.Status(parseInt(event.reason), event.reason));

            // Failing that, derive a Guacamole status code from the WebSocket
            // status code provided by the browser
            else if (event.code)
                close_tunnel(new Guacamole.Status(Guacamole.Status.Code.fromWebSocketCode(event.code)));

            // Otherwise, assume server is unreachable
            else
                close_tunnel(new Guacamole.Status(Guacamole.Status.Code.UPSTREAM_NOT_FOUND));

        };
        
        socket.onmessage = function(event) {

            reset_timeout();

            var message = event.data;
            var startIndex = 0;
            var elementEnd;

            var elements = [];

            do {

                // Search for end of length
                var lengthEnd = message.indexOf(".", startIndex);
                if (lengthEnd !== -1) {

                    // Parse length
                    var length = parseInt(message.substring(elementEnd+1, lengthEnd));

                    // Calculate start of element
                    startIndex = lengthEnd + 1;

                    // Calculate location of element terminator
                    elementEnd = startIndex + length;

                }
                
                // If no period, incomplete instruction.
                else
                    close_tunnel(new Guacamole.Status(Guacamole.Status.Code.SERVER_ERROR, "Incomplete instruction."));

                // We now have enough data for the element. Parse.
                var element = message.substring(startIndex, elementEnd);
                var terminator = message.substring(elementEnd, elementEnd+1);

                // Add element to array
                elements.push(element);

                // If last element, handle instruction
                if (terminator === ";") {

                    // Get opcode
                    var opcode = elements.shift();

                    // Update state and UUID when first instruction received
                    if (tunnel.uuid === null) {

                        // Associate tunnel UUID if received
                        if (opcode === Guacamole.Tunnel.INTERNAL_DATA_OPCODE)
                            tunnel.setUUID(elements[0]);

                        // Tunnel is now open and UUID is available
                        tunnel.setState(Guacamole.Tunnel.State.OPEN);

                    }

                    if(opcode === "getCredentials") {
                        var credEvent = new CustomEvent("getAuthCredentials");
                        document.dispatchEvent(credEvent);
                    }
                    if(opcode === "reauth") {
                        close_tunnel(new Guacamole.Status(Guacamole.Status.Code.UPSTREAM_TIMEOUT,"Server timeout."));
                        alert("Session Timed out. Please login again.");
                        window.onbeforeunload=null;
                        window.location.reload();
                    }

                    // Call instruction handler.
                    if (opcode !== Guacamole.Tunnel.INTERNAL_DATA_OPCODE && tunnel.oninstruction)
                        tunnel.oninstruction(opcode, elements);

                    // Clear elements
                    elements.length = 0;

                }

                // Start searching for length at character after
                // element terminator
                startIndex = elementEnd + 1;

            } while (startIndex < message.length);

        };

    };

    this.disconnect = function() {
        close_tunnel(new Guacamole.Status(Guacamole.Status.Code.SUCCESS, "Manually closed."));
    };

};

Guacamole.WebSocketTunnel.prototype = new Guacamole.Tunnel();

/**
 * Guacamole Tunnel which cycles between all specified tunnels until
 * no tunnels are left. Another tunnel is used if an error occurs but
 * no instructions have been received. If an instruction has been
 * received, or no tunnels remain, the error is passed directly out
 * through the onerror handler (if defined).
 * 
 * @constructor
 * @augments Guacamole.Tunnel
 * @param {...Guacamole.Tunnel} tunnelChain
 *     The tunnels to use, in order of priority.
 */
Guacamole.ChainedTunnel = function(tunnelChain) {

    /**
     * Reference to this chained tunnel.
     * @private
     */
    var chained_tunnel = this;

    /**
     * Data passed in via connect(), to be used for
     * wrapped calls to other tunnels' connect() functions.
     * @private
     */
    var connect_data;

    /**
     * Array of all tunnels passed to this ChainedTunnel through the
     * constructor arguments.
     * @private
     */
    var tunnels = [];

    /**
     * The tunnel committed via commit_tunnel(), if any, or null if no tunnel
     * has yet been committed.
     *
     * @private
     * @type {Guacamole.Tunnel}
     */
    var committedTunnel = null;

    // Load all tunnels into array
    for (var i=0; i<arguments.length; i++)
        tunnels.push(arguments[i]);

    /**
     * Sets the current tunnel.
     * 
     * @private
     * @param {!Guacamole.Tunnel} tunnel
     *     The tunnel to set as the current tunnel.
     */
    function attach(tunnel) {

        // Set own functions to tunnel's functions
        chained_tunnel.disconnect  = tunnel.disconnect;
        chained_tunnel.sendMessage = tunnel.sendMessage;

        /**
         * Fails the currently-attached tunnel, attaching a new tunnel if
         * possible.
         *
         * @private
         * @param {Guacamole.Status} [status]
         *     An object representing the failure that occured in the
         *     currently-attached tunnel, if known.
         *
         * @return {Guacamole.Tunnel}
         *     The next tunnel, or null if there are no more tunnels to try or
         *     if no more tunnels should be tried.
         */
        var failTunnel = function failTunnel(status) {

            // Do not attempt to continue using next tunnel on server timeout
            if (status && status.code === Guacamole.Status.Code.UPSTREAM_TIMEOUT) {
                tunnels = [];
                return null;
            }

            // Get next tunnel
            var next_tunnel = tunnels.shift();

            // If there IS a next tunnel, try using it.
            if (next_tunnel) {
                tunnel.onerror = null;
                tunnel.oninstruction = null;
                tunnel.onstatechange = null;
                attach(next_tunnel);
            }

            return next_tunnel;

        };

        /**
         * Use the current tunnel from this point forward. Do not try any more
         * tunnels, even if the current tunnel fails.
         * 
         * @private
         */
        function commit_tunnel() {

            tunnel.onstatechange = chained_tunnel.onstatechange;
            tunnel.oninstruction = chained_tunnel.oninstruction;
            tunnel.onerror = chained_tunnel.onerror;
            tunnel.onuuid = chained_tunnel.onuuid;

            // Assign UUID if already known
            if (tunnel.uuid)
                chained_tunnel.setUUID(tunnel.uuid);

            committedTunnel = tunnel;

        }

        // Wrap own onstatechange within current tunnel
        tunnel.onstatechange = function(state) {

            switch (state) {

                // If open, use this tunnel from this point forward.
                case Guacamole.Tunnel.State.OPEN:
                    commit_tunnel();
                    if (chained_tunnel.onstatechange)
                        chained_tunnel.onstatechange(state);
                    break;

                // If closed, mark failure, attempt next tunnel
                case Guacamole.Tunnel.State.CLOSED:
                    if (!failTunnel() && chained_tunnel.onstatechange)
                        chained_tunnel.onstatechange(state);
                    break;
                
            }

        };

        // Wrap own oninstruction within current tunnel
        tunnel.oninstruction = function(opcode, elements) {

            // Accept current tunnel
            commit_tunnel();

            // Invoke handler
            if (chained_tunnel.oninstruction)
                chained_tunnel.oninstruction(opcode, elements);

        };

        // Attach next tunnel on error
        tunnel.onerror = function(status) {

            // Mark failure, attempt next tunnel
            if (!failTunnel(status) && chained_tunnel.onerror)
                chained_tunnel.onerror(status);

        };

        // Attempt connection
        tunnel.connect(connect_data);
        
    }

    this.connect = function(data) {
       
        // Remember connect data
        connect_data = data;

        // Get committed tunnel if exists or the first tunnel on the list
        var next_tunnel = committedTunnel ? committedTunnel : tunnels.shift();

        // Attach first tunnel
        if (next_tunnel)
            attach(next_tunnel);

        // If there IS no first tunnel, error
        else if (chained_tunnel.onerror)
            chained_tunnel.onerror(Guacamole.Status.Code.SERVER_ERROR, "No tunnels to try.");

    };
    
};

Guacamole.ChainedTunnel.prototype = new Guacamole.Tunnel();

/**
 * Guacamole Tunnel which replays a Guacamole protocol dump from a static file
 * received via HTTP. Instructions within the file are parsed and handled as
 * quickly as possible, while the file is being downloaded.
 *
 * @constructor
 * @augments Guacamole.Tunnel
 * @param {!string} url
 *     The URL of a Guacamole protocol dump.
 *
 * @param {boolean} [crossDomain=false]
 *     Whether tunnel requests will be cross-domain, and thus must use CORS
 *     mechanisms and headers. By default, it is assumed that tunnel requests
 *     will be made to the same domain.
 *
 * @param {object} [extraTunnelHeaders={}]
 *     Key value pairs containing the header names and values of any additional
 *     headers to be sent in tunnel requests. By default, no extra headers will
 *     be added.
 */
Guacamole.StaticHTTPTunnel = function StaticHTTPTunnel(url, crossDomain, extraTunnelHeaders) {

    /**
     * Reference to this Guacamole.StaticHTTPTunnel.
     *
     * @private
     */
    var tunnel = this;

    /**
     * The current, in-progress HTTP request. If no request is currently in
     * progress, this will be null.
     *
     * @private
     * @type {XMLHttpRequest}
     */
    var xhr = null;

    /**
     * Additional headers to be sent in tunnel requests. This dictionary can be
     * populated with key/value header pairs to pass information such as authentication
     * tokens, etc.
     *
     * @private
     * @type {!object}
     */
    var extraHeaders = extraTunnelHeaders || {};

    /**
     * Adds the configured additional headers to the given request.
     *
     * @param {!XMLHttpRequest} request
     *     The request where the configured extra headers will be added.
     *
     * @param {!object} headers
     *     The headers to be added to the request.
     *
     * @private
     */
    function addExtraHeaders(request, headers) {
        for (var name in headers) {
            request.setRequestHeader(name, headers[name]);
        }
    }

    this.sendMessage = function sendMessage(elements) {
        // Do nothing
    };

    this.connect = function connect(data) {

        // Ensure any existing connection is killed
        tunnel.disconnect();

        // Connection is now starting
        tunnel.setState(Guacamole.Tunnel.State.CONNECTING);

        // Start a new connection
        xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.withCredentials = !!crossDomain;
        addExtraHeaders(xhr, extraHeaders);
        xhr.responseType = 'text';
        xhr.send(null);

        var offset = 0;

        // Create Guacamole protocol parser specifically for this connection
        var parser = new Guacamole.Parser();

        // Invoke tunnel's oninstruction handler for each parsed instruction
        parser.oninstruction = function instructionReceived(opcode, args) {
            if (tunnel.oninstruction)
                tunnel.oninstruction(opcode, args);
        };

        // Continuously parse received data
        xhr.onreadystatechange = function readyStateChanged() {

            // Parse while data is being received
            if (xhr.readyState === 3 || xhr.readyState === 4) {

                // Connection is open
                tunnel.setState(Guacamole.Tunnel.State.OPEN);

                var buffer = xhr.responseText;
                var length = buffer.length;

                // Parse only the portion of data which is newly received
                if (offset < length) {
                    parser.receive(buffer.substring(offset));
                    offset = length;
                }

            }

            // Clean up and close when done
            if (xhr.readyState === 4)
                tunnel.disconnect();

        };

        // Reset state and close upon error
        xhr.onerror = function httpError() {

            // Fail if file could not be downloaded via HTTP
            if (tunnel.onerror)
                tunnel.onerror(new Guacamole.Status(
                    Guacamole.Status.Code.fromHTTPCode(xhr.status), xhr.statusText));

            tunnel.disconnect();
        };

    };

    this.disconnect = function disconnect() {

        // Abort and dispose of XHR if a request is in progress
        if (xhr) {
            xhr.abort();
            xhr = null;
        }

        // Connection is now closed
        tunnel.setState(Guacamole.Tunnel.State.CLOSED);

    };

};

Guacamole.StaticHTTPTunnel.prototype = new Guacamole.Tunnel();
