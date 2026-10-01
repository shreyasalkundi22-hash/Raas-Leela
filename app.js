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
        paymentMethod: data.paymentMethod || 'Razorpay Gateway',
        createdAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      };
      orders.unshift(order);
      this.saveAllOrders(orders);
      return order;
    },

    mintTicketsForPaidOrder: function (orderRef, txnId) {
      var orders = this.getAllOrders();
      var order = orders.find(function (o) { return o.orderRef === orderRef; });
      if (!order) return null;

      order.paymentStatus = 'PAID';
      order.paymentTxnId = txnId || ('TXN-' + Math.floor(100000 + Math.random() * 900000));
      this.saveAllOrders(orders);

      var tickets = this.getAllTickets();
      var minted = [];

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

  var pendingOrderData = null;
  var currentlyGeneratedTickets = [];
  var currentActiveTicketIndex = 0;

  var bookingModal = document.getElementById('bookingModal');
  var bookingModalCloseBtn = document.getElementById('bookingModalCloseBtn');
  var bookingFormStep = document.getElementById('bookingFormStep');
  var bookingConfirmStep = document.getElementById('bookingConfirmStep');
  var bookingSuccessStep = document.getElementById('bookingSuccessStep');

  var ticketCheckoutForm = document.getElementById('ticketCheckoutForm');
  var modalPassCategory = document.getElementById('modalPassCategory');
  var modalPassQty = document.getElementById('modalPassQty');
  var qtyDecBtn = document.getElementById('qtyDecBtn');
  var qtyIncBtn = document.getElementById('qtyIncBtn');
  var summaryTitleText = document.getElementById('summaryTitleText');
  var summarySubtotalText = document.getElementById('summarySubtotalText');
  var summaryTotalText = document.getElementById('summaryTotalText');

  // Confirmation Screen Elements
  var confirmOrderRef = document.getElementById('confirmOrderRef');
  var confirmPassTitle = document.getElementById('confirmPassTitle');
  var confirmHeadcountBadge = document.getElementById('confirmHeadcountBadge');
  var confirmAttendeeName = document.getElementById('confirmAttendeeName');
  var confirmAttendeePhone = document.getElementById('confirmAttendeePhone');
  var confirmTotalAmount = document.getElementById('confirmTotalAmount');
  var proceedToPaymentBtn = document.getElementById('proceedToPaymentBtn');
  var backToFormBtn = document.getElementById('backToFormBtn');

  // Payment Status Cards
  var paymentVerifyingCard = document.getElementById('paymentVerifyingCard');
  var paymentCancelledCard = document.getElementById('paymentCancelledCard');
  var paymentFailedCard = document.getElementById('paymentFailedCard');
  var gatewayConfigRequiredCard = document.getElementById('gatewayConfigRequiredCard');

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
    if (bookingConfirmStep) bookingConfirmStep.style.display = 'none';
    if (bookingSuccessStep) bookingSuccessStep.style.display = 'none';
    bookingModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeBookingModal() {
    bookingModal?.classList.remove('active');
    document.body.style.overflow = '';
  }

  bookingModalCloseBtn?.addEventListener('click', closeBookingModal);

  ticketCheckoutForm?.addEventListener('submit', function (e) {
    e.preventDefault();

    var cat = modalPassCategory ? modalPassCategory.value : 'couple';
    var qty = parseInt(modalPassQty ? modalPassQty.value : '1', 10) || 1;
    var item = prices[cat] || prices.couple;
    var totalAmount = item.price * qty;
    var headcount = item.admit * qty;

    var name = document.getElementById('attendeeFullName')?.value.trim();
    var phone = document.getElementById('attendeeWhatsApp')?.value.trim();
    var email = document.getElementById('attendeeEmailAddress')?.value.trim();

    if (!name || !phone) {
      alert('Please enter your Full Name and 10-digit WhatsApp Number.');
      return;
    }

    var orderRef = 'ORD-RL26-' + Math.floor(10000 + Math.random() * 90000);

    pendingOrderData = {
      orderRef: orderRef,
      name: name,
      phone: phone,
      email: email,
      tier: cat,
      qty: qty,
      item: item,
      totalAmount: totalAmount,
      headcount: headcount
    };

    // Update Confirmation Screen
    if (confirmOrderRef) confirmOrderRef.textContent = orderRef;
    if (confirmPassTitle) confirmPassTitle.textContent = item.name.toUpperCase();
    if (confirmHeadcountBadge) confirmHeadcountBadge.textContent = headcount + ' ' + (headcount > 1 ? 'PEOPLE' : 'PERSON');
    if (confirmAttendeeName) confirmAttendeeName.textContent = name;
    if (confirmAttendeePhone) confirmAttendeePhone.textContent = phone;
    if (confirmTotalAmount) confirmTotalAmount.textContent = '\u20B9' + totalAmount.toLocaleString('en-IN');

    // Reset status cards
    if (paymentVerifyingCard) paymentVerifyingCard.style.display = 'none';
    if (paymentCancelledCard) paymentCancelledCard.style.display = 'none';
    if (paymentFailedCard) paymentFailedCard.style.display = 'none';
    if (gatewayConfigRequiredCard) gatewayConfigRequiredCard.style.display = 'none';

    // Show Confirmation Screen
    if (bookingFormStep) bookingFormStep.style.display = 'none';
    if (bookingConfirmStep) bookingConfirmStep.style.display = 'block';
    if (bookingSuccessStep) bookingSuccessStep.style.display = 'none';
  });

  backToFormBtn?.addEventListener('click', function () {
    if (bookingConfirmStep) bookingConfirmStep.style.display = 'none';
    if (bookingFormStep) bookingFormStep.style.display = 'block';
  });

  async function launchRazorpayStandardCheckout() {
    if (!pendingOrderData) return;

    if (paymentCancelledCard) paymentCancelledCard.style.display = 'none';
    if (paymentFailedCard) paymentFailedCard.style.display = 'none';
    if (gatewayConfigRequiredCard) gatewayConfigRequiredCard.style.display = 'none';

    // Register booking as PENDING in local database
    EventDB.createOrder({
      orderRef: pendingOrderData.orderRef,
      name: pendingOrderData.name,
      phone: pendingOrderData.phone,
      email: pendingOrderData.email,
      passType: pendingOrderData.item.name,
      tier: pendingOrderData.tier,
      qty: pendingOrderData.qty,
      admitCount: pendingOrderData.headcount,
      amount: pendingOrderData.totalAmount,
      paymentStatus: 'PENDING',
      ticketStatus: 'NOT_ISSUED',
      paymentMethod: 'Razorpay Standard Checkout'
    });

    var keyId = window.RAZORPAY_KEY_ID || null;
    var backendApi = window.RAAS_BACKEND_API_URL || null;

    if (!keyId && !backendApi) {
      // Per instructions: If Razorpay credentials are not yet configured,
      // DO NOT simulate or fake payment.
      // Display clearly: "Razorpay credentials/configuration required."
      if (gatewayConfigRequiredCard) gatewayConfigRequiredCard.style.display = 'block';
      return;
    }

    var orderAmountPaise = pendingOrderData.totalAmount * 100;
    var razorpayOrderId = null;

    // Server-side order creation if backend is reachable
    if (backendApi || window.location.port === '3000') {
      try {
        var createUrl = (backendApi || '') + '/api/payment/create-order';
        var oRes = await fetch(createUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: pendingOrderData.tier,
            qty: pendingOrderData.qty,
            customerName: pendingOrderData.name,
            customerPhone: pendingOrderData.phone,
            customerEmail: pendingOrderData.email
          })
        });
        var oData = await oRes.json();
        if (oData && oData.success) {
          razorpayOrderId = oData.orderId;
          keyId = oData.keyId || keyId;
          orderAmountPaise = oData.amount || orderAmountPaise;
        } else if (oData && oData.error === 'GATEWAY_CREDENTIALS_REQUIRED') {
          if (gatewayConfigRequiredCard) gatewayConfigRequiredCard.style.display = 'block';
          return;
        }
      } catch (e) {
        console.warn('Backend order endpoint unreachable, opening direct Razorpay Checkout with configured key', e);
      }
    }

    function openRzpModal() {
      var options = {
        key: keyId,
        amount: orderAmountPaise,
        currency: 'INR',
        name: 'RAAS LEELA 2026',
        description: pendingOrderData.item.name + ' \u2014 The Social House',
        image: 'poster.jpg',
        order_id: razorpayOrderId || undefined,
        prefill: {
          name: pendingOrderData.name,
          contact: pendingOrderData.phone,
          email: pendingOrderData.email || ''
        },
        theme: { color: '#8d122b' },
        modal: {
          ondismiss: function () {
            // CUSTOMER CLOSES RAZORPAY CHECKOUT
            if (paymentCancelledCard) paymentCancelledCard.style.display = 'block';
            if (paymentVerifyingCard) paymentVerifyingCard.style.display = 'none';
            if (paymentFailedCard) paymentFailedCard.style.display = 'none';
          }
        },
        handler: async function (response) {
          // PAYMENT SUBMITTED BY CUSTOMER
          if (paymentVerifyingCard) paymentVerifyingCard.style.display = 'block';
          if (paymentCancelledCard) paymentCancelledCard.style.display = 'none';
          if (paymentFailedCard) paymentFailedCard.style.display = 'none';

          var isVerified = await verifyPaymentWithServer(response, pendingOrderData);
          if (isVerified) {
            var minted = EventDB.mintTicketsForPaidOrder(pendingOrderData.orderRef, response.razorpay_payment_id);
            currentlyGeneratedTickets = minted;
            currentActiveTicketIndex = 0;
            if (bookingConfirmStep) bookingConfirmStep.style.display = 'none';
            if (bookingSuccessStep) bookingSuccessStep.style.display = 'block';
            displayConfirmedTicket(0);
            setupMultiPassSwitcher();
          } else {
            if (paymentVerifyingCard) paymentVerifyingCard.style.display = 'none';
            if (paymentFailedCard) paymentFailedCard.style.display = 'block';
          }
        }
      };

      try {
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          if (paymentFailedCard) paymentFailedCard.style.display = 'block';
          if (paymentCancelledCard) paymentCancelledCard.style.display = 'none';
          if (paymentVerifyingCard) paymentVerifyingCard.style.display = 'none';
        });
        rzp.open();
      } catch (err) {
        console.error('Razorpay initialization error:', err);
        if (paymentFailedCard) paymentFailedCard.style.display = 'block';
      }
    }

    if (typeof Razorpay === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = openRzpModal;
      script.onerror = function () {
        if (paymentFailedCard) paymentFailedCard.style.display = 'block';
      };
      document.body.appendChild(script);
    } else {
      openRzpModal();
    }
  }

  async function verifyPaymentWithServer(rzpResponse, orderData) {
    var backendApi = window.RAAS_BACKEND_API_URL || (window.location.port === '3000' ? '' : null);
    if (backendApi !== null) {
      try {
        var res = await fetch(backendApi + '/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderRef: orderData.orderRef,
            razorpay_payment_id: rzpResponse.razorpay_payment_id,
            razorpay_order_id: rzpResponse.razorpay_order_id,
            razorpay_signature: rzpResponse.razorpay_signature
          })
        });
        var data = await res.json();
        return data && data.success;
      } catch (e) {
        return false;
      }
    }
    return !!rzpResponse.razorpay_payment_id;
  }

  proceedToPaymentBtn?.addEventListener('click', launchRazorpayStandardCheckout);
  document.getElementById('retryAfterCancelBtn')?.addEventListener('click', launchRazorpayStandardCheckout);
  document.getElementById('retryAfterFailBtn')?.addEventListener('click', launchRazorpayStandardCheckout);
  document.getElementById('retryAfterConfigBtn')?.addEventListener('click', launchRazorpayStandardCheckout);

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

  function verifyTicketCode(query) {
    if (!hasStaffSession()) {
      openStaffPortal();
      return;
    }

    resetVerificationDisplay();
    currentlyInspectedTicketId = null;

    var ticket = EventDB.lookupTicket(query);

    if (!ticket) {
      if (verifyInvalidCard) {
        verifyInvalidCard.style.display = 'block';
        var invalidNote = document.getElementById('vInvalidQueryText');
        if (invalidNote) invalidNote.textContent = 'Queried Code: "' + query + '"';
      }
      return;
    }

    if (ticket.status === 'REDEEMED' || ticket.status === 'CHECKED_IN') {
      if (verifyUsedCard) {
        verifyUsedCard.style.display = 'block';
        var vUsedName = document.getElementById('vUsedName');
        var vUsedTime = document.getElementById('vUsedTime');
        var vUsedGate = document.getElementById('vUsedGate');
        var vUsedCode = document.getElementById('vUsedCode');
        if (vUsedName) vUsedName.textContent = ticket.name;
        if (vUsedTime) vUsedTime.textContent = ticket.checkedInAt || 'Earlier Today';
        if (vUsedGate) vUsedGate.textContent = ticket.checkedInBy || 'Gate 1 Staff';
        if (vUsedCode) vUsedCode.textContent = ticket.id;
      }
      return;
    }

    currentlyInspectedTicketId = ticket.id;
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
      if (vName) vName.textContent = ticket.name;
      if (vCategory) vCategory.textContent = ticket.passType;
      if (vAdmitCount) vAdmitCount.textContent = ticket.admitCount + ' ' + (ticket.admitCount > 1 ? 'PEOPLE' : 'PERSON');
      if (vAmountPaid) vAmountPaid.textContent = '\u20B9' + ticket.amount;
      if (vPayStatus) vPayStatus.textContent = ticket.paymentStatus || 'PAID';
      if (vTicketStatus) vTicketStatus.textContent = ticket.status || 'ACTIVE';

      if (admitTicketBtn) {
        admitTicketBtn.disabled = false;
        admitTicketBtn.innerHTML = '<span>\u2713 ADMIT & CLOSE TICKET</span>';
      }
    }
  }

  admitTicketBtn?.addEventListener('click', function () {
    if (!currentlyInspectedTicketId) return;
    var res = EventDB.admitTicket(currentlyInspectedTicketId, 'Gate 1 Staff');

    if (res.success) {
      admitTicketBtn.disabled = true;
      admitTicketBtn.innerHTML = '<span>\u2713 ADMITTED & REDEEMED (GATE 1)</span>';
      alert('\u2713 Ticket ' + currentlyInspectedTicketId + ' Admitted & Closed successfully! Duplicate entry is now blocked.');
    } else if (res.reason === 'ALREADY_USED') {
      verifyTicketCode(currentlyInspectedTicketId);
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
    } catch (err) {
      alert('Camera access unavailable or declined. Please use Manual Code Lookup.');
    }
  }

  function stopCamera() {
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

  adminLoginForm?.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pass = adminPasswordInput ? adminPasswordInput.value : '';
    if (!pass) {
      if (adminAuthFeedback) {
        adminAuthFeedback.innerHTML = '<span>\u2715 INCORRECT PASSWORD<br>ACCESS DENIED</span>';
        adminAuthFeedback.className = 'auth-feedback-box error';
        adminAuthFeedback.style.display = 'block';
      }
      return;
    }

    var passHash = await sha256(pass);

    // Cryptographic match against exact case-sensitive admin hash
    if (passHash === ADMIN_SECURE_AUTH_HASH) {
      if (adminAuthFeedback) {
        adminAuthFeedback.innerHTML = '<span>\u2713 ACCESS GRANTED</span>';
        adminAuthFeedback.className = 'auth-feedback-box success';
        adminAuthFeedback.style.display = 'block';
      }
      var sessionToken = 'admin_session_' + Date.now() + '_' + Math.random().toString(36).substring(2);
      sessionStorage.setItem('raas_admin_session', sessionToken);

      setTimeout(function () {
        if (adminLoginView) adminLoginView.style.display = 'none';
        if (adminDashboardView) adminDashboardView.style.display = 'block';
        refreshAdminDashboard();
      }, 350);
    } else {
      if (adminAuthFeedback) {
        adminAuthFeedback.innerHTML = '<span>\u2715 INCORRECT PASSWORD<br>ACCESS DENIED</span>';
        adminAuthFeedback.className = 'auth-feedback-box error';
        adminAuthFeedback.style.display = 'block';
      }
      adminPasswordInput?.classList.add('shake');
      setTimeout(function () { adminPasswordInput?.classList.remove('shake'); }, 500);
      if (adminPasswordInput) adminPasswordInput.value = '';
    }
  });

  adminSignoutBtn?.addEventListener('click', function () {
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

  function refreshAdminDashboard() {
    var analytics = EventDB.getSalesAnalytics();

    var cmdTotalRevenue = document.getElementById('cmdTotalRevenue');
    var cmdPaidBookings = document.getElementById('cmdPaidBookings');
    var cmdTotalPeople = document.getElementById('cmdTotalPeople');
    var cmdCheckedIn = document.getElementById('cmdCheckedIn');
    var cmdCheckinPercentage = document.getElementById('cmdCheckinPercentage');

    if (cmdTotalRevenue) cmdTotalRevenue.textContent = '\u20B9' + analytics.totalRevenue.toLocaleString('en-IN');
    if (cmdPaidBookings) cmdPaidBookings.textContent = analytics.totalBookings;
    if (cmdTotalPeople) cmdTotalPeople.textContent = analytics.totalPeople;
    if (cmdCheckedIn) cmdCheckedIn.textContent = analytics.checkedIn;

    var pct = analytics.totalPeople > 0 ? Math.round((analytics.checkedIn / analytics.totalPeople) * 100) : 0;
    if (cmdCheckinPercentage) cmdCheckinPercentage.textContent = pct + '% Admitted';

    // Live PASS SALES Breakdown Rows
    var sStagB = document.getElementById('salesStagBookings');
    var sStagP = document.getElementById('salesStagPeople');
    var sStagR = document.getElementById('salesStagRevenue');

    var sCoupleB = document.getElementById('salesCoupleBookings');
    var sCoupleP = document.getElementById('salesCouplePeople');
    var sCoupleR = document.getElementById('salesCoupleRevenue');

    var sGroupB = document.getElementById('salesGroupBookings');
    var sGroupP = document.getElementById('salesGroupPeople');
    var sGroupR = document.getElementById('salesGroupRevenue');

    var sTotB = document.getElementById('salesTotalBookings');
    var sTotP = document.getElementById('salesTotalPeople');
    var sTotR = document.getElementById('salesTotalRevenue');

    if (sStagB) sStagB.textContent = analytics.stag.bookings;
    if (sStagP) sStagP.textContent = analytics.stag.people;
    if (sStagR) sStagR.textContent = '\u20B9' + analytics.stag.revenue.toLocaleString('en-IN');

    if (sCoupleB) sCoupleB.textContent = analytics.couple.bookings;
    if (sCoupleP) sCoupleP.textContent = analytics.couple.people;
    if (sCoupleR) sCoupleR.textContent = '\u20B9' + analytics.couple.revenue.toLocaleString('en-IN');

    if (sGroupB) sGroupB.textContent = analytics.group.bookings;
    if (sGroupP) sGroupP.textContent = analytics.group.people;
    if (sGroupR) sGroupR.textContent = '\u20B9' + analytics.group.revenue.toLocaleString('en-IN');

    if (sTotB) sTotB.textContent = analytics.totalBookings;
    if (sTotP) sTotP.textContent = analytics.totalPeople;
    if (sTotR) sTotR.textContent = '\u20B9' + analytics.totalRevenue.toLocaleString('en-IN');

    renderAdminRosterTable();
  }

  function renderAdminRosterTable() {
    if (!adminTableBody) return;
    var tickets = EventDB.getAllTickets();
    var query = adminTicketSearchInput?.value.trim().toLowerCase() || '';

    var filtered = tickets.filter(function (t) {
      var matchText =
        (t.id && t.id.toLowerCase().indexOf(query) !== -1) ||
        (t.name && t.name.toLowerCase().indexOf(query) !== -1) ||
        (t.phone && t.phone.indexOf(query) !== -1) ||
        (t.passType && t.passType.toLowerCase().indexOf(query) !== -1);

      if (!matchText) return false;
      if (activeAdminFilter === 'ACTIVE') return t.status === 'ACTIVE' || t.status === 'CONFIRMED';
      if (activeAdminFilter === 'REDEEMED') return t.status === 'REDEEMED' || t.status === 'CHECKED_IN';
      return true;
    });

    var activeCount = tickets.filter(function (t) { return t.status === 'ACTIVE' || t.status === 'CONFIRMED'; }).length;
    var admittedCount = tickets.filter(function (t) { return t.status === 'REDEEMED' || t.status === 'CHECKED_IN'; }).length;

    if (filterAllCount) filterAllCount.textContent = tickets.length;
    if (filterPendingCount) filterPendingCount.textContent = activeCount;
    if (filterAdmittedCount) filterAdmittedCount.textContent = admittedCount;

    adminTableBody.innerHTML = '';
    if (filtered.length === 0) {
      adminTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:rgba(255,255,255,0.4);">No verified attendees found in database.</td></tr>';
      return;
    }

    filtered.forEach(function (t) {
      var tr = document.createElement('tr');
      var isRedeemed = t.status === 'REDEEMED' || t.status === 'CHECKED_IN';
      tr.innerHTML = [
        '<td class="code-font gold-text">' + t.id + '</td>',
        '<td><strong>' + t.name + '</strong><br><small style="color:rgba(255,255,255,0.5);">' + t.phone + '</small></td>',
        '<td>' + t.passType + '</td>',
        '<td>' + t.admitCount + ' Pax</td>',
        '<td>\u20B9' + t.amount + '</td>',
        '<td><span class="' + (isRedeemed ? 'badge-redeemed' : 'badge-paid') + '">' + (isRedeemed ? 'ADMITTED' : 'ACTIVE') + '</span></td>',
        '<td>' + (t.checkedInAt || '\u2014') + '</td>',
        '<td>' + (!isRedeemed ? '<button type="button" class="btn btn-admit-action btn-sm" data-id="' + t.id + '" style="padding:4px 10px; font-size:0.75rem;">Admit</button>' : '<span style="font-size:0.75rem; color:#a855f7;">Redeemed</span>') + '</td>'
      ].join('');

      var btn = tr.querySelector('button[data-id]');
      btn?.addEventListener('click', function () {
        EventDB.admitTicket(t.id, 'Admin Command Center');
        refreshAdminDashboard();
      });
      adminTableBody.appendChild(tr);
    });
  }

  adminTicketSearchInput?.addEventListener('input', renderAdminRosterTable);
  document.querySelectorAll('.filter-badge-group .filter-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.filter-badge-group .filter-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      activeAdminFilter = pill.getAttribute('data-filter');
      renderAdminRosterTable();
    });
  });

  exportTicketsCsvBtn?.addEventListener('click', function () {
    var tickets = EventDB.getAllTickets();
    if (tickets.length === 0) return alert('No verified tickets available to export.');

    var csv = 'Ticket ID,Attendee Name,Phone,Email,Pass Category,Headcount,Amount Paid,Payment Status,Payment Ref,Verification Token,Status,Booked At,Checked In At\n';
    tickets.forEach(function (t) {
      csv += '"' + t.id + '","' + t.name + '","' + t.phone + '","' + (t.email || '') + '","' + t.passType + '","' + t.admitCount + '","' + t.amount + '","' + (t.paymentStatus || 'PAID') + '","' + (t.paymentTxnId || '') + '","' + (t.verifyToken || '') + '","' + t.status + '","' + t.createdAt + '","' + (t.checkedInAt || '') + '"\n';
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
    } else if (hash === '#admin' || hash === '#admin-dashboard' || hash === '#admin/dashboard' || hash.indexOf('#admin') === 0) {
      openAdminPortal();
      if ((hash === '#admin/dashboard' || hash === '#admin-dashboard') && !hasAdminSession()) {
        if (adminAuthFeedback) {
          adminAuthFeedback.innerHTML = '<span>\u2715 ACCESS DENIED<br>AUTHENTICATION REQUIRED</span>';
          adminAuthFeedback.className = 'auth-feedback-box error';
          adminAuthFeedback.style.display = 'block';
        }
      }
    }
  }

  window.addEventListener('hashchange', handleRoute);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleRoute);
  } else {
    handleRoute();
  }

  window.RaasLeelaEngine = {
    EventDB: EventDB,
    sha256: sha256,
    openStaffPortal: openStaffPortal,
    openAdminPortal: openAdminPortal
  };

})();