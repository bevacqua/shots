'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _fs = require('fs');

var _path = require('path');

var _lodash = require('lodash');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _gifencoder = require('gifencoder');

var _gifencoder2 = _interopRequireDefault(_gifencoder);

var _pngJs = require('png-js');

var _pngJs2 = _interopRequireDefault(_pngJs);

var _assignment = require('assignment');

var _assignment2 = _interopRequireDefault(_assignment);

var _pageres = require('pageres');

var _pageres2 = _interopRequireDefault(_pageres);

var _histogram = require('histogram');

var _histogram2 = _interopRequireDefault(_histogram);

var _tmp = require('tmp');

var _tmp2 = _interopRequireDefault(_tmp);

var _gm = require('gm');

var _gm2 = _interopRequireDefault(_gm);

var _bluebird = require('bluebird');

var _child_process = require('child_process');

var _imageDiff = require('image-diff-2');

var _imageDiff2 = _interopRequireDefault(_imageDiff);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var pglob = (0, _bluebird.promisify)(_glob2.default);
var pmkdirp = (0, _bluebird.promisify)(_mkdirp2.default);
var prename = (0, _bluebird.promisify)(_fs.rename);
var pwriteFile = (0, _bluebird.promisify)(_fs.writeFile);
var rsep = new RegExp(_path.sep, 'g');
var rsize = /\d+x\d+/;
var rtimestamp = /\d{14}/;
var timeformat = 'YYYYMMDDHHmmss';

function getStart(pageFiles) {
  var _sortByStamps = sortByStamps(pageFiles);

  var _sortByStamps2 = _slicedToArray(_sortByStamps, 1);

  var last = _sortByStamps2[0];

  return last ? toMoment(last).format(timeformat) : '1800';
}

function sortByStamps(files) {
  return files.sort(function (a, b) {
    return toMoment(b).isAfter(toMoment(a)) ? 1 : -1;
  });
}

function sortBySize(files) {
  return files.sort(function (a, b) {
    return toSize(b) === toSize(a) ? 0 : 1;
  });
}

