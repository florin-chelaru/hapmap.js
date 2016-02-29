/**
* @license hapmap.js
* Copyright (c) 2016 Florin Chelaru
* License: MIT
*
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
* documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
* rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
* permit persons to whom the Software is furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
* Software.
*/


goog.provide('hapmap.models.LDItem');

//{rs1: {start: Number, id: string}, rs2: {start: Number, id: string}, pop: string, dprime: Number, rsquare: Number, lod: Number, fbin: Number}

/**
 * @param {{start: number, id: string}} rs1
 * @param {{start: number, id: string}} rs2
 * @param {string} pop
 * @param {number} dprime
 * @param {number} rsquare
 * @param {number} lod
 * @param {number} fbin
 * @constructor
 */
hapmap.models.LDItem = function(rs1, rs2, pop, dprime, rsquare, lod, fbin) {
  /**
   * @type {{start: number, id: string}}
   */
  this['rs1'] = rs1;

  /**
   * @type {{start: number, id: string}}
   */
  this['rs2'] = rs2;

  /**
   * @type {string}
   */
  this['pop'] = pop;

  /**
   * @type {number}
   */
  this['dprime'] = dprime;

  /**
   * @type {number}
   */
  this['rsquare'] = rsquare;

  /**
   * @type {number}
   */
  this['lod'] = lod;

  /**
   * @type {number}
   */
  this['fbin'] = fbin;
};

/**
 * Parses a line of text into an instance of LDItem, based on the specifications of HapMap:
 * http://hapmap.ncbi.nlm.nih.gov/downloads/ld_data/2009-04_rel27/00README.txt
 * @param {string} text
 * @returns {hapmap.models.LDItem}
 */
hapmap.models.LDItem.parse = function(text) {
  var tokens = text.split(' ', 9);
  return new hapmap.models.LDItem(
    {                         // rs1
      'start': parseInt(tokens[0], 10),
      'id': tokens[3]
    },
    {                         // rs2
      'start': parseInt(tokens[1], 10),
      'id': tokens[4]
    },
    tokens[2],                // pop
    parseFloat(tokens[5]),    // dprime
    parseFloat(tokens[6]),    // rsquare
    parseFloat(tokens[7]),    // lod
    parseInt(tokens[8], 10)); // fbin
};


goog.provide('hapmap.HapmapReader');

goog.require('goog.math.Long');
goog.require('goog.string.format');

goog.require('hapmap.models.LDItem');

/**
 * @param {string} uri
 * @param {string} [fwdUri]
 * @param {number} [cacheSize] Default is 512KB
 * @constructor
 */
hapmap.HapmapReader = function(uri, fwdUri, cacheSize) {
  /**
   * @type {string}
   * @private
   */
  this._uri = uri;

  /**
   * @type {?string}
   * @private
   */
  this._fwdUri = fwdUri || null;

  /**
   * @type {goog.math.Long}
   * @private
   */
  this._fileSize = null;

  var self = this;

  /**
   * @type {Promise.<goog.math.Long>}
   * @private
   */
  this._fileSizePromise = new Promise(function(resolve, reject) {
    if (self._fileSize != undefined) { resolve(self._fileSize); return; }
    self.get(0, 1).then(
      /** @param {{data: ArrayBuffer, xhr: XMLHttpRequest}} r */
      function(r) {
        var rangeHeader = r['xhr'].getResponseHeader('Content-Range');
        self._fileSize = goog.math.Long.fromString(rangeHeader.substr(rangeHeader.indexOf('/') + 1));
        resolve(self._fileSize);
      },
      reject);
  });

  /**
   * @type {number}
   * @private
   */
  this._cacheSize = (cacheSize && cacheSize > 0) ? cacheSize * 1024 : hapmap.HapmapReader.CACHE_BLOCK_SIZE;

  this._fileSizePromise.then(/** @param {goog.math.Long} size */ function(size) {
    if (size.lessThan(goog.math.Long.fromNumber(self._cacheSize))) {
      self._cacheSize = size.toNumber();
    }
  });

  /**
   * @type {function((number|goog.math.Long), (number|goog.math.Long)): Promise}
   * @private
   */
  this._get = (cacheSize === 0) ? this.get : this.getCached;

  /**
   * @type {function((number|goog.math.Long), (number|goog.math.Long)): Promise}
   * @private
   */
  this._getText = (cacheSize === 0) ? this.getText : this.getTextCached;

  /**
   * @type {Object.<string, Promise.<{data: ArrayBuffer}>>}
   * @private
   */
  this._cache = {};

  /**
   * @type {Object.<string, Promise.<{data: string}>>}
   * @private
   */
  this._textCache = {};

  /**
   * One line is about 60-70 characters <= 2^7. To make sure we get at least one full line, we use a buffer size twice as large.
   * @type {number}
   * @private
   */
  this._lineBufferSize = 256;

};

