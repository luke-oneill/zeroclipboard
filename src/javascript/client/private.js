/**
 * The real constructor for `ZeroClipboard` client instances.
 * @private
 */
var _clientConstructor = function(elements) {
  // Save a closure reference for the following event handlers
  var client = this;

  // Assign an ID to the client instance
  client.id = "" + (_clientIdCounter++);

  // Create the meta information store for this client
  _clientMeta[client.id] = {
    instance: client,
    elements: [],
    handlers: {}
  };

  // If the elements argument exists, clip it
  if (elements) {
    client.clip(elements);
  }

  // ECHO! Our client's sounding board.
  ZeroClipboard.on("*", function(event) {
    return client.emit(event);
  });

  // Await imminent destruction...
  ZeroClipboard.on("destroy", function() {
    client.destroy();
  });

  // Move on: embed the SWF
  ZeroClipboard.create();
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.on`.
 * @private
 */
var _clientOn = function(eventType, listener) {
  // add user event handler for event
  var i, len, events,
      added = {},
      handlers = _clientMeta[this.id] && _clientMeta[this.id].handlers;

  if (typeof eventType === "string" && eventType) {
    events = eventType.toLowerCase().split(/\s+/);
  }
  else if (typeof eventType === "object" && eventType && typeof listener === "undefined") {
    for (i in eventType) {
      if (_hasOwn.call(eventType, i) && typeof i === "string" && i && typeof eventType[i] === "function") {
        this.on(i, eventType[i]);
      }
    }
  }

  if (events && events.length) {
    for (i = 0, len = events.length; i < len; i++) {
      eventType = events[i].replace(/^on/, "");
      added[eventType] = true;
      if (!handlers[eventType]) {
        handlers[eventType] = [];
      }
      handlers[eventType].push(listener);
    }

    // The following events must be memorized and fired immediately if relevant as they only occur
    // once per Flash object load.

    // If the SWF was already loaded, we're à gogo!
    if (added.ready && _flashState.ready) {
      this.emit({
        type: "ready",
        client: this
      });
    }
    if (added.error) {
      var errorTypes = ["disabled", "outdated", "unavailable", "deactivated", "overdue"];
      for (i = 0, len = errorTypes.length; i < len; i++) {
        if (_flashState[errorTypes[i]]) {
          this.emit({
            type: "error",
            name: "flash-" + errorTypes[i],
            client: this
          });
          break;
        }
      }
    }
  }
  return this;
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.off`.
 * @private
 */
var _clientOff = function(eventType, listener) {
  var i, len, foundIndex, events, perEventHandlers,
      handlers = _clientMeta[this.id] && _clientMeta[this.id].handlers;
  if (arguments.length === 0) {
    // Remove ALL of the handlers for ALL event types
    events = _objectKeys(handlers);
  }
  else if (typeof eventType === "string" && eventType) {
    events = eventType.split(/\s+/);
  }
  else if (typeof eventType === "object" && eventType && typeof listener === "undefined") {
    for (i in eventType) {
      if (_hasOwn.call(eventType, i) && typeof i === "string" && i && typeof eventType[i] === "function") {
        this.off(i, eventType[i]);
      }
    }
  }

  if (events && events.length) {
    for (i = 0, len = events.length; i < len; i++) {
      eventType = events[i].toLowerCase().replace(/^on/, "");
      perEventHandlers = handlers[eventType];
      if (perEventHandlers && perEventHandlers.length) {
        if (listener) {
          foundIndex = _inArray(listener, perEventHandlers);
          while (foundIndex !== -1) {
            perEventHandlers.splice(foundIndex, 1);
            foundIndex = _inArray(listener, perEventHandlers, foundIndex);
          }
        }
        else {
          // If no `listener` was provided, remove ALL of the handlers for this event type
          perEventHandlers.length = 0;
        }
      }
    }
  }
  return this;
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.handlers`.
 * @private
 */
var _clientListeners = function(eventType) {
  var copy = null,
      handlers = _clientMeta[this.id] && _clientMeta[this.id].handlers;

  if (handlers) {
    if (typeof eventType === "string" && eventType) {
      copy = handlers[eventType] ? handlers[eventType].slice(0) : [];
    }
    else {
      // Make a deep copy of the handlers object
      copy = _deepCopy(handlers);
    }
  }
  return copy;
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.emit`.
 * @private
 */
var _clientEmit = function(event) {
  if (_clientShouldEmit.call(this, event)) {
    // Don't modify the original Event, if it is an object (as expected)
    if (typeof event === "object" && event && typeof event.type === "string" && event.type) {
      event = _extend({}, event);
    }
    var eventCopy = _extend({}, _createEvent(event), { client: this });
    _clientDispatchCallbacks.call(this, eventCopy);
  }
  return this;
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.clip`.
 * @private
 */
var _clientClip = function(elements) {
  elements = _prepClip(elements);

  for (var i = 0; i < elements.length ; i++) {
    if (_hasOwn.call(elements, i) && elements[i] && elements[i].nodeType === 1) {
      // If the element hasn't been clipped to ANY client yet, add a metadata ID and event handler
      if (!elements[i].zcClippingId) {
        elements[i].zcClippingId = "zcClippingId_" + (_elementIdCounter++);
        _elementMeta[elements[i].zcClippingId] = [this.id];
        if (_globalConfig.autoActivate === true) {
          _addMouseHandlers(elements[i]);
        }
      }
      else if (_inArray(this.id, _elementMeta[elements[i].zcClippingId]) === -1) {
        _elementMeta[elements[i].zcClippingId].push(this.id);
      }

      // If the element hasn't been clipped to THIS client yet, add it
      var clippedElements = _clientMeta[this.id] && _clientMeta[this.id].elements;
      if (_inArray(elements[i], clippedElements) === -1) {
        clippedElements.push(elements[i]);
      }
    }
  }
  return this;
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.unclip`.
 * @private
 */
var _clientUnclip = function(elements) {
  var meta = _clientMeta[this.id];

  if (!meta) {
    return this;
  }

  var clippedElements = meta.elements;
  var arrayIndex;

  // If no elements were provided, unclip ALL of this client's clipped elements
  if (typeof elements === "undefined") {
    elements = clippedElements.slice(0);
  }
  else {
    elements = _prepClip(elements);
  }

  for (var i = elements.length; i--; ) {
    if (_hasOwn.call(elements, i) && elements[i] && elements[i].nodeType === 1) {
      // If the element was clipped to THIS client yet, remove it
      arrayIndex = 0;
      while ((arrayIndex = _inArray(elements[i], clippedElements, arrayIndex)) !== -1) {
        clippedElements.splice(arrayIndex, 1);
      }

      // If the element isn't clipped to ANY other client, remove its metadata ID and event handler
      var clientIds = _elementMeta[elements[i].zcClippingId];
      if (clientIds) {
        arrayIndex = 0;
        while ((arrayIndex = _inArray(this.id, clientIds, arrayIndex)) !== -1) {
          clientIds.splice(arrayIndex, 1);
        }
        if (clientIds.length === 0) {
          if (_globalConfig.autoActivate === true) {
            _removeMouseHandlers(elements[i]);
          }
          delete elements[i].zcClippingId;
        }
      }
    }
  }
  return this;
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.elements`.
 * @private
 */
var _clientElements = function() {
  var meta = _clientMeta[this.id];
  return (meta && meta.elements) ? meta.elements.slice(0) : [];
};


/**
 * The underlying implementation of `ZeroClipboard.Client.prototype.destroy`.
 * @private
 */
var _clientDestroy = function() {
  // Unclip all the elements
  this.unclip();

  // Remove all event handlers
  this.off();

  // Delete the client's metadata store
  delete _clientMeta[this.id];
};




//
// Helper functions
//

/**
 * Inspect an Event to see if the Client (`this`) should honor it for emission.
 * @private
 */
var _clientShouldEmit = function(event) {
  // If no event is received
  if (!(event && event.type)) {
    return false;
  }

  // If this event's `client` was specifically set to a client other than this client, bail out
  if (event.client && event.client !== this) {
    return false;
  }

  // If this event's targeted element(s) is/are not clipped by this client, bail out
  // unless the event's `client` was specifically set to this client.
  var clippedEls = _clientMeta[this.id] && _clientMeta[this.id].elements;
  var hasClippedEls = !!clippedEls && clippedEls.length > 0;
  var goodTarget = !event.target || (hasClippedEls && _inArray(event.target, clippedEls) !== -1);
  var goodRelTarget = event.relatedTarget && hasClippedEls && _inArray(event.relatedTarget, clippedEls) !== -1;
  var goodClient = event.client && event.client === this;
  // At least one of these must be true....
  if (!(goodTarget || goodRelTarget || goodClient)) {
    return false;
  }

  // Otherwise... go for it!
  return true;
};


/**
 * Handle the actual dispatching of events to a client instance.
 *
 * @returns `this`
 * @private
 */
var _clientDispatchCallbacks = function(event) {
  if (!(typeof event === "object" && event && event.type)) {
    return;
  }

  var async = _shouldPerformAsync(event);

  // User defined handlers for events
  var wildcardTypeHandlers = (_clientMeta[this.id] && _clientMeta[this.id].handlers["*"]) || [];
  var specificTypeHandlers = (_clientMeta[this.id] && _clientMeta[this.id].handlers[event.type]) || [];
  // Execute wildcard handlers before type-specific handlers
  var handlers = wildcardTypeHandlers.concat(specificTypeHandlers);

  if (handlers && handlers.length) {
    var i, len, func, context, eventCopy,
        originalContext = this;
    for (i = 0, len = handlers.length; i < len; i++) {
      func = handlers[i];
      context = originalContext;

      // If the user provided a string for their callback, grab that function
      if (typeof func === "string" && typeof _window[func] === "function") {
        func = _window[func];
      }
      if (typeof func === "object" && func && typeof func.handleEvent === "function") {
        context = func;
        func = func.handleEvent;
      }

      if (typeof func === "function") {
        eventCopy = _extend({}, event);
        _dispatchCallback(func, context, [eventCopy], async);
      }
    }
  }
  return this;
};


/**
 * Prepares the elements for clipping/unclipping.
 *
 * @returns An Array of elements.
 * @private
 */
var _prepClip = function(elements) {
  // if elements is a string, ignore it
  if (typeof elements === "string") {
    elements = [];
  }
  // if the elements isn't an array, wrap it with one
  return typeof elements.length !== "number" ? [elements] : elements;
};


/**
 * Add an event listener to a DOM element (because IE<9 sucks).
 *
 * @returns The element.
 * @private
 */
var _addEventHandler = function(element, method, func) {
  if (!element || element.nodeType !== 1) {
    return element;
  }

  if (element.addEventListener) { // all browsers except IE<9
    element.addEventListener(method, func, false);
  } else if (element.attachEvent) { // IE<9
    element.attachEvent("on" + method, func);
  }
  return element;
};


/**
 * Remove an event listener from a DOM element (because IE<9 sucks).
 *
 * @returns The element.
 * @private
 */
var _removeEventHandler = function(element, method, func) {
  if (!element || element.nodeType !== 1) {
    return element;
  }

  // All browsers except IE<9
  if (element.removeEventListener) {
    element.removeEventListener(method, func, false);
  }
  // IE<9
  else if (element.detachEvent) {
    element.detachEvent("on" + method, func);
  }
  return element;
};


/**
 * Add `mouseover`, `mousedown`, `mouseup`, and `mouseout` handler functions for a clipped element.
 *
 * @returns `undefined`
 * @private
 */
var _addMouseHandlers = function(element) {
  if (!(element && element.nodeType === 1)) {
    return;
  }

  var _elementMouseOver, _elementMouseDown, _elementMouseUp, _elementMouseOut;

  // Create a `mousedown` handler function
  _elementMouseDown = function(/* event */) {
    // Add the active class
    _addClass(element, _globalConfig.activeClass);
  };

  // Create a `mouseup` handler function
  _elementMouseUp = function(/* event */) {
    // Remove the active class
    _removeClass(element, _globalConfig.activeClass);
  };

  // Create a `mouseout` handler function
  _elementMouseOut = function(event) {
    // IE usually doesn't pass the `event`
    if (!event) {
      event = _window.event;
    }
    if (!event) {
      return;
    }

    // Acquire the `relatedTarget`, or bail out
    var relTarget = event.relatedTarget || event.toElement || null;
    if (!(relTarget && relTarget.nodeType === 1)) {
      return;
    }

    // If the mouse is moving to the Flash object, bail out
    var htmlBridge;
    if (
        _flashState.bridge != null &&
        (
          relTarget === _flashState.bridge ||
          ((htmlBridge = _getHtmlBridge(_flashState.bridge)) && relTarget === htmlBridge)
        )
    ) {
      return;
    }

    // If the mouse is moving to any other element, deactivate and...
    ZeroClipboard.deactivate();

    // ...remove all mouse handler functions other than `mouseover`
    _removeEventHandler(element, "mouseup", _elementMouseUp);
    _removeEventHandler(element, "mousedown", _elementMouseDown);
    _removeEventHandler(element, "mouseout", _elementMouseOut);

    // ...and remove the ZCEvent-bound handlers
    // NOTE: This is temporary until the Flash mouse event capturing is removed!
    ZeroClipboard.off("mouseup", _elementMouseUp);
    ZeroClipboard.off("mousedown", _elementMouseDown);
    ZeroClipboard.off("mouseout", _elementMouseOut);
  };

  // Create a `mouseover` handler function
  _elementMouseOver = function(event) {
    // IE usually doesn't pass the `event`
    if (!event) {
      event = _window.event;
    }
    if (!event) {
      return;
    }

    // Set this as the new currently active element
    ZeroClipboard.activate(element);

    // Add all mouse handler functions other than `mouseover`
    _addEventHandler(element, "mouseout", _elementMouseOut);
    _addEventHandler(element, "mousedown", _elementMouseDown);
    _addEventHandler(element, "mouseup", _elementMouseUp);

    // ...and add the ZCEvent-bound handlers
    // NOTE: This is temporary until the Flash mouse event capturing is removed!
    ZeroClipboard.on("mouseout", _elementMouseOut);
    ZeroClipboard.on("mousedown", _elementMouseDown);
    ZeroClipboard.on("mouseup", _elementMouseUp);
  };

  // Add the `mouseover` handler function
  _addEventHandler(element, "mouseover", _elementMouseOver);

  // ...and add the ZCEvent-bound handler
  // NOTE: This is temporary until the Flash mouse event capturing is removed!
  ZeroClipboard.on("mouseover", _elementMouseOver);

  // Save these function references to a global variable
  _mouseHandlers[element.zcClippingId] = {
    mouseover: _elementMouseOver,
    mouseout:  _elementMouseOut,
    mousedown: _elementMouseDown,
    mouseup:   _elementMouseUp
  };
};


/**
 * Remove `mouseover`, `mousedown`, `mouseup`, and `mouseout` handler functions for a clipped element.
 *
 * @returns `undefined`
 * @private
 */
var _removeMouseHandlers = function(element) {
  if (!(element && element.nodeType === 1)) {
    return;
  }

  // Retrieve these function references from a global variable
  var mouseHandlers = _mouseHandlers[element.zcClippingId];
  if (!(typeof mouseHandlers === "object" && mouseHandlers)) {
    return;
  }

  // Remove the mouse event handlers
  if (typeof mouseHandlers.mouseup === "function") {
    _removeEventHandler(element, "mouseup", mouseHandlers.mouseup);
  }
  if (typeof mouseHandlers.mousedown === "function") {
    _removeEventHandler(element, "mousedown", mouseHandlers.mousedown);
  }
  if (typeof mouseHandlers.mouseout === "function") {
    _removeEventHandler(element, "mouseout", mouseHandlers.mouseout);
  }
  if (typeof mouseHandlers.mouseover === "function") {
    _removeEventHandler(element, "mouseover", mouseHandlers.mouseover);
  }

  // ...and remove the ZCEvent-bound handlers
  // NOTE: This is temporary until the Flash mouse event capturing is removed!
  ZeroClipboard.off("mouseup", mouseHandlers.mouseup);
  ZeroClipboard.off("mousedown", mouseHandlers.mousedown);
  ZeroClipboard.off("mouseout", mouseHandlers.mouseout);
  ZeroClipboard.off("mouseover", mouseHandlers.mouseover);

  // Delete these function references from a global variable
  delete _mouseHandlers[element.zcClippingId];
};