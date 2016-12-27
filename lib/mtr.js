/**
 *  Copyright Tomaz Muraus
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

var childprocess = require('child_process');
var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function Mtr(target, options) {
  EventEmitter.call(this);

  options = options || {};
  this._target = target;
  this._options = options;

  this._packetLen = options.packetLen || 60;
  this._resolveDns = options.resolveDns || false;
  this._reportCycles = options.reportCycles;

  if (net.isIP(target) === 4) {
    this._addressType = 'ipv4';
  }
  else if (net.isIP(target) === 6) {
    this._addressType = 'ipv6';
  }
  else {
    throw new Error('Target is not a valid IPv4 or IPv6 address');
  }
}

util.inherits(Mtr, EventEmitter);

/**
 * Return EventEmitter instance which emitts 'hop' event for every hop.
 *
 * Each 'hop' event contains a data object with the following keys:
 * ip, number, rtts.
 */
Mtr.prototype.traceroute = function() {
  var self = this;

  process.nextTick(function() {
    var emitter = self._run(self._target);

    emitter.on('end', function() {
      self.emit('end');
    });

    emitter.on('hop', function(hop) {
      self.emit('hop', hop);
    });

    emitter.on('error', function(err) {
      self.emit('error', err);
    });
  });
};

Mtr.prototype._run = function(target) {
  var self = this, args, child, emitter, stdoutBuffer, stderrBuffer;

  args = [];

  if (this._addressType === 'ipv4') {
    args.push('-4');
  }
  else {
    args.push('-6');
  }

  if (!this._resolveDns) {
    args.push('--no-dns');
  }

  args.push('--raw');

  if (this._reportCycles) {
    args.push('--report-cycles');
    args.push(this._reportCycles);
  }

  if (this._packetLen) {
    args.push('--psize');
    args.push(this._packetLen);
  }

  args.push(target);

  child = this._spawn('mtr', args);
  emitter = new EventEmitter();

  stdoutBuffer = '';
  stderrBuffer = '';

  child.stdout.on('data', function(chunk) {
    stdoutBuffer += chunk;
  });

  child.stderr.on('data', function(chunk) {
    stderrBuffer += chunk;
  });

  child.on('exit', function(code) {
    var err, result;

    if (code === 0) {
      result = self._parseResult(stdoutBuffer);

      result.forEach(function(hop) {
        emitter.emit('hop', hop);
      });

      emitter.emit('end');
    }
    else {
      err = new Error('Error: ' + stderrBuffer);
      emitter.emit('error', err);
    }
  });

  return emitter;
};

Mtr.prototype._spawn = function(cmd, args) {
  var child = childprocess.spawn(cmd, args);
  return child;
};

Mtr.prototype._parseResult = function(output) {
  var lines, line, i, split, type, hopNumber, data, value, result, tempResult,
      maxHopNumber = 0, item, seenTarget = false, targetHopNumber = null;

  lines = output.split('\n');

  tempResult = {};
  result = [];

  for (i = 0; i < lines.length; i++) {
    line = lines[i];
    line = line.replace(/^\s+|\s+$/g, '');
    split = line.split(/\s+/);

    // osx raw format for p also has seqnum after data
    if (split.length < 3) {
      // Invalid line
      continue;
    }

    type = split[0];
    hopNumber = parseInt(split[1], 10);
    data = split[2];

    if (seenTarget && hopNumber > targetHopNumber) {
      // Indicate that we have seen the target and we can ignore all the hops
      // with the same ip beyond this one.
      continue;
    }

    if (hopNumber > maxHopNumber) {
      maxHopNumber = hopNumber;
    }

    if (!tempResult.hasOwnProperty(hopNumber)) {
      tempResult[hopNumber] = {
        'ip': null,
        'hostname': null,
        'number': hopNumber,
        'rtts': []
      };
    }

    if (type === 'h') {
      tempResult[hopNumber].ip = data;

      if (data === this._target) {
        seenTarget = true;
        targetHopNumber = hopNumber;
      }
    }
    else if (type === 'p') {
      value = (parseInt(data, 10) / 1000);
      tempResult[hopNumber].rtts.push(value);
    }
    else if (type === 'd') {
      tempResult[hopNumber].hostname = data;
    }
    else {
      // Invalid line
      continue;
    }
  }

  // Sort the result based on the hop number in ascending order.
  for (i = 0; i <= maxHopNumber; i++) {
    item = tempResult[i];

    if (!item) {
      // Hops for which we never got a response.
      item = {
        'ip': null,
        'hostname': null,
        'number': i,
        'rtts': []
      };
    }

    // Be consistent with traceroute and use 1-based hop number
    item.number++;

    result.push(item);
  }

  return result;
};

exports.Mtr = Mtr;