hapmap.HapmapReader.N_RETRIES = 10;

hapmap.HapmapReader.CACHE_BLOCK_SIZE = 1024 * 512;

/**
 * @param {number|goog.math.Long} start File offset start
 * @param {number|goog.math.Long} end File offset end
 * @return {Promise.<{data: ArrayBuffer, xhr: XMLHttpRequest}>}
 */
hapmap.HapmapReader.prototype.get = function(start, end) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var retriesLeft = hapmap.HapmapReader.N_RETRIES;
    var s = /** @type {string|number} */ ((start instanceof goog.math.Long) ? start.toString() : start);
    var e = /** @type {string|number} */ ((end instanceof goog.math.Long) ? end.subtract(goog.math.Long.fromInt(1)).toString() : end - 1);
    var uri = self._fwdUri ? goog.string.format('%s?r=%s-%s&q=%s', self._fwdUri, s, e, self._uri) : self._uri;

    var retry = function () {
      var req = new XMLHttpRequest();
      req.open('GET', uri, true);
      if (!self._fwdUri) {
        req.setRequestHeader('Range', goog.string.format('bytes=%s-%s', s, e));
      }
      req.responseType = 'arraybuffer';
      req.onload = function (e) {
        resolve({'data': e.target.response, 'xhr': e.target});
      };
      req.onreadystatechange = function () {
        if (req.readyState === 4) {
          if (req.status === 200 || req.status == 206) {
          } else {
            --retriesLeft;
            if (retriesLeft) {
              u.log.warn('Failed: Range ' + goog.string.format('bytes=%s-%s', s, e) + '; retrying...');
              retry();
            } else {
              u.log.error('Failed: Range ' + goog.string.format('bytes=%s-%s', s, e));
              reject('Failed: Range ' + goog.string.format('bytes=%s-%s', s, e));
            }
          }
        }
      };
      req.send();
    };

    retry();
  });
};

/**
 * @param {number|goog.math.Long} start File offset start
 * @param {number|goog.math.Long} end File offset end
 * @return {Promise.<{data: string, xhr: XMLHttpRequest}>}
 */
hapmap.HapmapReader.prototype.getText = function(start, end) {
  var self = this;
  return new Promise(function(resolve, reject) {
    var retriesLeft = hapmap.HapmapReader.N_RETRIES;
    var s = /** @type {string|number} */ ((start instanceof goog.math.Long) ? start.toString() : start);
    var e = /** @type {string|number} */ ((end instanceof goog.math.Long) ? end.subtract(goog.math.Long.fromInt(1)).toString() : end - 1);
    var uri = self._fwdUri ? goog.string.format('%s?r=%s-%s&q=%s', self._fwdUri, s, e, self._uri) : self._uri;

    var retry = function () {
      var req = new XMLHttpRequest();
      req.open('GET', uri, true);
      if (!self._fwdUri) {
        req.setRequestHeader('Range', goog.string.format('bytes=%s-%s', s, e));
      }
      req.responseType = 'text';
      req.onload = function (e) {
        resolve({'data': e.target.response, 'xhr': e.target});
      };
      req.onreadystatechange = function () {
        if (req.readyState === 4) {
          if (req.status === 200 || req.status == 206) {
          } else {
            --retriesLeft;
            if (retriesLeft) {
              u.log.warn('Failed: Range ' + goog.string.format('bytes=%s-%s', s, e) + '; retrying...');
              retry();
            } else {
              u.log.error('Failed: Range ' + goog.string.format('bytes=%s-%s', s, e));
              reject('Failed: Range ' + goog.string.format('bytes=%s-%s', s, e));
            }
          }
        }
      };
      req.send();
    };

    retry();
  });
};