function sortByDomains(domains, files) {
  return files.sort(function (a, b) {
    return toDomainIndex(b) > toDomainIndex(a) ? 1 : -1;
  });
  function toDomainIndex(file) {
    var slug = domainSlug((0, _path.basename)(file));
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = domains[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var domain = _step.value;

        if (slug.startsWith(domain)) {
          return domains.indexOf(domain);
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    return -1;
  }
}

function toMoment(file) {
  var _ref = rtimestamp.exec((0, _path.basename)(file)) || [];

  var _ref2 = _slicedToArray(_ref, 1);

  var timestamp = _ref2[0];

  return (0, _moment2.default)(timestamp, timeformat);
}

function toSize(file) {
  var _ref3 = rsize.exec((0, _path.basename)(file)) || [];

  var _ref4 = _slicedToArray(_ref3, 1);

  var size = _ref4[0];

  return size;
}

function domainSlug(domain) {
  return domain.replace(/[^a-z0-9]+/ig, '-').replace(/-+/g, '-');
}

function whereDomains(domains) {
  return function (file) {
    var prepared = domainSlug((0, _path.basename)(file));
    return domains.some(function (domain) {
      return prepared.startsWith(domain);
    });
  };
}

function getPageresOpts(pageresUser) {
  var pageresDefaults = {
    crop: true,
    scale: 1,
    sizes: ['1024x768']
  };
  return (0, _assignment2.default)(pageresDefaults, pageresUser);
}

function shots() {
  var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

  var debuglog = (0, _debug2.default)('shots');
  var _options$concurrency = options.concurrency;
  var concurrency = _options$concurrency === undefined ? 6 : _options$concurrency;
  var _options$dest = options.dest;
  var dest = _options$dest === undefined ? _tmp2.default.dirSync().name : _options$dest;
  var userPageresOpts = options.pageres;
  var reverse = options.reverse;
  var site = options.site;
  var sites = options.sites;
  var _options$tolerance = options.tolerance;
  var tolerance = _options$tolerance === undefined ? 95 : _options$tolerance;

  d('dest directory set to: ' + dest);
  var prOpts = getPageresOpts(userPageresOpts);
  var threshold = (100 - tolerance) / 100; // [0..1] where 0=identical,1=different
  var pages = (0, _path.join)(dest, 'pages');
  var screenshots = (0, _path.join)(dest, 'screenshots');
  var diffs = (0, _path.join)(dest, 'diffs');
  var output = (0, _path.join)(dest, 'output');
  var sizes = prOpts.sizes;
  var scale = prOpts.scale;

  var s = sites || site || null;
  var domains = Array.isArray(s) ? s : [s];
  var domainSlugs = domains.map(domainSlug);
  var rglob = function rglob(pattern) {
    return pglob(pattern).then(function (files) {
      return sortByStamps(files.filter(whereDomains(domainSlugs)));
    });
  };

  return Promise.all([d('pmkdirp(pages)', pmkdirp(pages)), d('pmkdirp(screenshots)', pmkdirp(screenshots)), d('pmkdirp(diffs)', pmkdirp(diffs)), d('pmkdirp(output)', pmkdirp(output))]).then(function () {
    return d('rglob(\'' + pages + '/*.html\')', rglob(pages + '/*.html'));
  }).then(function (pageFiles) {
    return Promise.all(domains.map(function (site) {
      return new Promise(function (resolve, reject) {
        var cmd = 'waybackpack ' + site + ' -d ' + pages + ' --start ' + getStart(pageFiles);
        d(cmd);
        (0, _child_process.exec)(cmd, function (err) {
          return err ? reject(err) : resolve();
        });
      });
    }));
  }).then(function () {
    return Promise.all([d('rglob(\'' + pages + '/*.html\')', rglob(pages + '/*.html')), d('rglob(\'' + screenshots + '/*.html.png\')', rglob(screenshots + '/*.html.png'))]);
  }).then(function (_ref5) {
    var _ref6 = _slicedToArray(_ref5, 2);

    var sources = _ref6[0];
    var destinations = _ref6[1];
    return d('shot chunk(sources) and filter, len=' + sources.length, (0, _lodash.chunk)(sources.filter(function (source) {
      return destinations.indexOf((source + '.png').replace('' + pages, '' + screenshots).replace('.html.png', '-' + sizes[0] + '.html.png')) === -1;
    }), Math.ceil(concurrency / sizes.length)));
  }).then(function (chunks) {
    return chunks.reduce(function (p, chunk, i) {
      return p.then(function () {
        return d('reducing chunk ' + (i + 1) + '/' + chunks.length + ', len=' + chunk.length, chunk).reduce(function (ctx, source) {
          return d('adding pageres src ' + source + ', sizes=' + sizes, ctx.src(source, sizes));
        }, d('creating pageres instance', new _pageres2.default(prOpts))).dest(screenshots).run().then(function (streams) {
          return d('renaming streams, len=' + streams.length, Promise.all(streams.map(function (stream) {
            return d('renaming ' + stream.filename, prename((0, _path.join)(screenshots, stream.filename), (0, _path.join)(screenshots, stream.filename.replace(pages.replace(rsep, '!') + '!', '').replace(/\.html(-[\dx]+)[\w-]*\.png$/, '$1.html.png'))));
          })));
        });
      });
    }, d('shot chunk reducer, len=' + chunks.length, Promise.resolve()));
  }).then(function () {
    return d('rglob(\'' + screenshots + '/*.html.png\')', rglob(screenshots + '/*.html.png'));
  }).then(function (screenshotFiles) {
    return d('sortBySize(sortByDomains(domainSlugs, screenshotFiles))', sortBySize(sortByDomains(domainSlugs, screenshotFiles)).reverse().map(function (screenshot, i) {
      return [screenshot, screenshotFiles[i - 1], screenshot.replace(screenshots, diffs)];
    }).slice(1));
  }).then(function (comparisions) {
    return d('diff chunk(comparisions, concurrency), len=' + comparisions.length, (0, _lodash.chunk)(comparisions, concurrency));
  }).then(function (chunks) {
    return chunks.reduce(function (p, chunk, i) {
      return p.then(function (ignores) {
        return Promise.all(d('reducing chunk ' + (i + 1) + '/' + chunks.length + ', ignore=' + ignores.length, chunk).map(function (_ref7, i) {
          var _ref8 = _slicedToArray(_ref7, 3);

          var actualImage = _ref8[0];
          var expectedImage = _ref8[1];
          var diffImage = _ref8[2];
          return new Promise(function (resolve, reject) {
            return d('diffing image reel ' + (i + 1) + '/' + chunk.length + ' [\n    actual ' + actualImage + '\n    expect ' + expectedImage + '\n    diff   ' + diffImage + ' ]', (0, _imageDiff2.default)({ actualImage: actualImage, expectedImage: expectedImage, diffImage: diffImage, threshold: threshold }, function (err, same) {
              if (err) {
                reject(err);
                return;
              }
              if (same) {
                d('diffed ' + (i + 1) + '/' + chunk.length + ' ' + actualImage + ' [DUPE]');
                resolve(false);
                return;
              }
              (0, _histogram2.default)(actualImage, function (err, data) {
                return err ? d('diffed ' + (i + 1) + '/' + chunk.length + ' ' + actualImage + ' [ERR]', reject(err)) : data.colors.rgb > 32 ? d('diffed ' + (i + 1) + '/' + chunk.length + ' ' + actualImage + ' [PASS]', resolve(true)) : d('diffed ' + (i + 1) + '/' + chunk.length + ' ' + actualImage + ' [BLANK]', resolve(false));
              });
            }));
          }).then(function (passed) {
            return passed || ignores.push(actualImage);
          });
        })).then(function () {
          return ignores;
        });
      });
    }, d('diff chunk reducer, len=' + chunks.length, Promise.resolve([])));
  }).then(function (ignores) {
    return d('rglob(\'' + screenshots + '/*.html.png\'), ignore=' + ignores.length, rglob(screenshots + '/*.html.png')).then(function (screenshotFiles) {
      return [screenshotFiles.filter(function (screenshot) {
        return ignores.indexOf(screenshot) === -1;
      }), screenshotFiles, ignores];
    });
  }).then(function (_ref9) {
    var _ref10 = _slicedToArray(_ref9, 3);

    var relevant = _ref10[0];
    var all = _ref10[1];
    var ignores = _ref10[2];

    d('found ' + relevant.length + '/' + all.length + ' relevant screenshots (' + ignores.length + ' ignored)');
    var buckets = sizes.map(function (size) {
      return [size, sortByStamps(relevant.filter(function (file) {
        return toSize(file) === size;
      })).reverse()];
    });
    if (reverse) {
      buckets.forEach(function (_ref11) {
        var _ref12 = _slicedToArray(_ref11, 2);

        var size = _ref12[0];
        var src = _ref12[1];
        return src.reverse();
      });
    }
    return Promise.all(buckets.map(function (_ref13) {
      var _ref14 = _slicedToArray(_ref13, 2);

      var size = _ref14[0];
      var src = _ref14[1];
      return new Promise(function (resolve, reject) {
        var _d;

        return (_d = d('creating ' + size + ' spritesheet', (0, _gm2.default)())).append.apply(_d, _toConsumableArray(src).concat([true])).write((0, _path.join)(output, size + '.png'), function (err) {
          return err ? reject(err) : resolve();
        });
      });
    })).then(function () {
      return Promise.all(buckets.map(function (_ref15) {
        var _ref16 = _slicedToArray(_ref15, 2);

        var size = _ref16[0];
        var src = _ref16[1];
        return d('creating ' + size + ' gif', Promise).all(src.map(function (file) {
          return new Promise(function (resolve) {
            return _pngJs2.default.decode(file, function (pixels) {
              return resolve(pixels);
            });
          });
        })).then(function (frames) {
          var rec = new (Function.prototype.bind.apply(_gifencoder2.default, [null].concat(_toConsumableArray(size.split('x').map(function (x) {
            return x * scale;
          })))))();
          rec.start();
          rec.setRepeat(0);
          rec.setDelay(200);
          frames.forEach(function (frame) {
            return rec.addFrame(frame);
          });
          rec.finish();
          return rec.out.getData();
        }).then(function (image) {
          return pwriteFile((0, _path.join)(output, size + '.gif'), image);
        });
      }));
    });
  }).then(function () {
    return d('done.', dest);
  }).catch(function (reason) {
    return d('ERR! ' + reason, Promise.reject(reason));
  });

  function d(message, result) {
    debuglog(message);
    return result;
  }
}

exports.default = shots;

