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

var EventEmitter = require('events').EventEmitter;
var childprocess = require('child_process');
var fs = require('fs');

var Mtr = require('../lib/mtr').Mtr;

// Mock childprocess
exports.getEmitter = function(filePath, returnError) {
  returnError = returnError || false;
  var data = fs.readFileSync(filePath, 'utf8').toString();

  function get() {
    var emitter, split;

    emitter = new EventEmitter();
    data = data.replace(/^\s+|\s+$/g, '');
    split = data.split(/\n+/);

    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();

    setTimeout(function() {
      split.forEach(function(line) {
        if (!returnError) {
          emitter.stdout.emit('data', line + '\n');
        }
        else {
          emitter.stderr.emit('data', line + '\n');
        }
      });

      if (!returnError) {
        emitter.emit('exit', 0);
      }
      else {
        emitter.emit('exit', 1);
      }
    }, 100);

    return emitter;
  }

  return get;
};

exports['test_error_invalid_target'] = function(test, assert) {
  var mtr = new Mtr('8.8.8.8');
  Mtr.prototype._spawn = exports.getEmitter('./tests/fixtures/error_output_failed_to_resolve_hostname.txt', true);
  mtr.traceroute();

  mtr.on('error', function(err) {
    assert.match(err.message, /Failed to resolve host/);
    test.finish();
  });

};

exports['test_traceroute_route_1'] = function(test, assert) {
  var hopCount, splitHops, hopNumber, mtr;

  hopCount = 0;
  splitHops = {};
  hopNumber = 0;

  mtr = new Mtr('127.0.0.1', {});
  Mtr.prototype._spawn = exports.getEmitter('./tests/fixtures/normal_output_127.0.0.1.txt');
  mtr.traceroute();

  mtr.on('hop', function(hop) {
    hopCount++;
    hopNumber = hop.number;

    if (!splitHops[hopNumber]) {
      splitHops[hopNumber] = 0;
    }

    splitHops[hopNumber] = splitHops[hopNumber] + 1;

    if (hopNumber === 0) {
      assert.equal(hop.number, 0);
      assert.equal(hop.ip, '127.0.0.1');
      assert.deepEqual(hop.rtts, [0.087, 0.075, 0.077, 0.08, 0.076, 0.075,
                                  0.07, 0.086, 0.076, 0.084]);
    }
    else if (hopNumber === 1) {
      assert.equal(hop.number, 1);
      assert.equal(hop.ip, '127.0.0.1');
      assert.deepEqual(hop.rtts, [0.028]);
    }
  });

  mtr.on('end', function() {
    assert.equal(hopNumber, 1);
    test.finish();
  });
};

exports['test_traceroute_route_2'] = function(test, assert) {
  var hopCount, splitHops, hopNumber, mtr;

  hopCount = 0;
  splitHops = {};
  hopNumber = 0;

  mtr = new Mtr('8.8.8.8', {});
  Mtr.prototype._spawn = exports.getEmitter('./tests/fixtures/normal_output_to_8.8.8.8.txt');
  mtr.traceroute();

  mtr.on('hop', function(hop) {
    hopCount++;
    hopNumber = hop.number;

    if (!splitHops[hopNumber]) {
      splitHops[hopNumber] = 0;
    }

    splitHops[hopNumber] = splitHops[hopNumber] + 1;

    if (hopNumber === 0) {
      assert.equal(hop.number, 0);
      assert.equal(hop.ip, '50.56.129.162');
      assert.deepEqual(hop.rtts, [1.011, 0.739, 0.824, 0.737, 0.743, 0.648,
                                  0.799, 0.725, 0.724, 0.787]);
    }
    else if (hopNumber === 14) {
      assert.equal(hop.number, 14);
      assert.equal(hop.ip, '8.8.8.8');
      assert.deepEqual(hop.rtts, [52.775]);
    }
  });

  mtr.on('end', function() {
    assert.equal(hopNumber, 14);
    test.finish();
  });
};

exports['test_traceroute_route_with_hostnames'] = function(test, assert) {
  var mtr;

  mtr = new Mtr('8.8.8.8', {});
  Mtr.prototype._spawn = exports.getEmitter('./tests/fixtures/normal_output_to_8.8.8.8_with_hostnames.txt');
  mtr.traceroute();

  mtr.on('hop', function(hop) {
    if (hop.number === 14) {
      assert.equal(hop.number, 14);
      assert.equal(hop.hostname, 'google-public-dns-a.google.com');
      assert.equal(hop.ip, '8.8.8.8');
    }
  });

  mtr.on('end', function() {
    test.finish();
  });
};