/**
 * @returns {Promise.<goog.math.Long>}
 */
hapmap.HapmapReader.prototype.getFileSize = function() {
  return this._fileSizePromise;
};

/**
 * @param {number|goog.math.Long} start File offset start
 * @param {number|goog.math.Long} end File offset end
 * @returns {Promise.<{data: ArrayBuffer}>}
 */
hapmap.HapmapReader.prototype.getCached = function(start, end) {
  var self = this;

  return new Promise(function(resolve, reject) {
    if (self._fileSize == undefined) {
      self.getFileSize()
        .then(function() {
          self.getCached(start, end).then(resolve, reject);
        }, reject);
      return;
    }

    var lStart = (start instanceof goog.math.Long) ? start : goog.math.Long.fromNumber(/** @type {number} */(start));
    var lEnd = (end instanceof goog.math.Long) ? end : goog.math.Long.fromNumber(/** @type {number} */(end));

    var blockSize = goog.math.Long.fromNumber(self._cacheSize);
    var startBl = lStart.div(blockSize);
    var endBl = lEnd.div(blockSize);
    var s = startBl.multiply(blockSize);
    var e = s.add(blockSize);
    if (!startBl.equals(endBl)) {
      self.getText(start, end).then(resolve, reject);
      return;
    }

    var b = startBl.toString();
    var promise = self._cache[b];
    if (!promise) {
      promise = new Promise(function(resolve, reject) {
        if (e.greaterThan(self._fileSize)) {
          e = self._fileSize;
        }
        self.getText(s, e).then(resolve, reject);
      });
      self._cache[b] = promise;
    }
    promise.then(function(r) {
      var begin = lStart.subtract(s).toNumber();
      var end = lEnd.subtract(s).toNumber();
      resolve({'data': r['data'].slice(begin, end)});
    });
  });
};

/**
 * @param {number|goog.math.Long} start File offset start
 * @param {number|goog.math.Long} end File offset end
 * @returns {Promise.<{data: string}>}
 */
hapmap.HapmapReader.prototype.getTextCached = function(start, end) {
  var self = this;

  return new Promise(function(resolve, reject) {
    if (self._fileSize == undefined) {
      self.getFileSize()
        .then(function() {
          self.getTextCached(start, end).then(resolve, reject);
        }, reject);
      return;
    }

    var lStart = (start instanceof goog.math.Long) ? start : goog.math.Long.fromNumber(/** @type {number} */(start));
    var lEnd = (end instanceof goog.math.Long) ? end : goog.math.Long.fromNumber(/** @type {number} */(end));

    var blockSize = goog.math.Long.fromNumber(self._cacheSize);
    var startBl = lStart.div(blockSize);
    var endBl = lEnd.div(blockSize);
    var s = startBl.multiply(blockSize);
    var e = s.add(blockSize);
    if (!startBl.equals(endBl)) {
      self.getText(start, end).then(resolve, reject);
      return;
    }

    var b = startBl.toString();
    var promise = self._textCache[b];
    if (!promise) {
      promise = new Promise(function(resolve, reject) {
        if (e.greaterThan(self._fileSize)) {
          e = self._fileSize;
        }
        self.getText(s, e).then(resolve, reject);
      });
      self._textCache[b] = promise;
    }
    promise.then(/** @param {{data: string}} r */ function(r) {
      var begin = lStart.subtract(s).toNumber();
      var end = lEnd.subtract(s).toNumber();
      resolve({'data': r['data'].slice(begin, end)});
    });
  });
};

