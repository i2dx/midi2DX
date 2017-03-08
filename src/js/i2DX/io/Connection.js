i2DX.ns('io')

function createConnection (options) {
  if (typeof navigator.requestMIDIAccess === 'function') {
    return createMIDIConnection()
  } else if (typeof webkit !== 'undefined' && webkit.messageHandlers) {
    return createWebKitConnection(options)
  } else {
    return createWebSocketConnection(options)
  }
}

function createMIDIConnection (options) {
  var info = document.createElement('div')
  var outputPort
  info.setAttribute('style', 'position:absolute;bottom:0;right:0;z-index:1000')
  document.body.appendChild(info)
  setStatus('Requesting MIDI access')
  navigator.requestMIDIAccess({sysex: false}).then(function (access) {
    setStatus('Yes MIDI!')
    ok(access)
  }, function () {
    setStatus('No MIDI! :(')
  })
  function setStatus (status) {
    info.textContent = status
  }
  function ok (access) {
    info.onclick = click
    info.ontouchstart = click
    setStatus('Searching.')
    void (function () {
      try {
        var ports = getPorts()
        setStatus('Found ' + ports.length + ' ports!')
        if (ports[0]) {
          use(ports[0].port)
        }
      } catch (e) {
        setStatus('Error: ' + e)
      }
    })()
    function getPorts () {
      var outputs = []
      for (
        var it = access.outputs.keys(), val = it.next();
        !val.done;
        val = it.next()
      ) {
        outputs.push(val.value)
      }
      return outputs.map(function (key) {
        var port = access.outputs.get(key)
        return {key: key, name: port.name, port: port}
      })
    }
    function click (x) {
      x.preventDefault()
      var ports = getPorts()
      var index = (function () {
        for (var i = 0; i < ports.length; i++) {
          if (ports[i].port === outputPort) return (i + 1) % ports.length
        }
        return 0
      })()
      var selectedPort = ports[index]
      if (!selectedPort) return
      use(selectedPort.port)
    }
  }
  function use (port) {
    setStatus('Using port: ' + port.name)
    outputPort = port
  }
  function send (data) {
    if (outputPort) {
      var splitted = data.split(';')
      var mapping = {
        iidx_1: 0x31,
        iidx_2: 0x32,
        iidx_3: 0x33,
        iidx_4: 0x34,
        iidx_5: 0x35,
        iidx_6: 0x36,
        iidx_7: 0x37,
        turntable_cw: 0x30,
        turntable_ccw: 0x2f
      }
      var midi = [
        +splitted[0] ? 0x90 : 0x80,
        mapping[splitted[1]] || 0x60,
        0x7f
      ]
      outputPort.send(midi)
    }
  }
  return {send: send}
}

function createWebKitConnection (options) {
  function send (message) {
    webkit.messageHandlers.send.postMessage(message)
  }
  return {send: send}
}

function createWebSocketConnection (options) {
  var ws = new WebSocket('ws://' + location.host + '/ws')
  ws.onopen = options.onOpen
  ws.onclose = options.onClose
  ws.onmessage = options.onMessage
  ws.onerror = options.onError

  var junk
  var sent = false

  for (junk = 'junk'; junk.length < 4096; junk += junk) {
  }
  this._junk = junk

  var timer

  function send () {
    sendRaw(data.join(';'))
    clearTimeout(timer)
    sent = true
    timer = setTimeout(flush, 1)
  }

  function flush () {
    if (sent) {
      sent = false
      ws.send('junk;' + junk)
    }
  }

  return {send: send}
}

/**
 * @class
 * @singleton
 * A WebSockets connection to i2DX
 */
i2DX.io.Connection = {
  _ws: null,
  _statusEl: null,
  _sent: false,

  /**
	 * Initialize the Connection. Must be called before use.
	 */
  init: function () {
    i2DX.broadcast('status', 'Connecting to i2DX...')
    this._connection = createConnection({
      onOpen: i2DX.proxy(this, '_onopen'),
      onClose: i2DX.proxy(this, '_onclose'),
      onMessage: i2DX.proxy(this, '_onmessage'),
      onError: i2DX.proxy(this, '_onerror')
    })
    i2DX.listen('down', i2DX.proxy(this, '_msgDown'))
    i2DX.listen('up', i2DX.proxy(this, '_msgUp'))
  },

  /**
	 * Send raw data to server. Do not use!
	 * @param {String} x data to send
	 */
  sendRaw: function (x) {
    try {
      this._connection.send(x)
    } catch (e) {
      i2DX.broadcast('status', 'Cannot send data: ' + e)
    }
  },

  /**
	 * Send a data to server
	 * @param {Array} data data to send, as array
	 */
  send: function (data) {
    this.sendRaw(data.join(';'))
  },

  _onopen: function (e) {
    i2DX.broadcast('status', 'Connected to i2DX Server!')
  },

  _onclose: function (e) {
    i2DX.broadcast('status', 'Disconnected from i2DX Server.')
  },

  _onmessage: function (e) {
    i2DX.broadcast('status', e.data)
  },

  _onerror: function (e) {
    i2DX.broadcast('status', 'Error: ' + e)
    try {
      console.error(e)
    } catch (e) {}
  },

  _msgDown: function (key, player) {
    this.send(['1', key, player])
  },

  _msgUp: function (key, player) {
    this.send(['0', key, player])
  }
}
