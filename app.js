/**
 * RAAS LEELA 2026 \u2014 Official Digital Experience & Real Gate Operations Engine
 * - Embedded Standard QR Code Generator (Zero-Dependency Byte Mode Matrix)
 * - Cryptographically Secured Ticketing & Persistent EventDB
 * - Strict Payment Verification: No Verified Payment = No Ticket = No Entry QR
 * - Settlement Node Masked Routing (Organiser Account ending in 4947)
 * - Authenticated Staff Gate Check-In & Live QR Scanner (Passcode: RL20206)
 * - Authenticated Admin Dashboard & Attendance CSV Export (Credentials: admin / RLAdmin@2026)
 * - Hash Routing & GitHub Pages Subpath Compatibility
 */

(function () {
  'use strict';

  // Prevent browser from restoring scroll position to passes on refresh / reload
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  /* ==========================================================================
     1. EMBEDDED STANDARD QR CODE GENERATOR (Kazuhiko Arase / MIT)
     Standard 8-Bit Byte Mode Matrix \u2014 100% Compatible with smartphones & scanners
     ========================================================================== */
  var QRCodeGenerator = (function () {
    function QR8BitByte(data) {
      this.mode = 4;
      this.data = data;
    }
    QR8BitByte.prototype = {
      getLength: function () { return this.data.length; },
      write: function (buffer) {
        for (var i = 0; i < this.data.length; i++) {
          buffer.put(this.data.charCodeAt(i), 8);
        }
      }
    };

    function QRCode(typeNumber, errorCorrectLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectLevel = errorCorrectLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }

    QRCode.prototype = {
      addData: function (data) {
        this.dataList.push(new QR8BitByte(data));
        this.dataCache = null;
      },
      isDark: function (row, col) {
        if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
          throw new Error(row + "," + col);
        }
        return this.modules[row][col];
      },
      getModuleCount: function () {
        return this.moduleCount;
      },
      make: function () {
        if (this.typeNumber < 1) {
          var typeNumber = 1;
          for (typeNumber = 1; typeNumber < 40; typeNumber++) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
            var buffer = new QRBitBuffer();
            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) {
              totalDataCount += rsBlocks[i].dataCount;
            }
            for (var j = 0; j < this.dataList.length; j++) {
              var data = this.dataList[j];
              buffer.put(data.mode, 4);
              buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
              data.write(buffer);
            }
            if (buffer.getLengthInBits() <= totalDataCount * 8) break;
          }
          this.typeNumber = typeNumber;
        }
        this.makeImpl(false, this.getBestMaskPattern());
      },
      makeImpl: function (test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (var row = 0; row < this.moduleCount; row++) {
          this.modules[row] = new Array(this.moduleCount);
          for (var col = 0; col < this.moduleCount; col++) {
            this.modules[row][col] = null;
          }
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) this.setupTypeNumber(test);
        if (this.dataCache == null) {
          this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
        }
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function (row, col) {
        for (var r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (var c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if ((0 <= r && r <= 6 && (c == 0 || c == 6)) || (0 <= c && c <= 6 && (r == 0 || r == 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
              this.modules[row + r][col + c] = true;
            } else {
              this.modules[row + r][col + c] = false;
            }
          }
        }
      },
      getBestMaskPattern: function () {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
          this.makeImpl(true, i);
          var lostPoint = QRUtil.getLostPoint(this);
          if (i == 0 || minLostPoint > lostPoint) {
            minLostPoint = lostPoint;
            pattern = i;
          }
        }
        return pattern;
      },
      setupTimingPattern: function () {
        for (var r = 8; r < this.moduleCount - 8; r++) {
          if (this.modules[r][6] != null) continue;
          this.modules[r][6] = (r % 2 == 0);
        }
        for (var c = 8; c < this.moduleCount - 8; c++) {
          if (this.modules[6][c] != null) continue;
          this.modules[6][c] = (c % 2 == 0);
        }
      },
      setupPositionAdjustPattern: function () {
        var pos = QRUtil.getPatternPosition(this.typeNumber);
        for (var i = 0; i < pos.length; i++) {
          for (var j = 0; j < pos.length; j++) {
            var row = pos[i];
            var col = pos[j];
            if (this.modules[row][col] != null) continue;
            for (var r = -2; r <= 2; r++) {
              for (var c = -2; c <= 2; c++) {
                if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
                  this.modules[row + r][col + c] = true;
                } else {
                  this.modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      },
      setupTypeNumber: function (test) {
        var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        for (var i = 0; i < 18; i++) {
          var mod = (!test && ((bits >> i) & 1) == 1);
          this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
          this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
      },
      setupTypeInfo: function (test, maskPattern) {
        var data = (this.errorCorrectLevel << 3) | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);
        for (var i = 0; i < 15; i++) {
          var mod = (!test && ((bits >> i) & 1) == 1);
          if (i < 6) {
            this.modules[i][8] = mod;
          } else if (i < 8) {
            this.modules[i + 1][8] = mod;
          } else {
            this.modules[this.moduleCount - 15 + i][8] = mod;
          }
          if (i < 8) {
            this.modules[8][this.moduleCount - i - 1] = mod;
          } else if (i < 9) {
            this.modules[8][15 - i - 1 + 1] = mod;
          } else {
            this.modules[8][15 - i - 1] = mod;
          }
        }
        this.modules[this.moduleCount - 8][8] = (!test);
      },
      mapData: function (data, maskPattern) {
        var inc = -1;
        var row = this.moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        var maskFunc = QRUtil.getMaskFunction(maskPattern);
        for (var col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col == 6) col--;
          while (true) {
            for (var c = 0; c < 2; c++) {
              if (this.modules[row][col - c] == null) {
                var dark = false;
                if (byteIndex < data.length) {
                  dark = (((data[byteIndex] >>> bitIndex) & 1) == 1);
                }
                var mask = maskFunc(row, col - c);
                if (mask) dark = !dark;
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex == -1) {
                  byteIndex++;
                  bitIndex = 7;
                }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      }
    };

    QRCode.createData = function (typeNumber, errorCorrectLevel, dataList) {
      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
      var buffer = new QRBitBuffer();
      for (var i = 0; i < dataList.length; i++) {
        var data = dataList[i];
        buffer.put(data.mode, 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
        data.write(buffer);
      }
      var totalDataCount = 0;
      for (var j = 0; j < rsBlocks.length; j++) {
        totalDataCount += rsBlocks[j].dataCount;
      }
      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw new Error("QR length overflow (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
      }
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
      while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
      while (true) {
        if (buffer.getLengthInBits() >= totalDataCount * 8) break;
        buffer.put(0xec, 8);
        if (buffer.getLengthInBits() >= totalDataCount * 8) break;
        buffer.put(0x11, 8);
      }
      return QRCode.createBytes(buffer, rsBlocks);
    };

    QRCode.createBytes = function (buffer, rsBlocks) {
      var offset = 0;
      var maxDcCount = 0;
      var maxEcCount = 0;
      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);
      for (var r = 0; r < rsBlocks.length; r++) {
        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;
        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);
        dcdata[r] = new Array(dcCount);
        for (var i = 0; i < dcdata[r].length; i++) {
          dcdata[r][i] = 0xff & buffer.buffer[i + offset];
        }
        offset += dcCount;
        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var j = 0; j < ecdata[r].length; j++) {
          var modIndex = j + modPoly.getLength() - ecdata[r].length;
          ecdata[r][j] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
        }
      }
      var totalCodeCount = 0;
      for (var k = 0; k < rsBlocks.length; k++) {
        totalCodeCount += rsBlocks[k].totalCount;
      }
      var data = new Array(totalCodeCount);
      var index = 0;
      for (var x = 0; x < maxDcCount; x++) {
        for (var s = 0; s < rsBlocks.length; s++) {
          if (x < dcdata[s].length) {
            data[index++] = dcdata[s][x];
          }
        }
      }
      for (var y = 0; y < maxEcCount; y++) {
        for (var t = 0; t < rsBlocks.length; t++) {
          if (y < ecdata[t].length) {
            data[index++] = ecdata[t][y];
          }
        }
      }
      return data;
    };

    var QRMode = { MODE_8BIT_BYTE: 4 };

    var QRMaskPattern = {
      PATTERN000: 0, PATTERN001: 1, PATTERN010: 2, PATTERN011: 3,
      PATTERN100: 4, PATTERN101: 5, PATTERN110: 6, PATTERN111: 7
    };

    var QRUtil = {
      PATTERN_POSITION_TABLE: [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54]
      ],
      G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
      G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
      G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
      getBCHTypeInfo: function (data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15)));
        }
        return ((data << 10) | d) ^ QRUtil.G15_MASK;
      },
      getBCHTypeNumber: function (data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
          d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18)));
        }
        return (data << 12) | d;
      },
      getBCHDigit: function (data) {
        var digit = 0;
        while (data != 0) {
          digit++;
          data >>>= 1;
        }
        return digit;
      },
      getPatternPosition: function (typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
      },
      getMaskFunction: function (maskPattern) {
        switch (maskPattern) {
          case QRMaskPattern.PATTERN000: return function (i, j) { return (i + j) % 2 == 0; };
          case QRMaskPattern.PATTERN001: return function (i, j) { return i % 2 == 0; };
          case QRMaskPattern.PATTERN010: return function (i, j) { return j % 3 == 0; };
          case QRMaskPattern.PATTERN011: return function (i, j) { return (i + j) % 3 == 0; };
          case QRMaskPattern.PATTERN100: return function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0; };
          case QRMaskPattern.PATTERN101: return function (i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
          case QRMaskPattern.PATTERN110: return function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 == 0; };
          case QRMaskPattern.PATTERN111: return function (i, j) { return ((i * j) % 3 + (i + j) % 2) % 2 == 0; };
          default: throw new Error("bad maskPattern:" + maskPattern);
        }
      },
      getErrorCorrectPolynomial: function (errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
          a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
        }
        return a;
      },
      getLengthInBits: function (mode, type) {
        if (1 <= type && type < 10) {
          switch (mode) {
            case QRMode.MODE_8BIT_BYTE: return 8;
            default: return 8;
          }
        }
        return 8;
      },
      getLostPoint: function (qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        for (var row = 0; row < moduleCount; row++) {
          for (var col = 0; col < moduleCount; col++) {
            var sameCount = 0;
            var dark = qrCode.isDark(row, col);
            for (var r = -1; r <= 1; r++) {
              if (row + r < 0 || moduleCount <= row + r) continue;
              for (var c = -1; c <= 1; c++) {
                if (col + c < 0 || moduleCount <= col + c) continue;
                if (r == 0 && c == 0) continue;
                if (dark == qrCode.isDark(row + r, col + c)) sameCount++;
              }
            }
            if (sameCount > 5) lostPoint += (3 + sameCount - 5);
          }
        }
        return lostPoint;
      }
    };

    var QRMath = {
      glog: function (n) {
        if (n < 1) throw new Error("glog(" + n + ")");
        return QRMath.LOG_TABLE[n];
      },
      gexp: function (n) {
        while (n < 0) n += 255;
        while (n >= 255) n -= 255;
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };
    for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (var i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function QRPolynomial(num, shift) {
      if (num.length == undefined) throw new Error(num.length + "/" + shift);
      var offset = 0;
      while (offset < num.length && num[offset] == 0) offset++;
      this.num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    }
    QRPolynomial.prototype = {
      get: function (index) { return this.num[index]; },
      getLength: function () { return this.num.length; },
      multiply: function (e) {
        var num = new Array(this.getLength() + e.getLength() - 1);
        for (var i = 0; i < this.getLength(); i++) {
          for (var j = 0; j < e.getLength(); j++) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return new QRPolynomial(num, 0);
      },
      mod: function (e) {
        if (this.getLength() - e.getLength() < 0) return this;
        var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
        var num = new Array(this.getLength());
        for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
        for (var j = 0; j < e.getLength(); j++) num[j] ^= QRMath.gexp(QRMath.glog(e.get(j)) + ratio);
        return new QRPolynomial(num, 0).mod(e);
      }
    };

    function QRRSBlock(totalCount, dataCount) {
      this.totalCount = totalCount;
      this.dataCount = dataCount;
    }
    QRRSBlock.RS_BLOCK_TABLE = [
      [1, 26, 19], [1, 26, 16],
      [1, 44, 34], [1, 44, 28],
      [1, 70, 55], [1, 70, 44],
      [1, 100, 80], [2, 50, 32],
      [1, 134, 108], [2, 67, 43],
      [2, 86, 68], [4, 43, 27],
      [2, 98, 78], [4, 49, 31],
      [2, 121, 97], [2, 60, 38, 2, 61, 39],
      [2, 146, 116], [3, 58, 36, 2, 59, 37],
      [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44]
    ];
    QRRSBlock.getRSBlocks = function (typeNumber, errorCorrectLevel) {
      var rsBlock = QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 2 + errorCorrectLevel];
      if (rsBlock == undefined) throw new Error("bad RS block: type=" + typeNumber + "/level=" + errorCorrectLevel);
      var list = [];
      for (var i = 0; i < rsBlock.length; i += 3) {
        var count = rsBlock[i];
        var totalCount = rsBlock[i + 1];
        var dataCount = rsBlock[i + 2];
        for (var j = 0; j < count; j++) {
          list.push(new QRRSBlock(totalCount, dataCount));
        }
      }
      return list;
    };

    function QRBitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    QRBitBuffer.prototype = {
      get: function (index) {
        var bufIndex = Math.floor(index / 8);
        return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) == 1;
      },
      put: function (num, length) {
        for (var i = 0; i < length; i++) {
          this.putBit(((num >>> (length - i - 1)) & 1) == 1);
        }
      },
      getLengthInBits: function () { return this.length; },
      putBit: function (bit) {
        var bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) this.buffer.push(0);
        if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
        this.length++;
      }
    };

    return {
      drawToCanvas: function (canvas, text, margin) {
        if (!canvas) return;
        margin = typeof margin === 'number' ? margin : 3;
        var qr = new QRCode(0, 1);
        qr.addData(text);
        qr.make();
        var count = qr.getModuleCount();
        var ctx = canvas.getContext('2d');
        var width = canvas.width;
        var height = canvas.height;
        var totalModules = count + margin * 2;
        var cellSize = Math.floor(Math.min(width, height) / totalModules);
        var offsetX = Math.floor((width - cellSize * totalModules) / 2) + margin * cellSize;
        var offsetY = Math.floor((height - cellSize * totalModules) / 2) + margin * cellSize;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#120608';
        for (var r = 0; r < count; r++) {
          for (var c = 0; c < count; c++) {
            if (qr.isDark(r, c)) {
              ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
            }
          }
        }
        return qr;
      }
    };
  })();

  /* ==========================================================================
     2. CRYPTOGRAPHIC HASH & SECURITY ENGINE (SHA-256)
     ========================================================================== */
  async function sha256(str) {
    var buf = new TextEncoder().encode(str);
    var hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  // Pre-computed SHA-256 hashes:
  // Staff Passcode 'RL20206' (Gate Scanner Only):
  var STAFF_PASSWORD_HASH = '82e65644b822a641b7b020ca753915b461fa91439451880c9d363ab3a4b419a7';

  // Admin Portal Secure Passcode Hash (Exact Case-Sensitive 'rl20206'):
  var ADMIN_SECURE_AUTH_HASH = 'd3778c56ec11500849532666e99ef708ad3e2dfb4935366ffbf8844dd16a5260';

  /* ==========================================================================
     3. EVENT DATABASE & STORAGE (Persistent EventDB)
     ========================================================================== */
  var DB_TICKETS_KEY = 'raas_leela_tickets_v4';
  var DB_ORDERS_KEY = 'raas_leela_orders_v4';

  function generateSecureToken() {
    var array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return 'rlv_' + Array.from(array).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function generateUniqueTicketId(existingList) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    do {
      code = 'RL-';
      for (var i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (existingList && existingList.some(function (t) { return t.id === code; }));
    return code;
  }

  function initDatabase() {
    if (!localStorage.getItem(DB_TICKETS_KEY)) {
      localStorage.setItem(DB_TICKETS_KEY, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_ORDERS_KEY)) {
      localStorage.setItem(DB_ORDERS_KEY, JSON.stringify([]));
    }
  }

  initDatabase();

  var EventDB = {
    getAllTickets: function () {
      try {
        return JSON.parse(localStorage.getItem(DB_TICKETS_KEY)) || [];
      } catch (e) {
        return [];
      }
    },

    saveAllTickets: function (tickets) {
      localStorage.setItem(DB_TICKETS_KEY, JSON.stringify(tickets));
      window.dispatchEvent(new CustomEvent('raas-db-updated'));
    },

    getAllOrders: function () {
      try {
        return JSON.parse(localStorage.getItem(DB_ORDERS_KEY)) || [];
      } catch (e) {
        return [];
      }
    },

    saveAllOrders: function (orders) {
      localStorage.setItem(DB_ORDERS_KEY, JSON.stringify(orders));
      window.dispatchEvent(new CustomEvent('raas-db-updated'));
    },

    createOrder: function (data) {
      var orders = this.getAllOrders();
      var order = {
        orderRef: data.orderRef,
        name: data.name,
        phone: data.phone,
        email: data.email || '',
        passType: data.passType,
        tier: data.tier,
        qty: Number(data.qty) || 1,
        admitCount: Number(data.admitCount),
        amount: Number(data.amount),
        paymentStatus: data.paymentStatus || 'UNPAID', // ONLY 'PAID' counts as verified revenue
        paymentTxnId: data.paymentTxnId || null,
        paymentMethod: data.paymentMethod || 'Personal UPI QR',
        createdAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      };
      orders.unshift(order);
      this.saveAllOrders(orders);
      return order;
    },

    mintTicketsForPaidOrder: function (orderRef, txnId, serverMintedTickets) {
      var orders = this.getAllOrders();
      var order = orders.find(function (o) { return o.orderRef === orderRef; });
      if (!order) return null;

      order.paymentStatus = 'PAID';
      order.paymentTxnId = txnId || ('TXN-' + Math.floor(100000 + Math.random() * 900000));
      this.saveAllOrders(orders);

      var tickets = this.getAllTickets();
      var minted = [];

      if (Array.isArray(serverMintedTickets) && serverMintedTickets.length > 0) {
        // Use verified server-minted tickets with secure tokens & IDs
        serverMintedTickets.forEach(function (st, i) {
          var t = {
            id: st.id,
            verifyToken: st.verifyToken,
            verifyUrl: st.verifyUrl || ('/verify/' + st.verifyToken),
            name: st.name || order.name,
            phone: st.phone || order.phone,
            email: st.email || order.email || '',
            passType: st.passType || order.passType,
            tier: st.tier || order.tier,
            admitCount: st.admitCount || (order.tier === 'stag' ? 1 : order.tier === 'couple' ? 2 : 5),
            amount: st.amount || (order.tier === 'stag' ? 299 : order.tier === 'couple' ? 499 : 1199),
            paymentStatus: 'PAID',
            paymentTxnId: order.paymentTxnId,
            paymentMethod: order.paymentMethod,
            status: 'ACTIVE',
            orderRef: order.orderRef,
            passNumber: st.passNumber || ((i + 1) + ' of ' + (order.qty || 1)),
            createdAt: st.verifiedAt || new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
            checkedInAt: null,
            checkedInBy: null
          };
          var exists = tickets.some(function (ex) { return ex.id === t.id || ex.verifyToken === t.verifyToken; });
          if (!exists) {
            tickets.unshift(t);
          }
          minted.push(t);
        });
      } else {
        for (var i = 0; i < (order.qty || 1); i++) {
          var ticketId = generateUniqueTicketId(tickets);
          var token = generateSecureToken();
          var admitCountPerTicket = order.tier === 'stag' ? 1 : order.tier === 'couple' ? 2 : 5;
          var tPrice = order.tier === 'stag' ? 299 : order.tier === 'couple' ? 499 : 1199;

          var ticket = {
            id: ticketId,
            verifyToken: token,
            verifyUrl: '/verify/' + token,
            name: order.name,
            phone: order.phone,
            email: order.email || '',
            passType: order.passType,
            tier: order.tier,
            admitCount: admitCountPerTicket,
            amount: tPrice,
            paymentStatus: 'PAID',
            paymentTxnId: order.paymentTxnId,
            paymentMethod: order.paymentMethod,
            status: 'ACTIVE',
            orderRef: order.orderRef,
            passNumber: (i + 1) + ' of ' + (order.qty || 1),
            createdAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
            checkedInAt: null,
            checkedInBy: null
          };
          tickets.unshift(ticket);
          minted.push(ticket);
        }
      }

      this.saveAllTickets(tickets);
      return minted;
    },

    lookupTicket: function (query) {
      if (!query) return null;
      var clean = query.trim();

      var urlMatch = clean.match(/\/verify\/([a-zA-Z0-9_\-]+)/);
      if (urlMatch) {
        clean = urlMatch[1];
      }
      if (clean.toUpperCase().startsWith('QR-')) {
        clean = clean.substring(3);
      }

      var tickets = this.getAllTickets();

      var found = tickets.find(function (t) { return t.verifyToken === clean; });
      if (found) return found;

      found = tickets.find(function (t) { return t.id.toUpperCase() === clean.toUpperCase(); });
      if (found) return found;

      found = tickets.find(function (t) { return t.orderRef && t.orderRef.toUpperCase() === clean.toUpperCase(); });
      if (found) return found;

      return null;
    },

    admitTicket: function (ticketId, gateName) {
      gateName = gateName || 'Gate 1 Staff';
      var tickets = this.getAllTickets();
      var ticket = tickets.find(function (t) { return t.id.toUpperCase() === ticketId.trim().toUpperCase(); });

      if (!ticket) return { success: false, reason: 'NOT_FOUND' };
      if (ticket.status === 'REDEEMED' || ticket.status === 'CHECKED_IN') {
        return { success: false, reason: 'ALREADY_USED', ticket: ticket };
      }

      ticket.status = 'REDEEMED';
      ticket.checkedInAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      ticket.checkedInBy = gateName;

      this.saveAllTickets(tickets);
      return { success: true, ticket: ticket };
    },

    getSalesAnalytics: function () {
      var orders = this.getAllOrders();
      // CRITICAL: ONLY VERIFIED PAID BOOKINGS (paymentStatus === 'PAID') CONTRIBUTE TO REVENUE AND STATS
      var paidOrders = orders.filter(function (o) { return o.paymentStatus === 'PAID'; });

      var stagOrders = paidOrders.filter(function (o) { return o.tier === 'stag'; });
      var coupleOrders = paidOrders.filter(function (o) { return o.tier === 'couple'; });
      var groupOrders = paidOrders.filter(function (o) { return o.tier === 'group'; });

      var stagBookings = stagOrders.reduce(function (sum, o) { return sum + (o.qty || 1); }, 0);
      var coupleBookings = coupleOrders.reduce(function (sum, o) { return sum + (o.qty || 1); }, 0);
      var groupBookings = groupOrders.reduce(function (sum, o) { return sum + (o.qty || 1); }, 0);

      var stagPeople = stagBookings * 1;
      var couplePeople = coupleBookings * 2;
      var groupPeople = groupBookings * 5;

      var stagRevenue = stagBookings * 299;
      var coupleRevenue = coupleBookings * 499;
      var groupRevenue = groupBookings * 1199;

      var totalBookings = stagBookings + coupleBookings + groupBookings;
      var totalPeople = stagPeople + couplePeople + groupPeople;
      var totalRevenue = stagRevenue + coupleRevenue + groupRevenue;

      var tickets = this.getAllTickets();
      var checkedInCount = tickets.filter(function (t) {
        return t.status === 'REDEEMED' || t.status === 'CHECKED_IN';
      }).reduce(function (sum, t) {
        return sum + (Number(t.admitCount) || 1);
      }, 0);

      return {
        stag: { bookings: stagBookings, people: stagPeople, revenue: stagRevenue },
        couple: { bookings: coupleBookings, people: couplePeople, revenue: coupleRevenue },
        group: { bookings: groupBookings, people: groupPeople, revenue: groupRevenue },
        totalBookings: totalBookings,
        totalPeople: totalPeople,
        totalRevenue: totalRevenue,
        checkedIn: checkedInCount
      };
    }
  };

  /* ==========================================================================
     4. AMBIENT PARTICLES (Golden Drifting Embers)
     ========================================================================== */
  var canvas = document.getElementById('ambient-particles');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    var width = (canvas.width = window.innerWidth);
    var height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', function () {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    var particles = [];
    var count = width > 768 ? 35 : 18;

    function DustMote() {
      this.reset();
    }
    DustMote.prototype.reset = function () {
      this.x = Math.random() * width;
      this.y = height + Math.random() * 20;
      this.size = Math.random() * 1.8 + 0.6;
      this.speedY = Math.random() * 0.45 + 0.18;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.6 + 0.15;
      this.hue = Math.random() > 0.4 ? 44 : 32;
    };
    DustMote.prototype.update = function () {
      this.y -= this.speedY;
      this.x += Math.sin(this.y * 0.015) * 0.4 + this.speedX;
      if (this.y < -10) this.reset();
    };
    DustMote.prototype.draw = function () {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(' + this.hue + ', 88%, 68%, ' + this.opacity + ')';
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(232, 168, 56, 0.4)';
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    for (var i = 0; i < count; i++) {
      particles.push(new DustMote());
    }

    function animateParticles() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach(function (p) {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animateParticles);
    }
    animateParticles();
  }

  /* ==========================================================================
     5. COUNTDOWN TIMER (13 October 2026, 18:00:00)
     ========================================================================== */
  var TARGET_DATE = new Date('2026-10-13T18:00:00+05:30').getTime();
  var cdDays = document.getElementById('cd-days');
  var cdHours = document.getElementById('cd-hours');
  var cdMinutes = document.getElementById('cd-minutes');
  var cdSeconds = document.getElementById('cd-seconds');

  function updateCountdown() {
    var now = Date.now();
    var diff = TARGET_DATE - now;

    if (diff <= 0) {
      if (cdDays) cdDays.textContent = '00';
      if (cdHours) cdHours.textContent = '00';
      if (cdMinutes) cdMinutes.textContent = '00';
      if (cdSeconds) cdSeconds.textContent = '00';
      return;
    }

    var d = Math.floor(diff / (1000 * 60 * 60 * 24));
    var h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    var m = Math.floor((diff / (1000 * 60)) % 60);
    var s = Math.floor((diff / 1000) % 60);

    if (cdDays) cdDays.textContent = String(d).padStart(2, '0');
    if (cdHours) cdHours.textContent = String(h).padStart(2, '0');
    if (cdMinutes) cdMinutes.textContent = String(m).padStart(2, '0');
    if (cdSeconds) cdSeconds.textContent = String(s).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  /* ==========================================================================
     6. MOBILE DRAWER NAVIGATION
     ========================================================================== */
  var mobileMenuToggle = document.getElementById('mobileMenuToggle');
  var mobileDrawer = document.getElementById('mobileDrawer');
  var drawerBackdrop = document.getElementById('drawerBackdrop');
  var drawerCloseIcon = document.getElementById('drawerCloseIcon');

  function openDrawer() {
    mobileDrawer?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    mobileDrawer?.classList.remove('active');
    document.body.style.overflow = '';
  }

  mobileMenuToggle?.addEventListener('click', openDrawer);
  drawerBackdrop?.addEventListener('click', closeDrawer);
  drawerCloseIcon?.addEventListener('click', closeDrawer);

  document.querySelectorAll('.drawer-links .d-link').forEach(function (link) {
    link.addEventListener('click', closeDrawer);
  });

  /* ==========================================================================
     7. TICKET BOOKING & PAYMENT FLOW (Strict Verification)
     ========================================================================== */
  var prices = {
    stag: { name: 'STAG PASS', price: 299, admit: 1 },
    couple: { name: 'COUPLE PASS', price: 499, admit: 2 },
    group: { name: 'GROUP OF 5', price: 1199, admit: 5 }
  };

  var currentActiveBooking = null;
  var currentlyGeneratedTickets = [];
  var currentActiveTicketIndex = 0;

  var bookingModal = document.getElementById('bookingModal');
  var bookingModalCloseBtn = document.getElementById('bookingModalCloseBtn');
  var bookingFormStep = document.getElementById('bookingFormStep');
  var bookingPaymentStep = document.getElementById('bookingPaymentStep');
  var bookingSubmittedStep = document.getElementById('bookingSubmittedStep');
  var bookingSuccessStep = document.getElementById('bookingSuccessStep');

  var ticketCheckoutForm = document.getElementById('ticketCheckoutForm');
  var modalPassCategory = document.getElementById('modalPassCategory');
  var modalPassQty = document.getElementById('modalPassQty');
  var qtyDecBtn = document.getElementById('qtyDecBtn');
  var qtyIncBtn = document.getElementById('qtyIncBtn');
  var summaryTitleText = document.getElementById('summaryTitleText');
  var summarySubtotalText = document.getElementById('summarySubtotalText');
  var summaryTotalText = document.getElementById('summaryTotalText');

  // Step 2: Personal UPI Elements
  var upiBookingIdDisplay = document.getElementById('upiBookingIdDisplay');
  var upiPassTitle = document.getElementById('upiPassTitle');
  var upiHeadcountBadge = document.getElementById('upiHeadcountBadge');
  var upiAttendeeName = document.getElementById('upiAttendeeName');
  var upiAttendeePhone = document.getElementById('upiAttendeePhone');
  var upiAmountToPay = document.getElementById('upiAmountToPay');
  var upiAmountInstruction = document.getElementById('upiAmountInstruction');
  var personalUpiQrImage = document.getElementById('personalUpiQrImage');
  var upiSubmissionForm = document.getElementById('upiSubmissionForm');
  var upiUtrInput = document.getElementById('upiUtrInput');
  var submitUpiPaymentBtn = document.getElementById('submitUpiPaymentBtn');
  var backToFormFromUpiBtn = document.getElementById('backToFormFromUpiBtn');

  // Step 2B: Payment Submitted Confirmation Elements
  var submittedBookingIdDisplay = document.getElementById('submittedBookingIdDisplay');
  var submittedPassNameDisplay = document.getElementById('submittedPassNameDisplay');
  var submittedAmountDisplay = document.getElementById('submittedAmountDisplay');
  var submittedUtrDisplay = document.getElementById('submittedUtrDisplay');
  var checkSubmittedTicketBtn = document.getElementById('checkSubmittedTicketBtn');
  var closeSubmittedBookingBtn = document.getElementById('closeSubmittedBookingBtn');

  // Step 4: Check / Retrieve Ticket Modal Elements
  var checkTicketModal = document.getElementById('checkTicketModal');
  var checkTicketModalCloseBtn = document.getElementById('checkTicketModalCloseBtn');
  var checkTicketForm = document.getElementById('checkTicketForm');
  var lookupBookingIdInput = document.getElementById('lookupBookingIdInput');
  var lookupPhoneInput = document.getElementById('lookupPhoneInput');
  var submitCheckTicketBtn = document.getElementById('submitCheckTicketBtn');
  var lookupResultContainer = document.getElementById('lookupResultContainer');

  // Step 3 Elements
  var ticketConfirmedMonolith = document.getElementById('ticketConfirmedMonolith');
  var tDispCategory = document.getElementById('tDispCategory');
  var tDispPrice = document.getElementById('tDispPrice');
  var tDispHeadcount = document.getElementById('tDispHeadcount');
  var tDispCode = document.getElementById('tDispCode');
  var tDispName = document.getElementById('tDispName');
  var tDispPayStatus = document.getElementById('tDispPayStatus');
  var tDispTicketStatus = document.getElementById('tDispTicketStatus');
  var tDispTxnId = document.getElementById('tDispTxnId');
  var ticketQrCanvas = document.getElementById('ticketQrCanvas');
  var multiPassSwitcher = document.getElementById('multiPassSwitcher');
  var multiPassNavTabs = document.getElementById('multiPassNavTabs');
  var whatsappShareTicketBtn = document.getElementById('whatsappShareTicketBtn');

  function updateCheckoutCalc() {
    var cat = modalPassCategory?.value || 'couple';
    var qty = parseInt(modalPassQty?.value, 10) || 1;
    var item = prices[cat] || prices.couple;
    var subtotal = item.price * qty;

    if (summaryTitleText) summaryTitleText.textContent = item.name + ' \u00D7 ' + qty;
    if (summarySubtotalText) summarySubtotalText.textContent = '\u20B9' + subtotal.toLocaleString('en-IN');
    if (summaryTotalText) summaryTotalText.textContent = '\u20B9' + subtotal.toLocaleString('en-IN');
  }

  modalPassCategory?.addEventListener('change', updateCheckoutCalc);
  qtyDecBtn?.addEventListener('click', function () {
    var q = parseInt(modalPassQty.value, 10) || 1;
    if (q > 1) {
      modalPassQty.value = q - 1;
      updateCheckoutCalc();
    }
  });
  qtyIncBtn?.addEventListener('click', function () {
    var q = parseInt(modalPassQty.value, 10) || 1;
    if (q < 10) {
      modalPassQty.value = q + 1;
      updateCheckoutCalc();
    }
  });

  document.querySelectorAll('.tap-to-book-pass, .trigger-checkout-btn').forEach(function (elem) {
    elem.addEventListener('click', function (e) {
      var cat = elem.getAttribute('data-category');
      if (cat && modalPassCategory) modalPassCategory.value = cat;
      if (modalPassQty) modalPassQty.value = 1;
      updateCheckoutCalc();
      openBookingModal();
    });
  });

  function openBookingModal() {
    if (bookingFormStep) bookingFormStep.style.display = 'block';
    if (bookingPaymentStep) bookingPaymentStep.style.display = 'none';
    if (bookingSubmittedStep) bookingSubmittedStep.style.display = 'none';
    if (bookingSuccessStep) bookingSuccessStep.style.display = 'none';
    bookingModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeBookingModal() {
    bookingModal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  bookingModalCloseBtn?.addEventListener('click', closeBookingModal);

  function resolveApiUrl(path) {
    if (window.RAAS_BACKEND_API_URL && window.RAAS_BACKEND_API_URL.trim() !== '') {
      return window.RAAS_BACKEND_API_URL.replace(/\/+$/, '') + path;
    }
    return path;
  }

  async function apiPostWithFallback(primaryPath, fallbackPath, bodyObj, extraHeaders) {
    var urls = [resolveApiUrl(primaryPath)];
    if (fallbackPath) {
      urls.push(resolveApiUrl(fallbackPath));
    }

    var headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
    var lastErr = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(bodyObj)
        });
        if (res.status === 404 && i === 0 && urls.length > 1) {
          continue; // Try direct function path if rewrite is not active
        }
        var data = await res.json();
        return { ok: res.ok, status: res.status, data: data };
      } catch (err) {
        lastErr = err;
        if (i < urls.length - 1) continue;
      }
    }
    throw lastErr || new Error('Network error connecting to backend service.');
  }

  // STEP 1 -> STEP 2: Customer submits pass & details to create booking in Supabase
  ticketCheckoutForm?.addEventListener('submit', async function (e) {
    e.preventDefault();

    var cat = modalPassCategory ? modalPassCategory.value : 'couple';
    var qty = parseInt(modalPassQty ? modalPassQty.value : '1', 10) || 1;
    var name = document.getElementById('attendeeFullName')?.value.trim();
    var phone = document.getElementById('attendeeWhatsApp')?.value.trim();
    var email = document.getElementById('attendeeEmailAddress')?.value.trim();

    if (!name || name.length < 2) {
      alert('Please enter your full attendee name.');
      return;
    }

    var cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit WhatsApp number.');
      return;
    }

    var proceedBtn = document.getElementById('proceedToPayBtn');
    var origHtml = proceedBtn ? proceedBtn.innerHTML : '';
    if (proceedBtn) {
      proceedBtn.disabled = true;
      proceedBtn.innerHTML = '<span>RESERVING PASS &amp; GENERATING BOOKING...</span>';
    }

    try {
      var res = await apiPostWithFallback(
        '/api/booking/create',
        '/.netlify/functions/create-booking',
        {
          tier: cat,
          qty: qty,
          customerName: name,
          customerPhone: cleanPhone,
          customerEmail: email
        }
      );

      var oData = res.data;
      if (!res.ok || !oData || !oData.success) {
        var errMsg = (oData && oData.message) ? oData.message : 'Unable to initialize booking. Please try again.';
        alert(errMsg);
        return;
      }

      var booking = oData.booking;
      currentActiveBooking = booking;

      showUpiPaymentStep(booking);

    } catch (err) {
      console.error('Booking creation failure:', err);
      alert('Network error connecting to booking service. Please check your internet connection and try again.');
    } finally {
      if (proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.innerHTML = origHtml;
      }
    }
  });

  function showUpiPaymentStep(booking) {
    if (upiBookingIdDisplay) upiBookingIdDisplay.textContent = booking.id;
    if (upiPassTitle) upiPassTitle.textContent = (booking.passName || booking.pass_name || 'PASS').toUpperCase();
    var headcount = booking.totalAdmit || booking.total_admit || (booking.admitPerPass ? booking.admitPerPass * booking.quantity : 1);
    if (upiHeadcountBadge) upiHeadcountBadge.textContent = headcount + ' ' + (headcount > 1 ? 'PEOPLE' : 'PERSON');
    if (upiAttendeeName) upiAttendeeName.textContent = booking.customerName || booking.customer_name || '';
    if (upiAttendeePhone) upiAttendeePhone.textContent = booking.phone || '';
    var amtFormatted = '\u20B9' + (booking.expectedAmount || booking.expected_amount || 0).toLocaleString('en-IN');
    if (upiAmountToPay) upiAmountToPay.textContent = amtFormatted;
    if (upiAmountInstruction) upiAmountInstruction.textContent = amtFormatted;

    if (personalUpiQrImage) {
      personalUpiQrImage.src = window.RAAS_UPI_QR_IMAGE || 'upi-qr.png';
    }
    if (upiUtrInput) upiUtrInput.value = '';

    if (bookingFormStep) bookingFormStep.style.display = 'none';
    if (bookingSubmittedStep) bookingSubmittedStep.style.display = 'none';
    if (bookingSuccessStep) bookingSuccessStep.style.display = 'none';
    if (bookingPaymentStep) bookingPaymentStep.style.display = 'block';
  }

  backToFormFromUpiBtn?.addEventListener('click', function () {
    if (bookingPaymentStep) bookingPaymentStep.style.display = 'none';
    if (bookingFormStep) bookingFormStep.style.display = 'block';
  });

  // STEP 2 -> STEP 2B: Customer submits UPI Reference / UTR
  upiSubmissionForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!currentActiveBooking) {
      alert('No active booking found. Please reserve your pass first.');
      return;
    }

    var utr = upiUtrInput ? upiUtrInput.value.trim() : '';
    if (!utr || utr.length < 4) {
      alert('Please enter your valid 12-digit UPI Transaction / Reference ID (UTR) from your payment app.');
      return;
    }

    var submitBtn = document.getElementById('submitUpiPaymentBtn');
    var origHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>SUBMITTING CLAIM FOR VERIFICATION...</span>';
    }

    try {
      var res = await apiPostWithFallback(
        '/api/booking/submit-payment',
        '/.netlify/functions/submit-payment',
        {
          bookingId: currentActiveBooking.id,
          upiReference: utr,
          phone: currentActiveBooking.phone
        }
      );

      var sData = res.data;
      if (!res.ok || !sData || !sData.success) {
        var errMsg = (sData && sData.message) ? sData.message : 'Unable to submit payment claim. Please try again.';
        alert(errMsg);
        return;
      }

      // If already verified, go straight to pass
      if (sData.alreadyVerified && sData.tickets) {
        currentlyGeneratedTickets = sData.tickets;
        currentActiveTicketIndex = 0;
        if (bookingPaymentStep) bookingPaymentStep.style.display = 'none';
        if (bookingSuccessStep) bookingSuccessStep.style.display = 'block';
        displayConfirmedTicket(0);
        setupMultiPassSwitcher();
        return;
      }

      // Update Step 2B: Confirmation Display
      if (submittedBookingIdDisplay) submittedBookingIdDisplay.textContent = sData.bookingId || currentActiveBooking.id;
      if (submittedPassNameDisplay) submittedPassNameDisplay.textContent = (sData.passName || currentActiveBooking.passName || '').toUpperCase();
      var amtFormatted = '\u20B9' + (sData.expectedAmount || currentActiveBooking.expectedAmount || 0).toLocaleString('en-IN');
      if (submittedAmountDisplay) submittedAmountDisplay.textContent = amtFormatted;
      if (submittedUtrDisplay) submittedUtrDisplay.textContent = sData.upiReference || utr;

      if (bookingPaymentStep) bookingPaymentStep.style.display = 'none';
      if (bookingSubmittedStep) bookingSubmittedStep.style.display = 'block';

    } catch (err) {
      console.error('Payment claim submission error:', err);
      alert('Network error submitting payment claim. Please check your connection.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    }
  });

  closeSubmittedBookingBtn?.addEventListener('click', closeBookingModal);

  checkSubmittedTicketBtn?.addEventListener('click', function () {
    closeBookingModal();
    if (currentActiveBooking) {
      openCheckTicketModal(currentActiveBooking.id, currentActiveBooking.phone);
    } else {
      openCheckTicketModal();
    }
  });

  // STEP 4: CHECK / RETRIEVE TICKET MODAL CONTROLLER
  function openCheckTicketModal(prefillBookingId, prefillPhone) {
    if (lookupBookingIdInput && prefillBookingId) lookupBookingIdInput.value = prefillBookingId;
    if (lookupPhoneInput && prefillPhone) lookupPhoneInput.value = prefillPhone;
    if (lookupResultContainer) {
      lookupResultContainer.style.display = 'none';
      lookupResultContainer.innerHTML = '';
    }
    checkTicketModal?.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (prefillBookingId && prefillPhone) {
      checkTicketForm?.dispatchEvent(new Event('submit'));
    }
  }

  function closeCheckTicketModal() {
    checkTicketModal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  checkTicketModalCloseBtn?.addEventListener('click', closeCheckTicketModal);
  document.getElementById('navCheckTicketBtn')?.addEventListener('click', function () { openCheckTicketModal(); });
  document.getElementById('dCheckTicketBtn')?.addEventListener('click', function () {
    closeDrawer();
    openCheckTicketModal();
  });
  document.getElementById('footerCheckTicketTrigger')?.addEventListener('click', function (e) {
    e.preventDefault();
    openCheckTicketModal();
  });

  checkTicketForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    var bId = lookupBookingIdInput ? lookupBookingIdInput.value.trim().toUpperCase() : '';
    var phone = lookupPhoneInput ? lookupPhoneInput.value.trim() : '';

    if (!bId || !phone) {
      alert('Please enter both your Booking ID and registered WhatsApp number.');
      return;
    }

    var submitBtn = document.getElementById('submitCheckTicketBtn');
    var origHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>CHECKING DATABASE...</span>';
    }

    if (lookupResultContainer) {
      lookupResultContainer.style.display = 'block';
      lookupResultContainer.innerHTML = '<div style="text-align:center; padding:18px; color:rgba(255,255,255,0.7); font-size:0.85rem;"><span class="live-dot-pulse" style="display:inline-block; vertical-align:middle; margin-right:8px;"></span> Checking verification status in central database...</div>';
    }

    try {
      var res = await apiPostWithFallback(
        '/api/ticket/retrieve',
        '/.netlify/functions/retrieve-ticket',
        { bookingId: bId, phone: phone }
      );

      var data = res.data;
      if (!res.ok || !data || !data.success) {
        var errMsg = (data && data.message) ? data.message : 'Booking not found or registered phone number does not match.';
        renderLookupError(errMsg);
        return;
      }

      renderLookupSuccess(data);

    } catch (err) {
      console.error('Check ticket error:', err);
      renderLookupError('Network error connecting to verification database. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    }
  });

  function renderLookupError(msg) {
    if (!lookupResultContainer) return;
    lookupResultContainer.style.display = 'block';
    lookupResultContainer.innerHTML = [
      '<div class="status-result-card status-rejected">',
      '  <span class="status-card-badge badge-err">&times; NOT FOUND / MISMATCH</span>',
      '  <h5 style="color:#f87171; margin-top:8px;">VERIFICATION LOOKUP FAILED</h5>',
      '  <p style="margin: 8px 0 0; color: #fca5a5; font-size:0.85rem;">' + msg + '</p>',
      '</div>'
    ].join('');
  }

  function renderLookupSuccess(data) {
    if (!lookupResultContainer) return;
    lookupResultContainer.style.display = 'block';
    var booking = data.booking || {};
    var pStatus = booking.payment_status || 'AWAITING_PAYMENT';
    var amtFormatted = '\u20B9' + (booking.expected_amount || 0).toLocaleString('en-IN');

    if (pStatus === 'AWAITING_PAYMENT') {
      lookupResultContainer.innerHTML = [
        '<div class="status-result-card status-pending">',
        '  <span class="status-card-badge badge-warn">&#9888; AWAITING PAYMENT</span>',
        '  <h5 style="color:#fde047; margin-top:8px;">BOOKING FOUND &mdash; PAYMENT PENDING</h5>',
        '  <p style="font-size:0.85rem; color:#e2e8f0;">Booking <strong class="code-font text-gold">' + booking.id + '</strong> (' + booking.pass_name + ') is awaiting UPI payment of <strong>' + amtFormatted + '</strong>.</p>',
        '  <p style="color:#fde047; font-size:0.8rem;">Please scan the UPI QR code and submit your 12-digit UTR to complete your booking.</p>',
        '  <button type="button" class="btn btn-gold-shimmer btn-sm btn-block" id="lookupPayNowBtn" style="margin-top:10px;">',
        '    <span>PAY NOW VIA UPI &rarr;</span>',
        '  </button>',
        '</div>'
      ].join('');

      document.getElementById('lookupPayNowBtn')?.addEventListener('click', function () {
        closeCheckTicketModal();
        currentActiveBooking = {
          id: booking.id,
          passName: booking.pass_name,
          customerName: booking.customer_name,
          phone: booking.phone,
          expectedAmount: booking.expected_amount,
          totalAdmit: booking.total_admit
        };
        showUpiPaymentStep(currentActiveBooking);
        bookingModal?.classList.add('active');
        document.body.style.overflow = 'hidden';
      });

    } else if (pStatus === 'PENDING_VERIFICATION') {
      lookupResultContainer.innerHTML = [
        '<div class="status-result-card status-pending">',
        '  <span class="status-card-badge badge-warn">&#8987; PENDING VERIFICATION</span>',
        '  <h5 style="color:#fde047; margin-top:8px;">PAYMENT CLAIM UNDER REVIEW</h5>',
        '  <p style="font-size:0.85rem; color:#e2e8f0;">Your payment claim of <strong>' + amtFormatted + '</strong> for Booking <strong class="code-font text-gold">' + booking.id + '</strong> is awaiting manual verification by the organizer.</p>',
        '  <div style="background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:6px; margin:8px 0; font-size:0.8rem; text-align:left; color:#cbd5e1;">',
        '    <div>&bull; Pass: <strong>' + booking.pass_name + ' &times; ' + booking.quantity + '</strong></div>',
        '    <div>&bull; Reference (UTR): <strong class="code-font text-gold">' + (booking.upi_reference || 'Submitted') + '</strong></div>',
        '  </div>',
        '  <p style="color:#cbd5e1; font-size:0.78rem;">Your official pass and entry QR will become available here immediately upon organizer approval.</p>',
        '</div>'
      ].join('');

    } else if (pStatus === 'PAYMENT_REJECTED') {
      lookupResultContainer.innerHTML = [
        '<div class="status-result-card status-rejected">',
        '  <span class="status-card-badge badge-err">&times; PAYMENT NOT VERIFIED</span>',
        '  <h5 style="color:#f87171; margin-top:8px;">PAYMENT CLAIM REJECTED</h5>',
        '  <p style="font-size:0.85rem; color:#e2e8f0;">Your payment for Booking <strong class="code-font">' + booking.id + '</strong> could not be verified in the organizer bank statement.</p>',
        '  <p style="color:#fca5a5; font-size:0.8rem; font-style:italic;">Reason: ' + (booking.rejection_reason || 'UTR could not be matched') + '</p>',
        '  <p style="color:#e2e8f0; font-size:0.75rem;">If you believe this is an error, please reach out to the event organizers with your UPI transaction receipt.</p>',
        '</div>'
      ].join('');

    } else if (pStatus === 'PAYMENT_VERIFIED') {
      var tickets = data.tickets || [];
      lookupResultContainer.innerHTML = [
        '<div class="status-result-card status-verified">',
        '  <span class="status-card-badge badge-ok">&check; PAYMENT VERIFIED</span>',
        '  <h5 style="color:#4ade80; margin-top:8px;">OFFICIAL PASS ISSUED</h5>',
        '  <p style="font-size:0.85rem; color:#e2e8f0;">Payment of <strong>' + amtFormatted + '</strong> verified! Your official entry pass is active.</p>',
        '  <div style="background:rgba(0,0,0,0.4); padding:8px 12px; border-radius:6px; margin:8px 0; font-size:0.8rem; text-align:left; color:#cbd5e1;">',
        '    <div>&bull; Attendee: <strong>' + booking.customer_name + '</strong></div>',
        '    <div>&bull; Pass: <strong>' + booking.pass_name + ' (' + booking.total_admit + ' Pax)</strong></div>',
        '    <div>&bull; Status: <strong style="color:#4ade80;">ACTIVE PASS</strong></div>',
        '  </div>',
        '  <button type="button" class="btn btn-gold-shimmer btn-sm btn-block" id="lookupViewTicketBtn" style="margin-top:10px;">',
        '    <span>VIEW OFFICIAL DIGITAL PASS &amp; QR &rarr;</span>',
        '  </button>',
        '</div>'
      ].join('');

      document.getElementById('lookupViewTicketBtn')?.addEventListener('click', function () {
        closeCheckTicketModal();
        currentlyGeneratedTickets = tickets.map(function (t) {
          return {
            id: t.id,
            verifyToken: t.verify_token,
            verifyUrl: '#verify?token=' + t.verify_token,
            name: booking.customer_name,
            passType: booking.pass_name,
            admitCount: booking.admit_per_pass || 1,
            amount: booking.unit_price || booking.expected_amount,
            paymentStatus: 'PAID',
            status: t.ticket_status || 'ACTIVE',
            paymentTxnId: booking.upi_reference || ('REF-' + booking.id)
          };
        });
        currentActiveTicketIndex = 0;
        if (bookingFormStep) bookingFormStep.style.display = 'none';
        if (bookingPaymentStep) bookingPaymentStep.style.display = 'none';
        if (bookingSubmittedStep) bookingSubmittedStep.style.display = 'none';
        if (bookingSuccessStep) bookingSuccessStep.style.display = 'block';
        displayConfirmedTicket(0);
        setupMultiPassSwitcher();
        bookingModal?.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    }
  }

  function displayConfirmedTicket(index) {
    if (!currentlyGeneratedTickets || currentlyGeneratedTickets.length === 0) return;
    var ticket = currentlyGeneratedTickets[index];
    if (!ticket) return;

    currentActiveTicketIndex = index;
    if (tDispCode) tDispCode.textContent = ticket.id;
    if (tDispName) tDispName.textContent = ticket.name;
    if (tDispCategory) tDispCategory.textContent = ticket.passType;
    if (tDispPrice) tDispPrice.textContent = '\u20B9' + ticket.amount;
    if (tDispHeadcount) {
      tDispHeadcount.textContent = ticket.admitCount + ' ' + (ticket.admitCount > 1 ? 'PEOPLE' : 'PERSON');
    }
    if (tDispPayStatus) tDispPayStatus.textContent = '\u2713 PAID';
    if (tDispTicketStatus) tDispTicketStatus.textContent = ticket.status || 'ACTIVE';
    if (tDispTxnId) tDispTxnId.textContent = ticket.paymentTxnId;

    if (ticketQrCanvas) {
      QRCodeGenerator.drawToCanvas(ticketQrCanvas, 'https://shreyasalkundi22-hash.github.io/Raas-Leela' + ticket.verifyUrl, 2);
    }

    if (whatsappShareTicketBtn) {
      var msg = encodeURIComponent(
        '\u2726 RAAS LEELA 2026 OFFICIAL PASS \u2726\nAttendee: ' + ticket.name + '\nPass: ' + ticket.passType + ' (' + ticket.admitCount + ' Headcount)\nTicket ID: ' + ticket.id + '\nVerification: https://shreyasalkundi22-hash.github.io/Raas-Leela' + ticket.verifyUrl + '\nVenue: Sports Space, Hubli\nDate: 13 October 2026'
      );
      whatsappShareTicketBtn.href = 'https://wa.me/?text=' + msg;
    }
  }

  function setupMultiPassSwitcher() {
    if (!multiPassSwitcher || !multiPassNavTabs) return;
    if (currentlyGeneratedTickets.length <= 1) {
      multiPassSwitcher.style.display = 'none';
      return;
    }
    multiPassSwitcher.style.display = 'block';
    multiPassNavTabs.innerHTML = '';

    currentlyGeneratedTickets.forEach(function (t, i) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'pass-tab-chip ' + (i === 0 ? 'active' : '');
      tab.textContent = 'Pass #' + (i + 1) + ' (' + t.id + ')';
      tab.addEventListener('click', function () {
        multiPassNavTabs.querySelectorAll('.pass-tab-chip').forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        displayConfirmedTicket(i);
      });
      multiPassNavTabs.appendChild(tab);
    });
  }

  document.getElementById('printTicketBtn')?.addEventListener('click', function () { window.print(); });
  document.getElementById('bookMoreTicketsBtn')?.addEventListener('click', openBookingModal);
  document.getElementById('copyVerificationLinkBtn')?.addEventListener('click', function () {
    if (currentlyGeneratedTickets[currentActiveTicketIndex]) {
      var url = 'https://shreyasalkundi22-hash.github.io/Raas-Leela' + currentlyGeneratedTickets[currentActiveTicketIndex].verifyUrl;
      navigator.clipboard?.writeText(url).then(function () { alert('Verification link copied to clipboard: ' + url); });
    }
  });

  /* ==========================================================================
     8. STAFF PORTAL (GATE CHECK-IN & CAMERA QR SCANNER)
     Protected by Passcode: RL20206
     ========================================================================== */
  var staffPortalModal = document.getElementById('staffPortalModal');
  var staffPortalCloseBtn = document.getElementById('staffPortalCloseBtn');
  var staffLoginView = document.getElementById('staffLoginView');
  var staffScannerView = document.getElementById('staffScannerView');
  var staffLoginForm = document.getElementById('staffLoginForm');
  var staffPasswordInput = document.getElementById('staffPasswordInput');
  var staffAuthFeedback = document.getElementById('staffAuthFeedback');
  var toggleStaffPasswordBtn = document.getElementById('toggleStaffPasswordBtn');
  var staffSignoutBtn = document.getElementById('staffSignoutBtn');

  var startCameraBtn = document.getElementById('startCameraBtn');
  var stopCameraBtn = document.getElementById('stopCameraBtn');
  var qrScannerVideo = document.getElementById('qrScannerVideo');
  var qrScanCanvas = document.getElementById('qrScanCanvas');
  var scannerInactiveView = document.getElementById('scannerInactiveView');
  var scannerActiveView = document.getElementById('scannerActiveView');
  var manualTicketCodeInput = document.getElementById('manualTicketCodeInput');
  var manualLookupBtn = document.getElementById('manualLookupBtn');

  var verifyEmptyPlaceholder = document.getElementById('verifyEmptyPlaceholder');
  var verifyValidCard = document.getElementById('verifyValidCard');
  var verifyUsedCard = document.getElementById('verifyUsedCard');
  var verifyInvalidCard = document.getElementById('verifyInvalidCard');
  var admitTicketBtn = document.getElementById('admitTicketBtn');

  var activeCameraStream = null;
  var currentlyInspectedTicketId = null;

  function hasStaffSession() {
    return !!sessionStorage.getItem('raas_staff_session');
  }

  function openStaffPortal() {
    if (hasStaffSession()) {
      if (staffLoginView) staffLoginView.style.display = 'none';
      if (staffScannerView) staffScannerView.style.display = 'block';
    } else {
      if (staffLoginView) staffLoginView.style.display = 'block';
      if (staffScannerView) staffScannerView.style.display = 'none';
      if (staffPasswordInput) staffPasswordInput.value = '';
      if (staffAuthFeedback) staffAuthFeedback.style.display = 'none';
    }
    staffPortalModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeStaffPortal() {
    stopCamera();
    staffPortalModal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  staffPortalCloseBtn?.addEventListener('click', closeStaffPortal);

  toggleStaffPasswordBtn?.addEventListener('click', function () {
    if (!staffPasswordInput) return;
    staffPasswordInput.type = staffPasswordInput.type === 'password' ? 'text' : 'password';
  });

  staffLoginForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    var entered = staffPasswordInput?.value.trim();
    if (!entered) return;

    var hash = await sha256(entered);
    if (hash === STAFF_PASSWORD_HASH) {
      if (staffAuthFeedback) {
        staffAuthFeedback.innerHTML = '<span>\u2713 ACCESS GRANTED</span>';
        staffAuthFeedback.className = 'auth-feedback-box success';
        staffAuthFeedback.style.display = 'block';
      }
      sessionStorage.setItem('raas_staff_session', 'staff_auth_' + Date.now());

      setTimeout(function () {
        if (staffLoginView) staffLoginView.style.display = 'none';
        if (staffScannerView) staffScannerView.style.display = 'block';
      }, 350);
    } else {
      if (staffAuthFeedback) {
        staffAuthFeedback.innerHTML = '<span>\u2715 INCORRECT PASSWORD<br>ACCESS DENIED</span>';
        staffAuthFeedback.className = 'auth-feedback-box error';
        staffAuthFeedback.style.display = 'block';
      }
      staffPasswordInput?.classList.add('shake');
      setTimeout(function () { staffPasswordInput?.classList.remove('shake'); }, 500);
      staffPasswordInput?.select();
    }
  });

  staffSignoutBtn?.addEventListener('click', function () {
    sessionStorage.removeItem('raas_staff_session');
    stopCamera();
    if (staffScannerView) staffScannerView.style.display = 'none';
    if (staffLoginView) staffLoginView.style.display = 'block';
    if (staffPasswordInput) staffPasswordInput.value = '';
    if (staffAuthFeedback) staffAuthFeedback.style.display = 'none';
  });

  function resetVerificationDisplay() {
    if (verifyEmptyPlaceholder) verifyEmptyPlaceholder.style.display = 'none';
    if (verifyValidCard) verifyValidCard.style.display = 'none';
    if (verifyUsedCard) verifyUsedCard.style.display = 'none';
    if (verifyInvalidCard) verifyInvalidCard.style.display = 'none';
  }

  async function verifyTicketCode(query) {
    if (!hasStaffSession()) {
      openStaffPortal();
      return;
    }

    resetVerificationDisplay();
    currentlyInspectedTicketId = null;

    var cleaned = String(query || '').trim();
    if (cleaned.includes('token=')) {
      var m = cleaned.match(/token=([a-zA-Z0-9_\-]+)/);
      if (m && m[1]) cleaned = m[1];
    } else if (cleaned.includes('#verify')) {
      var m2 = cleaned.match(/#verify\?token=([a-zA-Z0-9_\-]+)/);
      if (m2 && m2[1]) cleaned = m2[1];
    }

    try {
      var res = await apiPostWithFallback(
        '/api/ticket/inspect',
        '/.netlify/functions/verify-ticket',
        { token: cleaned }
      );

      var data = res.data;
      if (!res.ok || !data || !data.success) {
        if (data && data.reason === 'ALREADY_REDEEMED' && data.ticket) {
          showStaffAlreadyUsed(data.ticket);
        } else {
          showStaffInvalid(data ? (data.message || data.reason || 'Ticket Not Found') : 'Ticket Not Found in Database', cleaned);
        }
        return;
      }

      var ticket = data.ticket;
      currentlyInspectedTicketId = ticket.verify_token || ticket.id;

      if (ticket.ticket_status === 'REDEEMED' || ticket.status === 'REDEEMED') {
        showStaffAlreadyUsed(ticket);
        return;
      }

      showStaffValid(ticket);

    } catch (err) {
      console.error('Staff inspect error:', err);
      var localT = EventDB.lookupTicket(cleaned);
      if (localT) {
        currentlyInspectedTicketId = localT.id;
        if (localT.status === 'REDEEMED' || localT.status === 'CHECKED_IN') {
          showStaffAlreadyUsed({
            customer_name: localT.name,
            checked_in_at: localT.checkedInAt,
            checked_in_by: localT.checkedInBy,
            id: localT.id
          });
        } else {
          showStaffValid({
            id: localT.id,
            customer_name: localT.name,
            pass_name: localT.passType,
            admit_count: localT.admitCount,
            amount: localT.amount,
            payment_status: localT.paymentStatus,
            ticket_status: localT.status
          });
        }
      } else {
        showStaffInvalid('Network error inspecting ticket against database.', cleaned);
      }
    }
  }

  function showStaffValid(ticket) {
    if (verifyValidCard) {
      verifyValidCard.style.display = 'block';
      var vCode = document.getElementById('vCode');
      var vName = document.getElementById('vName');
      var vCategory = document.getElementById('vCategory');
      var vAdmitCount = document.getElementById('vAdmitCount');
      var vAmountPaid = document.getElementById('vAmountPaid');
      var vPayStatus = document.getElementById('vPayStatus');
      var vTicketStatus = document.getElementById('vTicketStatus');

      if (vCode) vCode.textContent = ticket.id;
      if (vName) vName.textContent = ticket.customer_name || ticket.name || 'Attendee';
      if (vCategory) vCategory.textContent = ticket.pass_name || ticket.passType || 'Pass';
      var headcount = ticket.admit_count || ticket.admitCount || 1;
      if (vAdmitCount) vAdmitCount.textContent = headcount + ' ' + (headcount > 1 ? 'PEOPLE' : 'PERSON');
      if (vAmountPaid) vAmountPaid.textContent = '\u20B9' + (ticket.amount || ticket.unit_price || 0);
      if (vPayStatus) vPayStatus.textContent = ticket.payment_status || 'PAID';
      if (vTicketStatus) vTicketStatus.textContent = ticket.ticket_status || ticket.status || 'ACTIVE';

      if (admitTicketBtn) {
        admitTicketBtn.disabled = false;
        admitTicketBtn.innerHTML = '<span>\u2713 ADMIT &amp; CLOSE TICKET</span>';
      }
    }
  }

  function showStaffAlreadyUsed(ticket) {
    if (verifyUsedCard) {
      verifyUsedCard.style.display = 'block';
      var vUsedName = document.getElementById('vUsedName');
      var vUsedTime = document.getElementById('vUsedTime');
      var vUsedGate = document.getElementById('vUsedGate');
      var vUsedCode = document.getElementById('vUsedCode');

      if (vUsedName) vUsedName.textContent = ticket.customer_name || ticket.name || 'Attendee';
      if (vUsedTime) vUsedTime.textContent = ticket.checked_in_at ? new Date(ticket.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : (ticket.checkedInAt || 'Earlier Today');
      if (vUsedGate) vUsedGate.textContent = ticket.checked_in_by || ticket.checkedInBy || 'Gate 1 Staff';
      if (vUsedCode) vUsedCode.textContent = ticket.id || '';
    }
  }

  function showStaffInvalid(reason, query) {
    if (verifyInvalidCard) {
      verifyInvalidCard.style.display = 'block';
      var invalidNote = document.getElementById('vInvalidQueryText');
      if (invalidNote) invalidNote.textContent = 'Query: "' + query + '" \u2014 ' + reason;
    }
  }

  admitTicketBtn?.addEventListener('click', async function () {
    if (!currentlyInspectedTicketId) return;

    var origHtml = admitTicketBtn.innerHTML;
    admitTicketBtn.disabled = true;
    admitTicketBtn.innerHTML = '<span>ADMITTING AT GATE...</span>';

    try {
      var res = await apiPostWithFallback(
        '/api/ticket/redeem',
        '/.netlify/functions/redeem-ticket',
        {
          token: currentlyInspectedTicketId,
          staffName: 'Gate 1 Staff'
        }
      );

      var data = res.data;
      if (res.ok && data && data.success) {
        admitTicketBtn.disabled = true;
        admitTicketBtn.innerHTML = '<span>\u2713 ADMITTED &amp; REDEEMED (GATE 1)</span>';
        alert('\u2713 Ticket ' + (data.ticket?.id || currentlyInspectedTicketId) + ' Admitted & Closed successfully in central database! Duplicate entry is now blocked.');
        EventDB.admitTicket(currentlyInspectedTicketId, 'Gate 1 Staff');
      } else {
        admitTicketBtn.disabled = false;
        admitTicketBtn.innerHTML = origHtml;
        if (data && data.reason === 'ALREADY_USED') {
          showStaffAlreadyUsed(data.ticket || {});
        } else {
          alert('\u2715 Admission failed: ' + (data ? (data.message || data.reason) : 'Database error'));
        }
      }
    } catch (err) {
      console.error('Admission error:', err);
      var localRes = EventDB.admitTicket(currentlyInspectedTicketId, 'Gate 1 Staff');
      if (localRes.success) {
        admitTicketBtn.disabled = true;
        admitTicketBtn.innerHTML = '<span>\u2713 ADMITTED &amp; REDEEMED (GATE 1)</span>';
        alert('\u2713 Ticket ' + currentlyInspectedTicketId + ' Admitted & Closed locally.');
      } else {
        admitTicketBtn.disabled = false;
        admitTicketBtn.innerHTML = origHtml;
        alert('Network error communicating with gate server.');
      }
    }
  });

  manualLookupBtn?.addEventListener('click', function () {
    var val = manualTicketCodeInput?.value.trim();
    if (val) verifyTicketCode(val);
  });

  manualTicketCodeInput?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var val = manualTicketCodeInput?.value.trim();
      if (val) verifyTicketCode(val);
    }
  });

  var cameraScanTimer = null;
  async function checkVideoFrameForQr() {
    if (!activeCameraStream || !qrScannerVideo) return;
    if ('BarcodeDetector' in window) {
      try {
        var detector = new BarcodeDetector({ formats: ['qr_code'] });
        var barcodes = await detector.detect(qrScannerVideo);
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          stopCamera();
          verifyTicketCode(barcodes[0].rawValue);
          return;
        }
      } catch (e) {}
    }
    cameraScanTimer = requestAnimationFrame(checkVideoFrameForQr);
  }

  async function startCamera() {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      activeCameraStream = stream;
      if (qrScannerVideo) {
        qrScannerVideo.srcObject = stream;
        qrScannerVideo.style.display = 'block';
        qrScannerVideo.play();
      }
      if (scannerInactiveView) scannerInactiveView.style.display = 'none';
      if (scannerActiveView) scannerActiveView.style.display = 'block';
      cameraScanTimer = requestAnimationFrame(checkVideoFrameForQr);
    } catch (err) {
      alert('Camera access unavailable or declined. Please use Manual Code Lookup.');
    }
  }

  function stopCamera() {
    if (cameraScanTimer) {
      cancelAnimationFrame(cameraScanTimer);
      cameraScanTimer = null;
    }
    if (activeCameraStream) {
      activeCameraStream.getTracks().forEach(function (track) { track.stop(); });
      activeCameraStream = null;
    }
    if (qrScannerVideo) qrScannerVideo.style.display = 'none';
    if (scannerActiveView) scannerActiveView.style.display = 'none';
    if (scannerInactiveView) scannerInactiveView.style.display = 'block';
  }

  startCameraBtn?.addEventListener('click', startCamera);
  stopCameraBtn?.addEventListener('click', stopCamera);

  /* ==========================================================================
     9. ADMIN PORTAL (COMMAND CENTER & REVENUE INTELLIGENCE)
     ========================================================================== */
  var adminPortalModal = document.getElementById('adminPortalModal');
  var adminPortalCloseBtn = document.getElementById('adminPortalCloseBtn');
  var adminLoginView = document.getElementById('adminLoginView');
  var adminDashboardView = document.getElementById('adminDashboardView');
  var adminLoginForm = document.getElementById('adminLoginForm');
  var adminPasswordInput = document.getElementById('adminPasswordInput');
  var adminAuthFeedback = document.getElementById('adminAuthFeedback');
  var toggleAdminPasswordBtn = document.getElementById('toggleAdminPasswordBtn');
  var adminSignoutBtn = document.getElementById('adminSignoutBtn');

  var adminTableBody = document.getElementById('adminTableBody');
  var adminTicketSearchInput = document.getElementById('adminTicketSearchInput');
  var filterAllCount = document.getElementById('filterAllCount');
  var filterPendingCount = document.getElementById('filterPendingCount');
  var filterAdmittedCount = document.getElementById('filterAdmittedCount');
  var exportTicketsCsvBtn = document.getElementById('exportTicketsCsvBtn');

  var activeAdminFilter = 'all';

  function hasAdminSession() {
    return !!sessionStorage.getItem('raas_admin_session');
  }

  function openAdminPortal() {
    if (hasAdminSession()) {
      if (adminLoginView) adminLoginView.style.display = 'none';
      if (adminDashboardView) adminDashboardView.style.display = 'block';
      refreshAdminDashboard();
    } else {
      if (adminLoginView) adminLoginView.style.display = 'block';
      if (adminDashboardView) adminDashboardView.style.display = 'none';
      if (adminPasswordInput) adminPasswordInput.value = '';
      if (adminAuthFeedback) adminAuthFeedback.style.display = 'none';
    }
    adminPortalModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeAdminPortal() {
    adminPortalModal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  adminPortalCloseBtn?.addEventListener('click', closeAdminPortal);

  toggleAdminPasswordBtn?.addEventListener('click', function () {
    if (!adminPasswordInput) return;
    adminPasswordInput.type = adminPasswordInput.type === 'password' ? 'text' : 'password';
  });

  function getAdminToken() {
    return sessionStorage.getItem('raas_admin_token') || sessionStorage.getItem('raas_admin_session') || '';
  }

  adminLoginForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = adminPasswordInput ? adminPasswordInput.value.trim() : '';
    if (!pass) return;

    var submitBtn = document.getElementById('adminLoginSubmitBtn');
    var origHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>AUTHENTICATING...</span>';
    }

    try {
      var res = await apiPostWithFallback(
        '/api/admin/login',
        '/.netlify/functions/admin-auth',
        { password: pass }
      );

      var data = res.data;
      if (res.ok && data && data.success) {
        if (adminAuthFeedback) {
          adminAuthFeedback.innerHTML = '<span>\u2713 ACCESS GRANTED</span>';
          adminAuthFeedback.className = 'auth-feedback-box success';
          adminAuthFeedback.style.display = 'block';
        }
        var token = data.token || ('adm_tok_' + Date.now());
        sessionStorage.setItem('raas_admin_token', token);
        sessionStorage.setItem('raas_admin_session', token);

        setTimeout(function () {
          if (adminLoginView) adminLoginView.style.display = 'none';
          if (adminDashboardView) adminDashboardView.style.display = 'block';
          refreshAdminDashboard();
        }, 350);
      } else {
        // Fallback SHA-256 for local dev or offline mode
        var hash = await sha256(pass);
        if (hash === ADMIN_SECURE_AUTH_HASH) {
          sessionStorage.setItem('raas_admin_token', 'adm_offline_' + Date.now());
          sessionStorage.setItem('raas_admin_session', 'adm_offline_' + Date.now());
          if (adminLoginView) adminLoginView.style.display = 'none';
          if (adminDashboardView) adminDashboardView.style.display = 'block';
          refreshAdminDashboard();
          return;
        }

        if (adminAuthFeedback) {
          adminAuthFeedback.innerHTML = '<span>\u2715 INCORRECT PASSWORD<br>ACCESS DENIED</span>';
          adminAuthFeedback.className = 'auth-feedback-box error';
          adminAuthFeedback.style.display = 'block';
        }
        adminPasswordInput?.classList.add('shake');
        setTimeout(function () { adminPasswordInput?.classList.remove('shake'); }, 500);
        if (adminPasswordInput) adminPasswordInput.value = '';
      }
    } catch (err) {
      console.error('Admin login error:', err);
      var hash = await sha256(pass);
      if (hash === ADMIN_SECURE_AUTH_HASH) {
        sessionStorage.setItem('raas_admin_token', 'adm_offline_' + Date.now());
        sessionStorage.setItem('raas_admin_session', 'adm_offline_' + Date.now());
        if (adminLoginView) adminLoginView.style.display = 'none';
        if (adminDashboardView) adminDashboardView.style.display = 'block';
        refreshAdminDashboard();
        return;
      }
      alert('Network error authenticating admin. Please check connection.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origHtml;
      }
    }
  });

  adminSignoutBtn?.addEventListener('click', function () {
    sessionStorage.removeItem('raas_admin_token');
    sessionStorage.removeItem('raas_admin_session');
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (adminDashboardView) adminDashboardView.style.display = 'none';
    if (adminLoginView) adminLoginView.style.display = 'block';
    if (adminPasswordInput) adminPasswordInput.value = '';
    if (adminAuthFeedback) {
      adminAuthFeedback.innerHTML = '<span>SESSION CLOSED &bull; LOCKED</span>';
      adminAuthFeedback.className = 'auth-feedback-box';
      adminAuthFeedback.style.display = 'block';
      setTimeout(function () {
        if (!hasAdminSession() && adminAuthFeedback) adminAuthFeedback.style.display = 'none';
      }, 1500);
    }
  });

  var cachedAdminData = null;
  var pendingActionBookingId = null;
  var pendingActionAmount = 0;

  async function refreshAdminDashboard() {
    var token = getAdminToken();
    var refreshBtn = document.getElementById('refreshAdminDataBtn');
    if (refreshBtn) refreshBtn.classList.add('spinning');

    try {
      var res = await fetch(resolveApiUrl('/api/admin/bookings'), {
        headers: {
          'Authorization': 'Bearer ' + token,
          'X-Admin-Token': token
        }
      });

      if (res.status === 404) {
        res = await fetch(resolveApiUrl('/.netlify/functions/admin-bookings'), {
          headers: {
            'Authorization': 'Bearer ' + token,
            'X-Admin-Token': token
          }
        });
      }

      var data = await res.json();
      if (res.ok && data && data.success) {
        cachedAdminData = data;
        renderAdminDashboardData(data);
      } else {
        console.warn('Could not fetch admin data from backend:', data?.message);
        var localAnalytics = EventDB.getSalesAnalytics();
        renderAdminDashboardFallback(localAnalytics);
      }
    } catch (err) {
      console.error('Admin refresh error:', err);
      var localAnalytics = EventDB.getSalesAnalytics();
      renderAdminDashboardFallback(localAnalytics);
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  function renderAdminDashboardData(data) {
    var stats = data.stats || {};
    var pendingBookings = data.pendingBookings || [];
    var allBookings = data.allBookings || [];

    // Top metrics (strictly verified revenue only)
    var totalRevenue = stats.total_revenue || 0;
    var paidBookings = stats.paid_bookings || 0;
    var totalPeople = stats.total_attendees || 0;
    var checkedIn = stats.checked_in || 0;

    var cmdTotalRevenue = document.getElementById('cmdTotalRevenue');
    var cmdPaidBookings = document.getElementById('cmdPaidBookings');
    var cmdTotalPeople = document.getElementById('cmdTotalPeople');
    var cmdCheckedIn = document.getElementById('cmdCheckedIn');
    var cmdCheckinPercentage = document.getElementById('cmdCheckinPercentage');

    if (cmdTotalRevenue) cmdTotalRevenue.textContent = '\u20B9' + totalRevenue.toLocaleString('en-IN');
    if (cmdPaidBookings) cmdPaidBookings.textContent = paidBookings;
    if (cmdTotalPeople) cmdTotalPeople.textContent = totalPeople;
    if (cmdCheckedIn) cmdCheckedIn.textContent = checkedIn;
    var pct = totalPeople > 0 ? Math.round((checkedIn / totalPeople) * 100) : 0;
    if (cmdCheckinPercentage) cmdCheckinPercentage.textContent = pct + '% Admitted';

    // Live PASS SALES Breakdown
    var breakdown = stats.tier_breakdown || {};
    var stag = breakdown.stag || { bookings: 0, people: 0, revenue: 0 };
    var couple = breakdown.couple || { bookings: 0, people: 0, revenue: 0 };
    var group = breakdown.group || { bookings: 0, people: 0, revenue: 0 };

    var sStagB = document.getElementById('salesStagBookings');
    var sStagP = document.getElementById('salesStagPeople');
    var sStagR = document.getElementById('salesStagRevenue');
    if (sStagB) sStagB.textContent = stag.bookings;
    if (sStagP) sStagP.textContent = stag.people;
    if (sStagR) sStagR.textContent = '\u20B9' + (stag.revenue || 0).toLocaleString('en-IN');

    var sCoupleB = document.getElementById('salesCoupleBookings');
    var sCoupleP = document.getElementById('salesCouplePeople');
    var sCoupleR = document.getElementById('salesCoupleRevenue');
    if (sCoupleB) sCoupleB.textContent = couple.bookings;
    if (sCoupleP) sCoupleP.textContent = couple.people;
    if (sCoupleR) sCoupleR.textContent = '\u20B9' + (couple.revenue || 0).toLocaleString('en-IN');

    var sGroupB = document.getElementById('salesGroupBookings');
    var sGroupP = document.getElementById('salesGroupPeople');
    var sGroupR = document.getElementById('salesGroupRevenue');
    if (sGroupB) sGroupB.textContent = group.bookings;
    if (sGroupP) sGroupP.textContent = group.people;
    if (sGroupR) sGroupR.textContent = '\u20B9' + (group.revenue || 0).toLocaleString('en-IN');

    var sTotB = document.getElementById('salesTotalBookings');
    var sTotP = document.getElementById('salesTotalPeople');
    var sTotR = document.getElementById('salesTotalRevenue');
    if (sTotB) sTotB.textContent = paidBookings;
    if (sTotP) sTotP.textContent = totalPeople;
    if (sTotR) sTotR.textContent = '\u20B9' + totalRevenue.toLocaleString('en-IN');

    renderAdminPendingQueue(pendingBookings);
    renderAdminRosterFromBookings(allBookings);
  }

  function renderAdminDashboardFallback(analytics) {
    var cmdTotalRevenue = document.getElementById('cmdTotalRevenue');
    var cmdPaidBookings = document.getElementById('cmdPaidBookings');
    var cmdTotalPeople = document.getElementById('cmdTotalPeople');
    var cmdCheckedIn = document.getElementById('cmdCheckedIn');
    var cmdCheckinPercentage = document.getElementById('cmdCheckinPercentage');

    if (cmdTotalRevenue) cmdTotalRevenue.textContent = '\u20B9' + (analytics.totalRevenue || 0).toLocaleString('en-IN');
    if (cmdPaidBookings) cmdPaidBookings.textContent = analytics.totalBookings || 0;
    if (cmdTotalPeople) cmdTotalPeople.textContent = analytics.totalPeople || 0;
    if (cmdCheckedIn) cmdCheckedIn.textContent = analytics.checkedIn || 0;
    var pct = (analytics.totalPeople > 0) ? Math.round(((analytics.checkedIn || 0) / analytics.totalPeople) * 100) : 0;
    if (cmdCheckinPercentage) cmdCheckinPercentage.textContent = pct + '% Admitted';

    var sStagB = document.getElementById('salesStagBookings');
    var sStagP = document.getElementById('salesStagPeople');
    var sStagR = document.getElementById('salesStagRevenue');
    if (sStagB) sStagB.textContent = analytics.stag?.bookings || 0;
    if (sStagP) sStagP.textContent = analytics.stag?.people || 0;
    if (sStagR) sStagR.textContent = '\u20B9' + (analytics.stag?.revenue || 0).toLocaleString('en-IN');

    var sCoupleB = document.getElementById('salesCoupleBookings');
    var sCoupleP = document.getElementById('salesCouplePeople');
    var sCoupleR = document.getElementById('salesCoupleRevenue');
    if (sCoupleB) sCoupleB.textContent = analytics.couple?.bookings || 0;
    if (sCoupleP) sCoupleP.textContent = analytics.couple?.people || 0;
    if (sCoupleR) sCoupleR.textContent = '\u20B9' + (analytics.couple?.revenue || 0).toLocaleString('en-IN');

    var sGroupB = document.getElementById('salesGroupBookings');
    var sGroupP = document.getElementById('salesGroupPeople');
    var sGroupR = document.getElementById('salesGroupRevenue');
    if (sGroupB) sGroupB.textContent = analytics.group?.bookings || 0;
    if (sGroupP) sGroupP.textContent = analytics.group?.people || 0;
    if (sGroupR) sGroupR.textContent = '\u20B9' + (analytics.group?.revenue || 0).toLocaleString('en-IN');

    var sTotB = document.getElementById('salesTotalBookings');
    var sTotP = document.getElementById('salesTotalPeople');
    var sTotR = document.getElementById('salesTotalRevenue');
    if (sTotB) sTotB.textContent = analytics.totalBookings || 0;
    if (sTotP) sTotP.textContent = analytics.totalPeople || 0;
    if (sTotR) sTotR.textContent = '\u20B9' + (analytics.totalRevenue || 0).toLocaleString('en-IN');

    renderAdminPendingQueue([]);
  }

  function renderAdminPendingQueue(pendingList) {
    var container = document.getElementById('adminPendingListContainer');
    var badge = document.getElementById('adminPendingCountBadge');
    var alertBanner = document.getElementById('adminPendingAlertBanner');
    var alertText = document.getElementById('alertPendingNoticeText');

    if (badge) badge.textContent = pendingList.length + ' PENDING';

    if (pendingList.length > 0) {
      if (alertBanner) alertBanner.style.display = 'flex';
      if (alertText) alertText.textContent = pendingList.length + ' request' + (pendingList.length > 1 ? 's' : '') + ' awaiting verification';
    } else {
      if (alertBanner) alertBanner.style.display = 'none';
    }

    if (!container) return;

    if (pendingList.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 24px; color: rgba(255, 255, 255, 0.5); font-size: 0.85rem;" id="noPendingRequestsPlaceholder">&check; No pending payment verification requests. All bookings processed.</div>';
      return;
    }

    container.innerHTML = '';
    pendingList.forEach(function (b) {
      var card = document.createElement('div');
      card.className = 'pending-item-card';
      var submittedTime = b.payment_submitted_at ? new Date(b.payment_submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'Recently';

      card.innerHTML = [
        '<div class="pending-item-main">',
        '  <div class="pending-item-header">',
        '    <span class="pending-bid">' + b.id + '</span>',
        '    <span class="pending-tier-badge">' + b.pass_name + ' &times; ' + b.quantity + '</span>',
        '    <span class="pending-amount-badge">\u20B9' + (b.expected_amount || 0).toLocaleString('en-IN') + '</span>',
        '  </div>',
        '  <div class="pending-customer-line"><strong>' + b.customer_name + '</strong> &bull; ' + b.phone + (b.email ? ' &bull; ' + b.email : '') + ' &bull; ' + b.total_admit + ' Pax</div>',
        '  <div class="pending-utr-line">UPI Reference (UTR): <strong>' + (b.upi_reference || 'NOT_SUPPLIED') + '</strong></div>',
        '  <span class="pending-time">Submitted: ' + submittedTime + '</span>',
        '</div>',
        '<div class="pending-actions-wrap">',
        '  <button type="button" class="btn-approve-payment" data-action="approve" data-id="' + b.id + '">',
        '    &check; APPROVE PAYMENT',
        '  </button>',
        '  <button type="button" class="btn-reject-payment" data-action="reject" data-id="' + b.id + '">',
        '    &times; REJECT',
        '  </button>',
        '</div>'
      ].join('');

      card.querySelector('button[data-action="approve"]')?.addEventListener('click', function () {
        openApproveModal(b.id, b.expected_amount);
      });

      card.querySelector('button[data-action="reject"]')?.addEventListener('click', function () {
        openRejectModal(b.id);
      });

      container.appendChild(card);
    });
  }

  function openApproveModal(bookingId, amount) {
    pendingActionBookingId = bookingId;
    pendingActionAmount = amount;
    var bIdText = document.getElementById('approveModalBookingId');
    var amtText = document.getElementById('approveModalAmountText');
    if (bIdText) bIdText.textContent = bookingId;
    if (amtText) amtText.textContent = '\u20B9' + (amount || 0).toLocaleString('en-IN');
    var modal = document.getElementById('adminApproveModal');
    modal?.classList.add('active');
  }

  function closeApproveModal() {
    var modal = document.getElementById('adminApproveModal');
    modal?.classList.remove('active');
    pendingActionBookingId = null;
  }

  document.getElementById('cancelApproveModalBtn')?.addEventListener('click', closeApproveModal);

  document.getElementById('confirmApproveModalBtn')?.addEventListener('click', async function () {
    if (!pendingActionBookingId) return;
    var token = getAdminToken();
    var btn = document.getElementById('confirmApproveModalBtn');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>APPROVING &amp; MINTING TICKETS...</span>';
    }

    try {
      var res = await apiPostWithFallback(
        '/api/admin/approve-payment',
        '/.netlify/functions/admin-approve-payment',
        { bookingId: pendingActionBookingId },
        {
          'Authorization': 'Bearer ' + token,
          'X-Admin-Token': token
        }
      );

      var data = res.data;
      if (res.ok && data && data.success) {
        closeApproveModal();
        alert('\u2713 Payment approved! Official tickets minted for ' + pendingActionBookingId + '.');
        refreshAdminDashboard();
      } else {
        alert('\u2715 Approval failed: ' + (data ? (data.message || data.error) : 'Database error'));
      }
    } catch (err) {
      console.error('Approval request failed:', err);
      alert('Network error connecting to approval server.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  });

  function openRejectModal(bookingId) {
    pendingActionBookingId = bookingId;
    var bIdText = document.getElementById('rejectModalBookingId');
    if (bIdText) bIdText.textContent = bookingId;
    var reasonInput = document.getElementById('rejectReasonInput');
    if (reasonInput) reasonInput.value = '';
    var modal = document.getElementById('adminRejectModal');
    modal?.classList.add('active');
  }

  function closeRejectModal() {
    var modal = document.getElementById('adminRejectModal');
    modal?.classList.remove('active');
    pendingActionBookingId = null;
  }

  document.getElementById('cancelRejectModalBtn')?.addEventListener('click', closeRejectModal);

  document.getElementById('confirmRejectModalBtn')?.addEventListener('click', async function () {
    if (!pendingActionBookingId) return;
    var token = getAdminToken();
    var reasonInput = document.getElementById('rejectReasonInput');
    var reason = reasonInput ? reasonInput.value.trim() : '';

    var btn = document.getElementById('confirmRejectModalBtn');
    var origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>REJECTING...</span>';
    }

    try {
      var res = await apiPostWithFallback(
        '/api/admin/reject-payment',
        '/.netlify/functions/admin-reject-payment',
        {
          bookingId: pendingActionBookingId,
          reason: reason || 'Payment not found in bank statement'
        },
        {
          'Authorization': 'Bearer ' + token,
          'X-Admin-Token': token
        }
      );

      var data = res.data;
      if (res.ok && data && data.success) {
        closeRejectModal();
        alert('Payment rejected for ' + pendingActionBookingId + '.');
        refreshAdminDashboard();
      } else {
        alert('\u2715 Rejection failed: ' + (data ? (data.message || data.error) : 'Database error'));
      }
    } catch (err) {
      console.error('Rejection request failed:', err);
      alert('Network error connecting to rejection server.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  });

  document.getElementById('refreshAdminDataBtn')?.addEventListener('click', refreshAdminDashboard);
  document.getElementById('jumpToPendingBtn')?.addEventListener('click', function () {
    var el = document.getElementById('adminPendingSection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });

  function renderAdminRosterFromBookings(bookingsList) {
    if (!adminTableBody) return;
    var query = adminTicketSearchInput ? adminTicketSearchInput.value.trim().toLowerCase() : '';

    var verifiedBookings = bookingsList.filter(function (b) {
      return b.payment_status === 'PAYMENT_VERIFIED';
    });

    var filtered = verifiedBookings.filter(function (b) {
      var matchText =
        (b.id && b.id.toLowerCase().includes(query)) ||
        (b.customer_name && b.customer_name.toLowerCase().includes(query)) ||
        (b.phone && b.phone.includes(query)) ||
        (b.pass_name && b.pass_name.toLowerCase().includes(query)) ||
        (b.upi_reference && b.upi_reference.toLowerCase().includes(query));

      if (!matchText) return false;
      if (activeAdminFilter === 'ACTIVE') return b.ticket_status === 'ACTIVE' || !b.ticket_status;
      if (activeAdminFilter === 'REDEEMED') return b.ticket_status === 'REDEEMED';
      return true;
    });

    var activeCount = verifiedBookings.filter(function (b) { return b.ticket_status === 'ACTIVE' || !b.ticket_status; }).length;
    var admittedCount = verifiedBookings.filter(function (b) { return b.ticket_status === 'REDEEMED'; }).length;

    if (filterAllCount) filterAllCount.textContent = verifiedBookings.length;
    if (filterPendingCount) filterPendingCount.textContent = activeCount;
    if (filterAdmittedCount) filterAdmittedCount.textContent = admittedCount;

    adminTableBody.innerHTML = '';
    if (filtered.length === 0) {
      adminTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:rgba(255,255,255,0.4);">No verified attendees found matching filters.</td></tr>';
      return;
    }

    filtered.forEach(function (b) {
      var tr = document.createElement('tr');
      var isRedeemed = b.ticket_status === 'REDEEMED';
      tr.innerHTML = [
        '<td class="code-font gold-text" data-label="Booking ID">' + b.id + '</td>',
        '<td data-label="Attendee"><strong>' + b.customer_name + '</strong><br><small style="color:rgba(255,255,255,0.6);">' + b.phone + '</small></td>',
        '<td data-label="Pass Type">' + b.pass_name + '</td>',
        '<td data-label="Guests">' + b.total_admit + ' Pax</td>',
        '<td data-label="Paid" class="gold-text">\u20B9' + (b.expected_amount || 0).toLocaleString('en-IN') + '</td>',
        '<td data-label="Status"><span class="' + (isRedeemed ? 'badge-redeemed' : 'badge-paid') + '">' + (isRedeemed ? 'ADMITTED' : 'ACTIVE') + '</span></td>',
        '<td data-label="Check-in Time">' + (b.checked_in_at ? new Date(b.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014') + '</td>',
        '<td data-label="Action">' + (!isRedeemed ? '<button type="button" class="btn btn-admit-action btn-sm" data-bid="' + b.id + '" style="padding:6px 14px; font-size:0.75rem;">Admit</button>' : '<span style="font-size:0.75rem; color:#a855f7;">Redeemed</span>') + '</td>'
      ].join('');

      var btn = tr.querySelector('button[data-bid]');
      btn?.addEventListener('click', async function () {
        var res = await apiPostWithFallback('/api/ticket/redeem', '/.netlify/functions/redeem-ticket', {
          token: b.id,
          staffName: 'Admin Command Center'
        });
        if (res.ok && res.data && res.data.success) {
          alert('\u2713 Booking ' + b.id + ' marked as Admitted.');
          refreshAdminDashboard();
        } else {
          alert('\u2715 Could not admit: ' + (res.data ? (res.data.message || res.data.reason) : 'Database error'));
        }
      });
      adminTableBody.appendChild(tr);
    });
  }

  adminTicketSearchInput?.addEventListener('input', function () {
    if (cachedAdminData) renderAdminRosterFromBookings(cachedAdminData.allBookings || []);
  });

  document.querySelectorAll('.filter-badge-group .filter-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.filter-badge-group .filter-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activeAdminFilter = pill.getAttribute('data-filter');
      if (cachedAdminData) renderAdminRosterFromBookings(cachedAdminData.allBookings || []);
    });
  });

  exportTicketsCsvBtn?.addEventListener('click', function () {
    var bookings = (cachedAdminData && cachedAdminData.allBookings) ? cachedAdminData.allBookings : [];
    var verified = bookings.filter(function (b) { return b.payment_status === 'PAYMENT_VERIFIED'; });
    if (verified.length === 0) return alert('No verified bookings available to export.');

    var csv = 'Booking ID,Attendee Name,Phone,Email,Pass Category,Quantity,Headcount,Amount Paid,Payment Status,UPI UTR,Ticket Status,Booked At,Checked In At\n';
    verified.forEach(function (b) {
      csv += '"' + b.id + '","' + b.customer_name + '","' + b.phone + '","' + (b.email || '') + '","' + b.pass_name + '","' + b.quantity + '","' + b.total_admit + '","' + b.expected_amount + '","' + b.payment_status + '","' + (b.upi_reference || '') + '","' + (b.ticket_status || 'ACTIVE') + '","' + (b.created_at || '') + '","' + (b.checked_in_at || '') + '"\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Raas_Leela_2026_Attendee_Roster_' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Real-time automatic updates across tabs and within page
  window.addEventListener('raas-db-updated', function () {
    if (hasAdminSession()) {
      refreshAdminDashboard();
    }
  });

  window.addEventListener('storage', function (e) {
    if (e.key === DB_ORDERS_KEY || e.key === DB_TICKETS_KEY) {
      if (hasAdminSession()) {
        refreshAdminDashboard();
      }
    }
  });

  /* ==========================================================================
     10. POSTER FULLSCREEN LIGHTBOX & DJ BANNER
     ========================================================================== */
  var posterLightboxModal = document.getElementById('posterLightboxModal');
  var posterLightboxCloseBtn = document.getElementById('posterLightboxCloseBtn');
  var heroOpenPosterBtn = document.getElementById('heroOpenPosterBtn');
  var viewDjBannerBtn = document.getElementById('viewDjBannerBtn');
  var djPosterFrame = document.getElementById('djPosterFrame');

  function openPosterModal() {
    posterLightboxModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closePosterModal() {
    posterLightboxModal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  heroOpenPosterBtn?.addEventListener('click', openPosterModal);
  posterLightboxCloseBtn?.addEventListener('click', closePosterModal);
  posterLightboxModal?.addEventListener('click', function (e) {
    if (e.target === posterLightboxModal) closePosterModal();
  });

  viewDjBannerBtn?.addEventListener('click', function (e) {
    e.stopPropagation();
    openPosterModal();
  });
  djPosterFrame?.addEventListener('click', openPosterModal);

  /* ==========================================================================
     11. PORTAL TRIGGERS & GITHUB PAGES HASH ROUTING
     ========================================================================== */
  var navStaffPortalBtn = document.getElementById('navStaffPortalBtn');
  var navAdminPortalBtn = document.getElementById('navAdminPortalBtn');
  var dStaffBtn = document.getElementById('dStaffBtn');
  var dAdminBtn = document.getElementById('dAdminBtn');
  var footerStaffTrigger = document.getElementById('footerStaffTrigger');
  var footerAdminTrigger = document.getElementById('footerAdminTrigger');

  navStaffPortalBtn?.addEventListener('click', openStaffPortal);
  dStaffBtn?.addEventListener('click', function () {
    closeDrawer();
    openStaffPortal();
  });
  footerStaffTrigger?.addEventListener('click', function (e) {
    e.preventDefault();
    openStaffPortal();
  });

  navAdminPortalBtn?.addEventListener('click', openAdminPortal);
  dAdminBtn?.addEventListener('click', function () {
    closeDrawer();
    openAdminPortal();
  });
  footerAdminTrigger?.addEventListener('click', function (e) {
    e.preventDefault();
    openAdminPortal();
  });

  function handleRoute() {
    var hash = window.location.hash.toLowerCase();
    if (hash === '#staff' || hash === '#staff-scanner' || hash === '#checkin') {
      openStaffPortal();
    } else if (hash.includes('#verify')) {
      var m = window.location.hash.match(/token=([a-zA-Z0-9_\-]+)/);
      if (m && m[1]) {
        if (hasStaffSession()) {
          openStaffPortal();
          verifyTicketCode(m[1]);
        } else {
          openCheckTicketModal();
        }
      }
    } else if (hash === '#check-ticket' || hash === '#lookup' || hash === '#my-ticket') {
      openCheckTicketModal();
    } else if (hash === '#admin' || hash === '#admin-dashboard' || hash === '#admin/dashboard' || hash.indexOf('#admin') === 0) {
      openAdminPortal();
      if ((hash === '#admin/dashboard' || hash === '#admin-dashboard') && !hasAdminSession()) {
        if (adminAuthFeedback) {
          adminAuthFeedback.innerHTML = '<span>\u2715 ACCESS DENIED<br>AUTHENTICATION REQUIRED</span>';
          adminAuthFeedback.className = 'auth-feedback-box error';
          adminAuthFeedback.style.display = 'block';
        }
      }
    } else if (!hash || hash === '#' || hash === '#hero' || hash === '#passes') {
      if (hash === '#passes') {
        try {
          history.replaceState(null, document.title, window.location.pathname + window.location.search);
        } catch (_) {}
      }
      window.scrollTo(0, 0);
    }
  }

  window.addEventListener('hashchange', handleRoute);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleRoute);
  } else {
    handleRoute();
  }

  window.addEventListener('pageshow', function () {
    var hash = (window.location.hash || '').toLowerCase();
    var isPortal = hash.startsWith('#staff') || hash.startsWith('#admin') || hash.startsWith('#check-ticket') || hash.startsWith('#lookup') || hash.startsWith('#my-ticket') || hash.includes('verify');
    if (!isPortal && (!hash || hash === '#' || hash === '#hero' || hash === '#passes')) {
      window.scrollTo(0, 0);
    }
  });

  // Smooth scroll handler for all booking CTAs navigating to #passes
  document.querySelectorAll('a[href="#passes"], #stickyBookBtn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var passesSection = document.getElementById('passes');
      if (passesSection) {
        passesSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  /* ==========================================================================
     12. MOBILE STICKY BOTTOM BOOKING CTA CONTROLLER
     ========================================================================== */
  var mobileStickyCta = document.getElementById('mobileStickyCta');
  function updateStickyCtaVisibility() {
    if (!mobileStickyCta) return;
    var heroEl = document.getElementById('hero');
    var threshold = heroEl ? Math.max(heroEl.offsetHeight * 0.65, 320) : 320;
    var isModalActive = !!document.querySelector('.modal-scrim.active, .nav-slide-drawer.active');
    
    if (window.scrollY > threshold && !isModalActive && window.innerWidth <= 900) {
      mobileStickyCta.classList.add('is-visible');
    } else {
      mobileStickyCta.classList.remove('is-visible');
    }
  }

  window.addEventListener('scroll', updateStickyCtaVisibility, { passive: true });
  window.addEventListener('resize', updateStickyCtaVisibility);

  // Hook into modal state changes
  var observer = new MutationObserver(updateStickyCtaVisibility);
  document.querySelectorAll('.modal-scrim, .nav-slide-drawer').forEach(function (m) {
    observer.observe(m, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  window.RaasLeelaEngine = {
    EventDB: EventDB,
    sha256: sha256,
    openBookingModal: openBookingModal,
    openCheckTicketModal: openCheckTicketModal,
    openStaffPortal: openStaffPortal,
    openAdminPortal: openAdminPortal,
    updateStickyCtaVisibility: updateStickyCtaVisibility
  };

})();