/**
 * @returns {Promise.<{first: hapmap.models.LDItem, last: hapmap.models.LDItem}>}
 */
hapmap.HapmapReader.prototype.getFileBoundaries = function() {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.getFileSize().then(/** @param {goog.math.Long} fileSize */ function(fileSize) {
      var first, last;

      self._getText(0, self._lineBufferSize).then(/** @param {{data:string}} r */ function(r) {
        first = hapmap.models.LDItem.parse(r['data']);
        if (last != undefined) {
          resolve({'first': first, 'last': last});
        }
      }, reject);
      self._getText(fileSize.subtract(goog.math.Long.fromNumber(self._lineBufferSize)), fileSize).then(/** @param {{data:string}} r */ function(r) {
        var lines = r['data'].trim().split('\n');
        last = hapmap.models.LDItem.parse(lines[lines.length - 1]);
        if (first != undefined) {
          resolve({'first': first, 'last': last});
        }
      });
    }, reject);
  });
};

/**
 * @param {goog.math.Long|number} offset
 * @returns {Promise.<hapmap.models.LDItem>}
 */
hapmap.HapmapReader.prototype.getItem = function(offset) {
  var self = this;
  /** @type {function(number): goog.math.Long} */
  var long = goog.math.Long.fromNumber;
  var o = (offset instanceof goog.math.Long) ? offset : long(/** @type {number} */ (offset));
  return new Promise(function(resolve, reject) {
    if (o.lessThanOrEqual(long(0))) {
      self.getFileBoundaries().then(function(r) { resolve(r['first']); }, reject);
      return;
    }
    self.getFileSize().then(
      /** @param {goog.math.Long} size */
      function(size) {
        if (size.lessThanOrEqual(o)) { resolve(null); return; }
        var bufferSize = long(self._lineBufferSize);
        var dif = size.subtract(o);
        if (dif.lessThan(bufferSize)) { bufferSize = dif; }
        self._getText(o, o.add(bufferSize)).then(
          function(r) {
            var lines = r['data'].trim().split('\n', 2);
            if (lines.length < 2) {
              // This means that we have less than one line of text here, which means we
              // need the last item
              self.getFileBoundaries().then(function(r) { resolve(r['last']); }, reject);
              return;
            }
            resolve(hapmap.models.LDItem.parse(lines[1]));
          }, reject);
      }, reject);
  });
};

/**
 * Perform binary search to find the (start/end) offset corresponding to the searched genomic location
 * @param {goog.math.Long} l Left offset
 * @param {goog.math.Long} r Right offset
 * @param {number} search Genomic location (start/end)
 * @param {{first: (undefined|boolean), last: (undefined|boolean)}} [firstOrLast]
 * @returns {Promise.<goog.math.Long>}
 */
hapmap.HapmapReader.prototype.findOffset = function(l, r, search, firstOrLast) {
  /** @type {function(number): goog.math.Long} */
  var long = goog.math.Long.fromNumber;
  var self = this;
  return new Promise(function(resolve, reject) {
    var index;
    if (l.lessThanOrEqual(r)) {
      var m = r.add(l).div(long(2));
      self.getItem(m).then(function (item) {
        if (item === null) {
          resolve(l);
          return;
        }
        if (item['rs1']['start'] == search) {
          if (firstOrLast == undefined || (!firstOrLast['first'] && !firstOrLast['last'])) {
            resolve(index);
            return;
          }
          if (firstOrLast['first']) {
            r = m.subtract(long(1));
          } else if (firstOrLast['last']) {
            l = m.add(long(1));
          }
        } else if (item['rs1']['start'] < search) {
          l = m.add(long(1));
          if (firstOrLast && firstOrLast['first']) {
            // Candidate for the first index of the range
            index = m;
          }
        } else {
          if (firstOrLast && firstOrLast['last']) {
            // Candidate for the last index of the range
            index = m;
          }
          r = m.subtract(long(1));
        }

        if (index == undefined) {
          self.findOffset(l, r, search, firstOrLast).then(resolve, reject);
        } else {
          self.findOffset(l, r, search, firstOrLast).then(
            function(i) {
              if (firstOrLast == undefined || (!firstOrLast['first'] && !firstOrLast['last'])) { resolve(i); }
              else {
                if (firstOrLast['first']) {
                  if (i.lessThan(index)) { resolve(index); }
                  else { resolve(i); }
                } else {
                  if (i.lessThan(index)) { resolve(i); }
                  else { resolve(index); }
                }
              }
            },
            function () { resolve(index); });
        }
      }, reject);
    } else {
      if (firstOrLast) {
        if (firstOrLast['first']) {
          resolve(l);
        } else {
          resolve(l.subtract(long(1)));
        }
      } else { reject('Not found'); }
    }
  });
};

/**
 * @param {goog.math.Long} startOffset
 * @param {goog.math.Long} endOffset
 * @returns {Promise.<Array.<hapmap.models.LDItem>>}
 */
hapmap.HapmapReader.prototype.getItems = function(startOffset, endOffset) {
  var self = this;
  /** @type {function(number): goog.math.Long} */
  var long = goog.math.Long.fromNumber;
  return new Promise(function(resolve, reject) {
    self.getFileSize().then(function(size) {
      self._getText(startOffset, endOffset).then(
        function(r) {
          var lines = r['data'].split('\n');
          var startIndex = 1, endIndex = lines.length - 2;
          if (startOffset.equals(long(0))) {
            startIndex = 0;
          }
          if (endOffset.equals(size) && lines[lines.length - 1] != '') {
            endIndex = lines.length - 1;
          }
          if (endIndex < startIndex) {
            resolve([]);
            return;
          }
          var items = lines.slice(startIndex, endIndex + 1).map(function(line) { return hapmap.models.LDItem.parse(line); });
          resolve(items);
        },
        reject);
    }, reject);

  });
};

/**
 * @param {number} start Genomic location start
 * @param {number} end Genomic location end
 * @returns {Promise.<Array.<hapmap.models.LDItem>>}
 */
hapmap.HapmapReader.prototype.getRange = function(start, end) {
  var self = this;

  /** @type {function(number): goog.math.Long} */
  var long = goog.math.Long.fromNumber;

  /** @type {goog.math.Long} */
  var l = long(0);

  /** @type {goog.math.Long} */
  var r = null;

  /** @type {goog.math.Long} */
  var m = null;

  return new Promise(function(resolve, reject) {
    self.getFileBoundaries().then(/** @param {{first:hapmap.models.LDItem, last:hapmap.models.LDItem}} pair */ function(pair) {
      if (start > pair['last']['rs1']['start'] || end < pair['first']['rs1']['start']) {
        resolve([]);
      }

      self.getFileSize().then(function(size) {
        r = size;
        var startOffset, endOffset;
        var postProcessItems = function(items) {
          if (items.length == 0) { resolve(items); return; }
          // There ase still a few items extra (up to 4-5), because we used a buffer larger than a single item.
          // Because of this, we need to go through this list and eliminate them
          var startIndex = 0;
          while (startIndex < items.length && items[startIndex]['rs1']['start'] < start) {
            ++startIndex;
          }
          var endIndex = items.length;
          while (endIndex >= 1 && items[endIndex - 1]['rs1']['start'] > end) {
            --endIndex;
          }
          resolve(items.slice(startIndex, endIndex));
        };
        self.findOffset(l, r, start, {'first':true}).then(function(i) {
          startOffset = i;
          if (endOffset) {
            self.getItems(startOffset, endOffset).then(postProcessItems, reject);
          }
        }, reject);
        self.findOffset(l, r, end, {'last':true}).then(function(i) {
          endOffset = i.add(long(self._lineBufferSize));
          if (endOffset.greaterThan(size)) { endOffset = size; }
          if (startOffset) {
            self.getItems(startOffset, endOffset).then(resolve, reject).then(postProcessItems, reject);
          }
        }, reject);
      }, reject);

    }, reject);
  })
};


goog.provide('hapmap');

goog.require('hapmap.HapmapReader');
